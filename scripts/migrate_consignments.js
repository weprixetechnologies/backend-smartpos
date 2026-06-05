require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    try {
        console.log('Adding relate_badge to consignments...');
        await pool.query('ALTER TABLE consignments ADD COLUMN relate_badge VARCHAR(100) DEFAULT NULL;');
        console.log('Done.');
    } catch (err) {
        console.error('Error (or column already exists):', err.message);
    } finally {
        await pool.end();
    }
}

run();
