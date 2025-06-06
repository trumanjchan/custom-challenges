import express from 'express';
import bcrypt from "bcrypt";
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Server } from 'socket.io';
import { db, connectToDB } from './public/db.js';

const app = express();
const server = createServer(app);
const io = new Server(server);
const port = 3000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const saltRounds = 10;


(async () => {
    try {
        await connectToDB();
        await db.promise().query("SELECT 1");

        function getTimestamp() {
            const time = new Date().toLocaleString('en-US', {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false
            });
            const [date, timePart] = time.split(', ');
            const [month, day, year] = date.split('/');
            const timestamp = `${year}-${month}-${day} ${timePart}`;

            return timestamp;
        }

        app.use(express.static('public'));

        app.get('/', (req, res) => {
            res.sendFile(join(__dirname, 'public/index.html'));
        });

        app.get('/all-users', (req, res) => {
            db.query(`SELECT name, is_online FROM users ORDER BY is_online DESC, id ASC;`, (err, results) => {
                res.json(results);
            });
        });

        app.get('/:nickname/challenges', async (req, res) => {
            try {
                const [userResults] = await db.promise().query(`SELECT id FROM users WHERE name = ?`, [req.params.nickname]);
                let userId = userResults[0].id;

                const [userChallenges] = await db.promise().query(`SELECT * FROM challenge_user WHERE user_id = ?`, [userId]);
                let challengeIds = userChallenges.map(row => row.challenge_id);

                const fullData = await Promise.all(
                    challengeIds.map(async (challengeId) => {
                        const [challengeResults] = await db.promise().query(`SELECT * FROM challenges WHERE id = ?`, [challengeId]);

                        let id = challengeResults[0].id;
                        let title = challengeResults[0].title;
                        let activity = challengeResults[0].activity;
                        let time = challengeResults[0].time;
                        const [playerResults] = await db.promise().query(`SELECT u.name, cu.role FROM challenge_user cu JOIN users u ON cu.user_id = u.id WHERE cu.challenge_id = ?`, [id]);
                        const [inProgress] = await db.promise().query(`SELECT name, time FROM in_progress WHERE challenge_id = ?`, [challengeId]);

                        return { title, activity, time, players: playerResults, inProgress };
                    })
                );

                res.json(fullData);
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: 'Something went wrong' });
            }
        });

        io.on('connection', (socket) => {
            socket.emit('display-all-users');
            console.log('a user connected');

            socket.on('user', (data) => {
                var bool = false;

                db.query(`SELECT * FROM users WHERE name = ?`, [data.nickname], (err, results) => {
                    const nickname = data.nickname;
                    const normalized = nickname.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
                    const isAscii = /^[A-Za-z0-9\s\-]+$/.test(normalized);
                    const byteLength = new TextEncoder().encode(nickname).length;

                    if ((nickname === nickname.trim()) && (normalized && isAscii) && (nickname.length <= 20) && (byteLength <= 80)) {
                        socket.nickname = nickname;

                        if (results.length > 0) {
                            bool = bcrypt.compareSync(data.password, results[0].password);
                            if (bool) {
                                db.query(`UPDATE users SET is_online = ? WHERE name = ?`, [true, socket.nickname]);
                                socket.emit('logged-in', socket.nickname);
                                socket.broadcast.emit('display-all-users');
                                io.emit('server-announcement', `+ ${socket.nickname} signed in.`);
                                console.log(`${socket.nickname} signed in!`);
                            } else {
                                socket.emit('incorrect-login');
                            }
                        } else {
                            const hash = bcrypt.hashSync(data.password, saltRounds);
                            db.query(`INSERT INTO users (name, password) VALUES (?, ?)`, [socket.nickname, hash], (err) => {
                                if (err) {
                                    console.error('Error inserting user:', err);
                                    return
                                } else {
                                    db.query(`UPDATE users SET is_online = ? WHERE name = ?`, [true, socket.nickname]);
                                    socket.emit('logged-in', socket.nickname);
                                    socket.broadcast.emit('display-all-users');
                                    io.emit('server-announcement', `+ ${socket.nickname} signed up.`);
                                    console.log(`${socket.nickname} signed up!`);
                                }
                            })
                        }
                    }
                });
            });

            socket.on('challenge', async (data) => {
                try {
                    const [opponentId] = await db.promise().query(`SELECT * FROM users WHERE name = ?`, [data.opponentInput]);
                    if (opponentId[0].id && data.opponentInput !== data.poster) {
                        const [challengeId] = await db.promise().query(`INSERT INTO challenges (title, activity, time) VALUES (?, ?, ?)`, [data.titleInput, data.activityInput, getTimestamp()]);

                        const [posterId] = await db.promise().query(`SELECT * FROM users WHERE name = ?`, [data.poster]);

                        await db.promise().query(`INSERT INTO challenge_user (user_id, challenge_id, role) VALUES (?, ?, 'poster')`, [posterId[0].id, challengeId.insertId]);
                        await db.promise().query(`INSERT INTO challenge_user (user_id, challenge_id, role) VALUES (?, ?, 'opponent')`, [opponentId[0].id, challengeId.insertId]);

                        socket.emit('display-my-challenges');
                        socket.broadcast.emit('display-my-challenges');
                        socket.emit('create-challenge-success');
                        io.emit('server-announcement', `${data.poster} challenged ${data.opponentInput} to ${data.titleInput}!`);
                        console.log("inserted challenge: " + data.titleInput);
                        console.log("inserted challenge_user for poster " + data.poster);
                        console.log("inserted challenge_user for opponent " + data.opponentInput);
                    } else {
                        socket.emit('create-challenge-error', "Challenging yourself is not a feature of this app. Challenge and compete with your friend!");
                        console.log("Challenging yourself is not a feature of this app. Challenge and compete with your friend!");
                    }
                } catch (err) {
                    socket.emit('create-challenge-error', "Please enter a valid opponent username!");
                    console.log("Please enter a valid opponent username!");
                }
            })

            socket.on('challenge-done', async (data) => {
                try {
                    const [challengeId] = await db.promise().query(`SELECT id FROM challenges WHERE title = ?`, [data.challengeTitle]);

                    await db.promise().query(`INSERT INTO in_progress (name, time, challenge_id) VALUES (?, ?, ?)`, [data.nick, getTimestamp(), challengeId[0].id]);
                    socket.emit('display-my-challenges');
                    socket.broadcast.emit('display-my-challenges');

                    const [complete] = await db.promise().query(`SELECT * FROM in_progress WHERE challenge_id = ?`, [challengeId[0].id]);
                    if (complete.length === 2) {
                        await db.promise().query(`DELETE FROM challenges WHERE title = ?`, [data.challengeTitle]);
                        await db.promise().query(`DELETE FROM in_progress WHERE challenge_id = ?`, [challengeId]);
                        io.emit('server-announcement', `${data.nick} completed ${data.challengeTitle}! Challenge complete.`);
                        console.log(`${data.nick} completed ${data.challengeTitle}! Challenge complete.`);
                    } else {
                        io.emit('server-announcement', `${data.nick} completed ${data.challengeTitle}! Challenge still exists.`);
                        console.log(`${data.nick} completed ${data.challengeTitle}! Challenge still exists.`);
                    }
                } catch (err) {
                    console.log("Error with challenge-done on server!")
                }
            })

            socket.on('delete-account', async (nick) => {
                try {
                    const [myId] = await db.promise().query(`SELECT id FROM users WHERE name = ?`, [nick]);
                    const [challenge_ids] = await db.promise().query(`SELECT challenge_id FROM challenge_user WHERE user_id = ?`, [myId[0].id]);

                    for (const c of challenge_ids) {
                        await db.promise().query(`DELETE FROM challenges WHERE id = ?`, [c.challenge_id]);
                    }

                    await db.promise().query(`DELETE FROM users WHERE name = ?`, [nick]);
                    socket.emit('reload');
                    socket.broadcast.emit('display-my-challenges');
                    io.emit('server-announcement', `${nick} deleted their account!`);
                    console.log(`${nick} deleted their account!`);
                } catch (err) {
                    console.log("Error when deleting " + nick + ": " + err);
                }
            });

            socket.on('disconnect', () => {
                console.log('a user disconnected');

                if (socket.nickname) {
                    db.query(`UPDATE users SET is_online = ? WHERE name = ?`, [false, socket.nickname]);
                    socket.broadcast.emit('display-all-users');
                    io.emit('server-announcement', `- ${socket.nickname}`);
                    console.log(`- ${socket.nickname}`);
                }
            });
        });

        server.listen(port, () => {
            console.log(`server running on port ${port}`);
        });
    } catch (err) {
        console.error('Failed to start server due to DB error:', err);
        process.exit(1);
    }
})();