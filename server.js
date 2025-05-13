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

io.on('connection', (socket) => {
    console.log('a user connected: ' + socket.id);

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