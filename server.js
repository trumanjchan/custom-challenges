import express from 'express';
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

                return { title, activity, players: playerResults };
            })
        );

        res.json(fullData);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Something went wrong' });
    }
});

io.on('connection', (socket) => {
    console.log('a user connected: ' + socket.id);
    socket.emit('display-all-users');

    socket.on('user', (data) => {
        console.log(data);
        
        db.query(`SELECT * FROM users WHERE name = ? AND password = ?`, [data.nickname, data.password], (err, results) => {
            console.log(results);

            if (results.length > 0) {
                socket.emit('logged-in', data.nickname);
                console.log('User signed in!')
            } else {
                db.query(`INSERT INTO users (name, password) VALUES (?, ?)`, [data.nickname, data.password], (err, results) => {
                    if (err) {
                        console.error('Error inserting user:', err);
                        return
                    } else {
                        socket.broadcast.emit('display-all-users');
                        socket.emit('logged-in', data.nickname);
                        console.log('Added user, and logged in!');
                    }
                })
            }
        });
    });

    socket.on('challenge', (data) => {
        db.query(`INSERT INTO challenges (title, activity) VALUES (?, ?)`, [data.title, data.challenge], (err, results) => {
            if (err) {
                console.error('Error inserting challenges:', err);
                return
            } else {
                console.log('Added challenge!');

                const challengeId = results.insertId;
                db.query(`SELECT * FROM users WHERE name = ?`, [data.poster], (err, results) => {
                    const poster = results[0].id;
                    console.log(poster);

                    db.query(`SELECT * FROM users WHERE name = ?`, [data.opponent], (err, results) => {
                        const opponent = results[0].id;
                        console.log(opponent)

                        db.query(`INSERT INTO challenge_user (user_id, challenge_id, role) VALUES (?, ?, 'poster');`, [poster, challengeId], (err, results) => {
                            if (err) {
                                console.error('Error inserting poster_challenge:', err);
                                return
                            } else {
                                console.log('Added poster_challenge!');

                                db.query(`INSERT INTO challenge_user (user_id, challenge_id, role) VALUES (?, ?, 'opponent');`, [opponent, challengeId], (err, results) => {
                                    if (err) {
                                        console.error('Error inserting opponent_challenge:', err);
                                        return
                                    } else {
                                        console.log('Added opponent_challenge!');
                                    }
                                });
                            }
                        });
                    });
                });
            }
        });
    })

    socket.on('disconnect', () => {
        console.log('user disconnected: ' + socket.id);
    });
});

server.listen(port, () => {
    console.log(`server running at http://localhost:${port}`);
});