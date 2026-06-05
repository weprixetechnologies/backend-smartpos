const db = require('../utils/db');

const create = async ({ machine_id, transferred_by, received_by, from_entity, to_entity, photo_url, ticket_id, notes }) => {
    const query = `INSERT INTO machine_custody_events (machine_id, transferred_by, received_by, from_entity, to_entity, photo_url, ticket_id, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    await db.query(query, [machine_id, transferred_by || null, received_by || null, from_entity || null, to_entity || null, photo_url || null, ticket_id || null, notes || null]);
};

const findByMachine = async (machine_id) => {
    const query = `SELECT mce.*, e1.full_name AS transferred_by_name, e2.full_name AS received_by_name
                    FROM machine_custody_events mce
                    LEFT JOIN employees e1 ON e1.id = mce.transferred_by
                    LEFT JOIN employees e2 ON e2.id = mce.received_by
                    WHERE mce.machine_id = ?
                    ORDER BY mce.occurred_at DESC`;
    const [rows] = await db.query(query, [machine_id]);
    return rows;
};

const findByTicket = async (ticket_id) => {
    const [rows] = await db.query('SELECT * FROM machine_custody_events WHERE ticket_id = ? ORDER BY occurred_at ASC', [ticket_id]);
    return rows;
};

module.exports = { create, findByMachine, findByTicket };
