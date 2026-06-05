const db = require('../utils/db');

async function create(data) {
    const sql = `INSERT INTO login_audit (
        employee_id, email_or_mobile, success, ip_address, device_info, branch_id
    ) VALUES (?, ?, ?, ?, ?, ?)`;
    const values = [
        data.employee_id || null,
        data.email_or_mobile,
        data.success ? 1 : 0,
        data.ip_address || null,
        data.device_info || null,
        data.branch_id || null
    ];
    const [result] = await db.query(sql, values);
    return result.insertId;
}

module.exports = {
    create
};
