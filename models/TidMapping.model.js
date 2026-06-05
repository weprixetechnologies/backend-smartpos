const db = require('../utils/db');

const mapTid = async ({ machine_id, tid, merchant_name, merchant_address, mapped_by, ticket_id }) => {
    const query = `INSERT INTO tid_mapping_history (machine_id, tid, merchant_name, merchant_address, mapped_by, ticket_id)
                    VALUES (?, ?, ?, ?, ?, ?)`;
    await db.query(query, [machine_id, tid, merchant_name || null, merchant_address || null, mapped_by || null, ticket_id || null]);
    const [rows] = await db.query('SELECT * FROM tid_mapping_history WHERE machine_id = ? AND unmapped_at IS NULL LIMIT 1', [machine_id]);
    return rows[0];
};

const unmapTid = async (machine_id, { unmapped_by, ticket_id }) => {
    const query = `UPDATE tid_mapping_history SET unmapped_at = NOW(), unmapped_by = ?, ticket_id = COALESCE(?, ticket_id) 
                    WHERE machine_id = ? AND unmapped_at IS NULL`;
    await db.query(query, [unmapped_by || null, ticket_id || null, machine_id]);
};

const getCurrentMapping = async (machine_id) => {
    const [rows] = await db.query('SELECT * FROM tid_mapping_history WHERE machine_id = ? AND unmapped_at IS NULL LIMIT 1', [machine_id]);
    return rows[0] || null;
};

const getHistory = async (machine_id) => {
    const [rows] = await db.query('SELECT * FROM tid_mapping_history WHERE machine_id = ? ORDER BY mapped_at DESC', [machine_id]);
    return rows;
};

const findByTid = async (tid) => {
    const [rows] = await db.query('SELECT * FROM tid_mapping_history WHERE tid = ? ORDER BY mapped_at DESC', [tid]);
    return rows;
};

module.exports = { mapTid, unmapTid, getCurrentMapping, getHistory, findByTid };
