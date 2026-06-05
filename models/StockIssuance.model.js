const db = require('../utils/db');

const create = async ({ stock_item_id, engineer_id, ticket_id, branch_id, issued_by, notes }) => {
    const query = `INSERT INTO stock_issuances (stock_item_id, engineer_id, ticket_id, branch_id, issued_by, notes)
                    VALUES (?, ?, ?, ?, ?, ?)`;
    await db.query(query, [stock_item_id, engineer_id, ticket_id || null, branch_id, issued_by || null, notes || null]);
};

const findById = async (id) => {
    const query = `SELECT si_iss.*, si.serial_number, si.item_name, si.category,
                          e.full_name AS engineer_name, e.employee_code
                   FROM stock_issuances si_iss
                   JOIN stock_items si ON si.id = si_iss.stock_item_id
                   JOIN employees e ON e.id = si_iss.engineer_id
                   WHERE si_iss.id = ? LIMIT 1`;
    const [rows] = await db.query(query, [id]);
    return rows[0];
};

const findByEngineer = async (engineer_id) => {
    const query = `SELECT si_iss.*, si.serial_number, si.item_name, si.category
                   FROM stock_issuances si_iss
                   JOIN stock_items si ON si.id = si_iss.stock_item_id
                   WHERE si_iss.engineer_id = ? AND si_iss.returned_at IS NULL
                   ORDER BY si_iss.issued_at DESC`;
    const [rows] = await db.query(query, [engineer_id]);
    return rows;
};

const findByBranch = async (branch_id, { returned, from_date, to_date }) => {
    let baseQuery = `SELECT si_iss.*, si.serial_number, si.item_name, si.category, e.full_name AS engineer_name 
                     FROM stock_issuances si_iss
                     JOIN stock_items si ON si.id = si_iss.stock_item_id
                     JOIN employees e ON e.id = si_iss.engineer_id
                     WHERE si_iss.branch_id = ?`;
    const params = [branch_id];
    
    if (returned === 'true') {
        baseQuery += ' AND si_iss.returned_at IS NOT NULL';
    } else if (returned === 'false') {
        baseQuery += ' AND si_iss.returned_at IS NULL';
    }
    
    if (from_date) {
        baseQuery += ' AND si_iss.issued_at >= ?';
        params.push(from_date);
    }
    if (to_date) {
        baseQuery += ' AND si_iss.issued_at <= ?';
        params.push(to_date);
    }
    
    baseQuery += ' ORDER BY si_iss.issued_at DESC';
    const [rows] = await db.query(baseQuery, params);
    return rows;
};

const acknowledge = async (id, { engineer_ack_photo }) => {
    await db.query('UPDATE stock_issuances SET engineer_ack_at = NOW(), engineer_ack_photo = ? WHERE id = ?', [engineer_ack_photo || null, id]);
};

const markReturned = async (id, { return_condition, returned_at }) => {
    await db.query('UPDATE stock_issuances SET returned_at = ?, return_condition = ? WHERE id = ?', [returned_at, return_condition, id]);
};

module.exports = { create, findById, findByEngineer, findByBranch, acknowledge, markReturned };
