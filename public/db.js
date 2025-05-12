import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import mysql from 'mysql2';

const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: {
        ca: fs.readFileSync(process.env.DB_SSL_CA_PATH)
    }
})

connection.connect((err) => {
    if (err) {
        console.error('MySQL connection error:', err);
        return;
    }
    console.log('Connected to MySQL database.');
});

export default connection;