const db = require('../utils/db');

const create = async ({ ticket_id, file_url, uploaded_by, description }) => {
    const query = `
        INSERT INTO ticket_attachments (ticket_id, file_url, uploaded_by, description)
        VALUES (?, ?, ?, ?)
    `;
    await db.query(query, [ticket_id, file_url, uploaded_by, description || null]);
    return true;
};

const findByTicket = async (ticket_id) => {
    const [rows] = await db.query(
        `SELECT * FROM ticket_attachments WHERE ticket_id = ? ORDER BY uploaded_at DESC`,
        [ticket_id]
    );
    return rows;
};

module.exports = {
    create,
    findByTicket
};
