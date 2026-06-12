require('dotenv').config();
const db = require('./utils/db');
const AttendanceService = require('./services/Attendance.service');

(async () => {
  try {
    const actorUser = { id: 'ce04a6ac-6022-11f1-bd32-d6b4261e94ad', role: 'ENGINEER' };
    const today = new Date().toISOString().split('T')[0];
    const records = await AttendanceService.getMyAttendance(actorUser, { from_date: today, to_date: today });
    console.log(JSON.stringify(records, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
})();
