import dotenv from 'dotenv';
dotenv.config();
import mysql from 'mysql2';

export const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
	ssl: {
    	minVersion: 'TLSv1.2'
    }
})

export const connectToDB = () => {
	return new Promise((resolve, reject) => {
		db.connect(err => {
			if (err) {
				console.error('MySQL connection failed:', err);
				return reject(err);
			}
			
			console.log('Connected to MySQL database.');

			const createUsersTableSQL = `
				CREATE TABLE IF NOT EXISTS users (
					id INT AUTO_INCREMENT PRIMARY KEY,
					name VARCHAR(20) CHARACTER SET utf8mb4 UNIQUE NOT NULL,
					password VARCHAR(60) NOT NULL,
					is_online BOOLEAN DEFAULT FALSE NOT NULL
				);
			`;
			db.query(createUsersTableSQL, (err) => {
				if (err) {
					console.error('Error creating users table:', err);
				} else {
					console.log('Users table confirmed.');
				}
			});

			const createChallengesTableSQL = `
				CREATE TABLE IF NOT EXISTS challenges (
					id INT AUTO_INCREMENT PRIMARY KEY,
					title VARCHAR(32) NOT NULL,
					activity VARCHAR(64) NOT NULL,
					time TIMESTAMP
				);
			`;
			db.query(createChallengesTableSQL, (err) => {
				if (err) {
					console.error('Error creating challenges table:', err);
				} else {
					console.log('Challenges table confirmed.');
				}
			});

			const createChallengeUserTableSQL = `
				CREATE TABLE IF NOT EXISTS challenge_user (
					user_id INT NOT NULL,
					challenge_id INT NOT NULL,
					role ENUM('poster', 'opponent') NOT NULL,
					PRIMARY KEY (user_id, challenge_id),
					FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
					FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE
				);
			`;
			db.query(createChallengeUserTableSQL, (err) => {
				if (err) {
					console.error('Error creating challenge_user table:', err);
				} else {
					console.log('Challenge_user table confirmed.');
				}
			});

			const createInProgressTableSQL = `
				CREATE TABLE IF NOT EXISTS in_progress (
					name VARCHAR(20) CHARACTER SET utf8mb4 NOT NULL,
					time TIMESTAMP,
					challenge_id INT NOT NULL,
					FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE
				);
			`;
			db.query(createInProgressTableSQL, (err) => {
				if (err) {
					console.error('Error creating in_progress table:', err);
				} else {
					console.log('in_progress table confirmed.');
				}
			});

			resolve();
		});
	});
};

export default db;