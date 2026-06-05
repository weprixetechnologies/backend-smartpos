const db = require('../utils/db');

async function findByMobileOrEmail(identifier) {
    const sql = `SELECT * FROM employees WHERE mobile = ? OR email = ? LIMIT 1`;
    const [rows] = await db.query(sql, [identifier, identifier]);
    return rows[0] || null;
}

async function findById(id) {
    const sql = `SELECT * FROM employees WHERE id = ? LIMIT 1`;
    const [rows] = await db.query(sql, [id]);
    return rows[0] || null;
}

async function findByEmployeeCode(employeeCode) {
    const sql = `SELECT * FROM employees WHERE employee_code = ? LIMIT 1`;
    const [rows] = await db.query(sql, [employeeCode]);
    return rows[0] || null;
}

async function findAll(filters = {}) {
    const page = Math.max(1, parseInt(filters.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(filters.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const clauses = [];
    const values = [];

    if (filters.branch_id) {
        clauses.push('branch_id = ?');
        values.push(filters.branch_id);
    }

    if (filters.role) {
        if (Array.isArray(filters.role)) {
            clauses.push(`role IN (${filters.role.map(() => '?').join(', ')})`);
            values.push(...filters.role);
        } else {
            clauses.push('role = ?');
            values.push(filters.role);
        }
    }

    // Default status is ACTIVE
    const status = filters.status || 'ACTIVE';
    clauses.push('status = ?');
    values.push(status);

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    const rowsSql = `SELECT * FROM employees ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const countSql = `SELECT COUNT(*) AS total FROM employees ${whereClause}`;

    const [employees] = await db.query(rowsSql, [...values, limit, offset]);
    const [countRows] = await db.query(countSql, values);
    const total = countRows[0]?.total || 0;

    return {
        employees,
        total,
        page,
        limit
    };
}

async function create(data) {
    const sql = `INSERT INTO employees (
        full_name, mobile, email, password_hash, role, branch_id, base_salary, date_of_joining, profile_photo, employee_code, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [
        data.full_name,
        data.mobile,
        data.email || null,
        data.password_hash,
        data.role,
        data.branch_id,
        data.base_salary || null,
        data.date_of_joining || null,
        data.profile_photo || null,
        data.employee_code || null,
        data.status || 'ACTIVE'
    ];

    await db.query(sql, values);

    // Fetch the inserted record using the unique mobile number
    const [rows] = await db.query('SELECT id FROM employees WHERE mobile = ?', [data.mobile]);
    if (!rows[0]) {
        throw new Error('Created employee not found');
    }

    return await findById(rows[0].id);
}

async function update(id, fields) {
    const allowedFields = [
        'full_name', 'mobile', 'email', 'password_hash', 'role',
        'branch_id', 'base_salary', 'date_of_joining', 'profile_photo', 'status', 'last_login_at', 'employee_code'
    ];

    const keys = Object.keys(fields).filter(key => allowedFields.includes(key) && fields[key] !== undefined);
    if (keys.length === 0) {
        return await findById(id);
    }

    const setClause = keys.map(key => `${key} = ?`).join(', ');
    const values = keys.map(key => fields[key]);
    values.push(id);

    const sql = `UPDATE employees SET ${setClause} WHERE id = ?`;
    await db.query(sql, values);

    return await findById(id);
}

async function softDelete(id) {
    const sql = `UPDATE employees SET status = 'INACTIVE', updated_at = NOW() WHERE id = ?`;
    const [result] = await db.query(sql, [id]);
    return result.affectedRows > 0;
}

async function updateLastLogin(id) {
    const sql = `UPDATE employees SET last_login_at = NOW() WHERE id = ?`;
    const [result] = await db.query(sql, [id]);
    return result.affectedRows > 0;
}

module.exports = {
    findByMobileOrEmail,
    findByEmployeeCode,
    findById,
    findAll,
    create,
    update,
    softDelete,
    updateLastLogin
};
