const db = require('../utils/db');

const create = async ({ stock_item_id, engineer_id, ticket_id, branch_id, item_condition, received_by, photo_url, notes }) => {
    const query = `INSERT INTO stock_returns (stock_item_id, engineer_id, ticket_id, branch_id, item_condition, received_by, photo_url, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    await db.query(query, [stock_item_id, engineer_id, ticket_id || null, branch_id, item_condition || 'GOOD', received_by || null, photo_url || null, notes || null]);
};

const findByBranch = async (branch_id, { from_date, to_date, engineer_id }) => {
    let baseQuery = `SELECT sr.*, si.serial_number, si.item_name, e.full_name AS engineer_name
                     FROM stock_returns sr
                     JOIN stock_items si ON si.id = sr.stock_item_id
                     JOIN employees e ON e.id = sr.engineer_id
                     WHERE sr.branch_id = ?`;
    const params = [branch_id];
    
    if (engineer_id) {
        baseQuery += ' AND sr.engineer_id = ?';
        params.push(engineer_id);
    }
    if (from_date) {
        baseQuery += ' AND sr.returned_at >= ?';
        params.push(from_date);
    }
    if (to_date) {
        baseQuery += ' AND sr.returned_at <= ?';
        params.push(to_date);
    }
    
    baseQuery += ' ORDER BY sr.returned_at DESC';
    const [rows] = await db.query(baseQuery, params);
    return rows;
};

module.exports = { create, findByBranch };
