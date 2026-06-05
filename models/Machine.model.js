const db = require('../utils/db');

const create = async ({ serial_number, tid, model, brand, branch_id, warranty_expiry }) => {
    const query = `INSERT INTO machines (serial_number, tid, model, brand, branch_id, warranty_expiry, status, is_chronic_fault)
                    VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE', 0)`;
    await db.query(query, [serial_number, tid || null, model || null, brand || null, branch_id || null, warranty_expiry || null]);
    const [rows] = await db.query('SELECT * FROM machines WHERE serial_number = ? LIMIT 1', [serial_number]);
    return rows[0];
};

const findById = async (id) => {
    const [rows] = await db.query(`
        SELECT m.*, b.branch_name 
        FROM machines m 
        LEFT JOIN branches b ON m.branch_id = b.id 
        WHERE m.id = ? LIMIT 1
    `, [id]);
    return rows[0];
};

const findBySerial = async (serial_number) => {
    const [rows] = await db.query('SELECT * FROM machines WHERE serial_number = ? LIMIT 1', [serial_number]);
    return rows[0];
};

const findByTid = async (tid) => {
    const [rows] = await db.query('SELECT * FROM machines WHERE tid = ? LIMIT 1', [tid]);
    return rows[0];
};

const findAll = async ({ branch_id, status, is_chronic_fault, search, page = 1, limit = 20 }) => {
    let baseQuery = 'FROM machines WHERE 1=1';
    const params = [];
    if (branch_id) { baseQuery += ' AND branch_id = ?'; params.push(branch_id); }
    if (status) { baseQuery += ' AND status = ?'; params.push(status); }
    if (is_chronic_fault !== undefined) { baseQuery += ' AND is_chronic_fault = ?'; params.push(is_chronic_fault); }
    if (search) {
        baseQuery += ' AND (serial_number LIKE ? OR tid LIKE ? OR model LIKE ? OR brand LIKE ?)';
        const like = `%${search}%`;
        params.push(like, like, like, like);
    }
    
    const [countRows] = await db.query(`SELECT COUNT(*) as total ${baseQuery}`, params);
    const total = countRows[0].total;
    
    const offset = (page - 1) * limit;
    const query = `SELECT * ${baseQuery} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const [machines] = await db.query(query, [...params, Number(limit), Number(offset)]);
    
    return { machines, total, page: Number(page), limit: Number(limit) };
};

const update = async (id, fields) => {
    const allowed = ['serial_number', 'tid', 'model', 'brand', 'branch_id', 'warranty_expiry', 'is_chronic_fault', 'status'];
    const setClauses = [];
    const values = [];
    for (const key of allowed) {
        if (fields[key] !== undefined) {
            setClauses.push(`${key} = ?`);
            values.push(fields[key]);
        }
    }
    if (setClauses.length === 0) return;
    setClauses.push('updated_at = NOW()');
    values.push(id);
    
    await db.query(`UPDATE machines SET ${setClauses.join(', ')} WHERE id = ?`, values);
};

const decommission = async (id) => {
    await db.query(`UPDATE machines SET status = 'DECOMMISSIONED', decommissioned_at = NOW(), updated_at = NOW() WHERE id = ?`, [id]);
};

const updateStatus = async (id, status) => {
    await db.query(`UPDATE machines SET status = ?, updated_at = NOW() WHERE id = ?`, [status, id]);
};

module.exports = { create, findById, findBySerial, findByTid, findAll, update, decommission, updateStatus };
