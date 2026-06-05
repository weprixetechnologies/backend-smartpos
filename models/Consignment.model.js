const db = require('../utils/db');

const create = async ({ branch_id, supplier_name, dispatch_reference, relate_badge, expected_count, expected_arrival, notes, created_by }) => {
    const query = `INSERT INTO consignments (branch_id, supplier_name, dispatch_reference, relate_badge, expected_count, status, received_count, expected_arrival, notes, created_by)
                    VALUES (?, ?, ?, ?, ?, 'EXPECTED', 0, ?, ?, ?)`;
    await db.query(query, [branch_id, supplier_name || null, dispatch_reference || null, relate_badge || null, expected_count || null, expected_arrival || null, notes || null, created_by || null]);
    const [rows] = await db.query('SELECT * FROM consignments WHERE created_by = ? ORDER BY created_at DESC LIMIT 1', [created_by]);
    return rows[0];
};

const findById = async (id) => {
    const [rows] = await db.query('SELECT * FROM consignments WHERE id = ? LIMIT 1', [id]);
    return rows[0];
};

const findAll = async ({ branch_id, status, from_date, to_date, supplier_name, page = 1, limit = 20 }) => {
    let baseQuery = 'FROM consignments WHERE 1=1';
    const params = [];
    if (branch_id) { baseQuery += ' AND branch_id = ?'; params.push(branch_id); }
    if (status) { baseQuery += ' AND status = ?'; params.push(status); }
    if (from_date) { baseQuery += ' AND created_at >= ?'; params.push(from_date); }
    if (to_date) { baseQuery += ' AND created_at <= ?'; params.push(to_date); }
    if (supplier_name) {
        baseQuery += ' AND supplier_name LIKE ?';
        params.push(`%${supplier_name}%`);
    }
    
    const [countRows] = await db.query(`SELECT COUNT(*) as total ${baseQuery}`, params);
    const total = countRows[0].total;
    
    const offset = (page - 1) * limit;
    const query = `SELECT * ${baseQuery} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const [consignments] = await db.query(query, [...params, Number(limit), Number(offset)]);
    
    return { consignments, total, page: Number(page), limit: Number(limit) };
};

const incrementReceivedCount = async (id) => {
    await db.query('UPDATE consignments SET received_count = received_count + 1, updated_at = NOW() WHERE id = ?', [id]);
};

const updateStatus = async (id, status) => {
    await db.query('UPDATE consignments SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
};

const markReceived = async (id, received_by) => {
    await db.query(`UPDATE consignments SET status = 'RECEIVED', received_at = NOW(), received_by = ?, updated_at = NOW() WHERE id = ?`, [received_by, id]);
};

const updateReceivedCount = async (id, count) => {
    await db.query('UPDATE consignments SET received_count = ?, updated_at = NOW() WHERE id = ?', [count, id]);
};

module.exports = { create, findById, findAll, incrementReceivedCount, updateStatus, markReceived, updateReceivedCount };
