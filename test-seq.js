require('dotenv').config();
const mysql = require('mysql2');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

async function test() {
    try {
        const [rows] = await pool.promise().query("SHOW FULL TABLES LIKE 'seq_%'");
        console.log("Tables like seq_:", rows);
        
        const [seqs] = await pool.promise().query("SELECT * FROM information_schema.tables WHERE table_name = 'seq_merchant'");
        console.log("Info schema:", seqs);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
test();
