const mysql = require('mysql2/promise');

async function run() {
    const conn = await mysql.createConnection({
        host: '127.0.0.1',
        user: 'adminuser',
        password: 'Vishal@13241',
        database: 'pos_platform'
    });
    
    try {
        console.log('Applying migrations to pos_platform...');
        
        // Drop mid from merchants
        try { 
            await conn.query(`ALTER TABLE merchants DROP COLUMN mid`); 
            console.log('Dropped mid from merchants table.');
        } catch(e) {
            console.log('Column mid might already be dropped or error:', e.message);
        }
        
    } catch (err) {
        console.error('Error applying migration:', err.message);
    } finally {
        await conn.end();
    }
}
run();
