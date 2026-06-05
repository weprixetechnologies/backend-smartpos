const db = require('../utils/db');

const create = async ({ consignment_id, description, raised_by }) => {
    const query = `INSERT INTO consignment_discrepancies (consignment_id, description, raised_by)
                    VALUES (?, ?, ?)`;
    await db.query(query, [consignment_id, description, raised_by || null]);
};

const findByConsignment = async (consignment_id) => {
    const [rows] = await db.query('SELECT * FROM consignment_discrepancies WHERE consignment_id = ? ORDER BY raised_at DESC', [consignment_id]);
    return rows;
};

const resolve = async (id) => {
    await db.query('UPDATE consignment_discrepancies SET resolved = 1, resolved_at = NOW() WHERE id = ?', [id]);
};

module.exports = { create, findByConsignment, resolve };
