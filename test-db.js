const pool = require('./utils/db');

async function test() {
  const [rows] = await pool.promise().query("SELECT * FROM tickets WHERE ticket_number = 'TKT-20260604-0009'");
  console.log(rows[0]);
  process.exit(0);
}
test();
