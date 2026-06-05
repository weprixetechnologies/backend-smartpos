const mysql = require('mysql2/promise');
const config = { host: '127.0.0.1', user: 'root', password: 'rseditz@222', database: 'pos_platform' };
async function run() {
  const conn = await mysql.createConnection(config);
  const [rows] = await conn.execute("SHOW CREATE TABLE tickets");
  console.log(rows[0]['Create Table']);
  process.exit(0);
}
run();
