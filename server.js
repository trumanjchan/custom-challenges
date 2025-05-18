import express from 'express';
import bcrypt from "bcrypt";
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Server } from 'socket.io';
import db from './public/db.js';

const app = express();
const server = createServer(app);
const io = new Server(server);
const port = 3000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const saltRounds = 10;


app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'public/index.html'));
});

app.get('/all-users', (req, res) => {
    db.query(`SELECT name FROM users ORDER BY id ASC`, (err, results) => {
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
                const [playerResults] = await db.promise().query(`SELECT u.name, cu.role FROM challenge_user cu JOIN users u ON cu.user_id = u.id WHERE cu.challenge_id = ?`, [id]);
                const [inProgress] = await db.promise().query(`SELECT name FROM in_progress WHERE challenge_id = ?`, [challengeId]);

                return { title, activity, players: playerResults, inProgress };
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
    console.log('a user connected: ' + socket.id);

    socket.on('user', (data) => {
        var bool = false;

        db.query(`SELECT * FROM users WHERE name = ?`, [data.nickname], (err, results) => {
            const nickname = data.nickname;
            const normalized = nickname.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
            const isAscii = /^[A-Za-z0-9\s\-]+$/.test(normalized);
            const byteLength = new TextEncoder().encode(nickname).length;

            if ((nickname === nickname.trim()) && (normalized && isAscii) && (nickname.length <= 20) && (byteLength <= 80)) {
                if (results.length > 0) {
                    bool = bcrypt.compareSync(data.password, results[0].password);
                    if (bool) {
                        socket.emit('logged-in', nickname);
                        console.log(`${nickname} signed in!`);
                    } else {
                        socket.emit('incorrect-login');
                    }
                } else {
                    const hash = bcrypt.hashSync(data.password, saltRounds);
                    db.query(`INSERT INTO users (name, password) VALUES (?, ?)`, [nickname, hash], (err) => {
                        if (err) {
                            console.error('Error inserting user:', err);
                            return
                        } else {
                            socket.emit('logged-in', nickname);
                            socket.broadcast.emit('display-all-users');
                            console.log(`Added ${nickname}, and logged in!`);
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
                const [challengeId] = await db.promise().query(`INSERT INTO challenges (title, activity) VALUES (?, ?)`, [data.titleInput, data.activityInput]);

                const [posterId] = await db.promise().query(`SELECT * FROM users WHERE name = ?`, [data.poster]);

                await db.promise().query(`INSERT INTO challenge_user (user_id, challenge_id, role) VALUES (?, ?, 'poster')`, [posterId[0].id, challengeId.insertId]);
                await db.promise().query(`INSERT INTO challenge_user (user_id, challenge_id, role) VALUES (?, ?, 'opponent')`, [opponentId[0].id, challengeId.insertId]);

                socket.emit('display-my-challenges');
                socket.broadcast.emit('display-my-challenges');
                console.log("inserted challenge: " + data.titleInput);
                console.log("inserted challenge_user for poster " + data.poster);
                console.log("inserted challenge_user for opponent " + data.opponentInput);
            } else {
                console.log("Challenging yourself is not a feature of this app. Challenge and compete with your friend!");
                let msg = "Challenging yourself is not a feature of this app. Challenge and compete with your friend!";
                socket.emit('create-challenge-error', msg);
            }
        } catch (err) {
            console.log("Please enter a valid opponent username!");
            let msg = "Please enter a valid opponent username!";
            socket.emit('create-challenge-error', msg);
        }
    })

    socket.on('challenge-done', (data) => {
        db.query(`SELECT id FROM challenges WHERE title = ?`, [data.challengeTitle], (err, results) => {
            const challengeId = results[0].id;
            db.query(`SELECT id FROM users WHERE name = ?`, [data.nick], (err, results) => {
                const myId = results[0].id;

                db.query(`INSERT INTO in_progress (name, challenge_id) VALUES (?, ?)`, [data.nick, challengeId]);

                socket.emit('display-my-challenges');
                socket.broadcast.emit('display-my-challenges');

                db.query(`SELECT * FROM in_progress WHERE challenge_id = ?`, [challengeId], (err, results) => {
                    if (results.length === 2) {
                        db.query(`DELETE FROM challenges WHERE title = ?`, [data.challengeTitle]);
                        db.query(`DELETE FROM in_progress WHERE challenge_id = ?`, [challengeId]);
                        console.log(`${data.nick} completed ${data.challengeTitle}! Challenge complete. Deleted.`);
                    } else {
                        console.log(`${data.nick} completed ${data.challengeTitle}! Challenge still exists.`);
                    }
                });
            });
        });
    })

    socket.on('disconnect', () => {
        console.log('user disconnected: ' + socket.id);
    });
});

server.listen(port, () => {
    console.log(`server running at http://localhost:${port}`);
});