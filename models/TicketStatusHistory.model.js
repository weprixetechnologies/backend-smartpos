const db = require('../utils/db');

const create = async ({ ticket_id, from_status, to_status, changed_by, changed_by_role, notes }) => {
    const query = `
        INSERT INTO ticket_status_history 
        (ticket_id, from_status, to_status, changed_by, changed_by_role, notes)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    await db.query(query, [ticket_id, from_status || null, to_status, changed_by, changed_by_role, notes || null]);
    return true;
};

const findByTicket = async (ticket_id) => {
    const [rows] = await db.query(
        `SELECT * FROM ticket_status_history WHERE ticket_id = ? ORDER BY occurred_at ASC`,
        [ticket_id]
    );
    return rows;
};

module.exports = {
    create,
    findByTicket
};
