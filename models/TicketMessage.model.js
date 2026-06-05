const db = require('../utils/db');

const create = async ({ ticket_id, sender_id, message, image_url }) => {
    const query = `
        INSERT INTO ticket_messages (ticket_id, sender_id, message, image_url)
        VALUES (?, ?, ?, ?)
    `;
    await db.query(query, [ticket_id, sender_id, message || null, image_url || null]);
    return true;
};

const findByTicket = async (ticket_id) => {
    const query = `
        SELECT tm.*, e.full_name, e.role 
        FROM ticket_messages tm 
        JOIN employees e ON e.id = tm.sender_id 
        WHERE tm.ticket_id = ? 
        ORDER BY tm.sent_at ASC
    `;
    const [rows] = await db.query(query, [ticket_id]);
    return rows;
};

module.exports = {
    create,
    findByTicket
};
