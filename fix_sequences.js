require('dotenv').config({ path: __dirname + '/.env' });
const mysql = require('mysql2');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true
});

async function fixSequences() {
    try {
        console.log('Fixing sequences (dropping standard tables and recreating as SEQUENCE objects)...');
        
        const sequences = [
            'seq_merchant',
            'seq_ticket',
            'seq_transit',
            'seq_employee',
            'seq_consignment'
        ];

        for (const seq of sequences) {
            // First drop it (whether it's a table or a sequence, DROP TABLE works in MariaDB to drop both, but DROP SEQUENCE is safer if it IS a sequence)
            try {
                await pool.promise().query(`DROP TABLE IF EXISTS ${seq}`);
            } catch (e) {
                // Ignore errors if it's not a table
            }
            try {
                await pool.promise().query(`DROP SEQUENCE IF EXISTS ${seq}`);
            } catch (e) {
                // Ignore errors
            }
            
            // Recreate as sequence
            await pool.promise().query(`CREATE SEQUENCE IF NOT EXISTS ${seq} START WITH 1000 INCREMENT BY 1 NOCACHE`);
            console.log(`✅ Recreated sequence: ${seq}`);
        }

        console.log('All sequences fixed successfully!');
    } catch (error) {
        console.error('Error fixing sequences:', error);
    } finally {
        process.exit();
    }
}

fixSequences();
