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


const createUsersTableSQL = `
  CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(20) UNIQUE NOT NULL,
    password INT(4) NOT NULL
  );
`;
db.query(createUsersTableSQL, (err) => {
    if (err) {
        console.error('Error creating users table:', err);
    } else {
        console.log('Users table confirmed.');
    }
});

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'public/index.html'));
});

io.on('connection', (socket) => {
    console.log('a user connected: ' + socket.id);

    socket.on('user', (data) => {
        console.log(data);
        
        db.query(`SELECT * FROM users WHERE name = ? AND password = ?`, [data.nickname, data.password], (err, results) => {
            console.log(results);

            if (results.length > 0) {
                socket.emit('logged-in');
                console.log('User signed in!')
            } else {
                db.query(`INSERT INTO users (name, password) VALUES (?, ?)`, [data.nickname, data.password], (err, results) => {
                    if (err) {
                        console.error('Error inserting user:', err);
                        return
                    } else {
                        socket.emit('logged-in');
                        console.log('Added user, and logged in!');
                    }
                })
            }
        });
    });

    socket.on('disconnect', () => {
        console.log('user disconnected: ' + socket.id);
    });
});

server.listen(port, () => {
    console.log(`server running at http://localhost:${port}`);
});