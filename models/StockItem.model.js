const db = require('../utils/db');

const create = async ({ serial_number, machine_id, category, item_name, brand, model, branch_id, item_condition, consignment_id, notes }) => {
    const query = `INSERT INTO stock_items (serial_number, machine_id, category, item_name, brand, model, branch_id, state, item_condition, consignment_id, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', ?, ?, ?)`;
    await db.query(query, [serial_number, machine_id || null, category, item_name, brand || null, model || null, branch_id, item_condition || 'GOOD', consignment_id || null, notes || null]);
    const [rows] = await db.query('SELECT * FROM stock_items WHERE serial_number = ? LIMIT 1', [serial_number]);
    return rows[0];
};

const findById = async (id) => {
    const [rows] = await db.query('SELECT * FROM stock_items WHERE id = ? LIMIT 1', [id]);
    return rows[0];
};

const findBySerial = async (serial_number) => {
    const [rows] = await db.query('SELECT * FROM stock_items WHERE serial_number = ? LIMIT 1', [serial_number]);
    return rows[0];
};

const findAll = async ({ branch_id, category, state, item_condition, consignment_id, search, page = 1, limit = 20 }) => {
    let baseQuery = 'FROM stock_items WHERE 1=1';
    const params = [];
    if (branch_id) { baseQuery += ' AND branch_id = ?'; params.push(branch_id); }
    if (category) { baseQuery += ' AND category = ?'; params.push(category); }
    if (state) { baseQuery += ' AND state = ?'; params.push(state); }
    if (item_condition) { baseQuery += ' AND item_condition = ?'; params.push(item_condition); }
    if (consignment_id) { baseQuery += ' AND consignment_id = ?'; params.push(consignment_id); }
    if (search) {
        baseQuery += ' AND (serial_number LIKE ? OR item_name LIKE ?)';
        const like = `%${search}%`;
        params.push(like, like);
    }
    
    const [countRows] = await db.query(`SELECT COUNT(*) as total ${baseQuery}`, params);
    const total = countRows[0].total;
    
    const offset = (page - 1) * limit;
    const query = `SELECT * ${baseQuery} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const [items] = await db.query(query, [...params, Number(limit), Number(offset)]);
    
    return { items, total, page: Number(page), limit: Number(limit) };
};

const updateState = async (id, state) => {
    await db.query('UPDATE stock_items SET state = ?, updated_at = NOW() WHERE id = ?', [state, id]);
};

const update = async (id, fields) => {
    const allowed = ['item_name', 'brand', 'model', 'item_condition', 'notes', 'machine_id', 'state'];
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
    await db.query(`UPDATE stock_items SET ${setClauses.join(', ')} WHERE id = ?`, values);
};

const decommission = async (id) => {
    await db.query(`UPDATE stock_items SET state = 'DECOMMISSIONED', decommissioned_at = NOW(), updated_at = NOW() WHERE id = ?`, [id]);
};

module.exports = { create, findById, findBySerial, findAll, updateState, update, decommission };
