const mysql = require('mysql2/promise');

async function run() {
    const conn = await mysql.createConnection({
        host: '127.0.0.1',
        user: 'root',
        password: 'rseditz@222',
        database: 'pos_platform'
    });
    
    try {
        console.log('Applying migrations to pos_platform...');
        
        // Add to tickets (Ignore if columns exist)
        try { await conn.query(`ALTER TABLE tickets ADD COLUMN mcc_code VARCHAR(50) DEFAULT NULL`); } catch(e) {}
        try { await conn.query(`ALTER TABLE tickets ADD COLUMN zone_name VARCHAR(100) DEFAULT NULL`); } catch(e) {}
        try { await conn.query(`ALTER TABLE tickets ADD COLUMN sponsor_bank VARCHAR(100) DEFAULT NULL`); } catch(e) {}
        try { await conn.query(`ALTER TABLE tickets ADD COLUMN mid VARCHAR(50) DEFAULT NULL`); } catch(e) {}
        console.log('Tickets table updated.');
        
        // Add mid to merchants
        try { await conn.query(`ALTER TABLE merchants ADD COLUMN mid VARCHAR(50) DEFAULT NULL`); } catch(e) {}
        
        // Drop mcc_code, zone_name, sponsor_bank from merchants if they exist
        try { await conn.query(`ALTER TABLE merchants DROP COLUMN mcc_code`); } catch(e) {}
        try { await conn.query(`ALTER TABLE merchants DROP COLUMN zone_name`); } catch(e) {}
        try { await conn.query(`ALTER TABLE merchants DROP COLUMN sponsor_bank`); } catch(e) {}
        console.log('Merchants table updated.');
        
        // Show current schema of merchants
        const [rows] = await conn.query('SHOW COLUMNS FROM merchants');
        console.log('Current Merchants Schema:');
        rows.forEach(r => console.log(r.Field));

        const [ticketsRows] = await conn.query('SHOW COLUMNS FROM tickets');
        console.log('\nCurrent Tickets Schema:');
        ticketsRows.forEach(r => console.log(r.Field));
        
    } catch (err) {
        console.error('Error applying migration:', err.message);
    } finally {
        await conn.end();
    }
}
run();
