const db = require('../utils/db');

const create = async ({ ticket_id, work_done, parts_replaced, time_on_site_minutes, merchant_signoff_name, engineer_id }) => {
    const query = `
        INSERT INTO job_sheets 
        (ticket_id, work_done, parts_replaced, time_on_site_minutes, merchant_signoff_name, engineer_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
    await db.query(query, [
        ticket_id, work_done, parts_replaced || null, time_on_site_minutes, 
        merchant_signoff_name || null, engineer_id
    ]);
    return true;
};

const findByTicket = async (ticket_id) => {
    const [rows] = await db.query(`SELECT * FROM job_sheets WHERE ticket_id = ? LIMIT 1`, [ticket_id]);
    return rows[0];
};

const update = async (ticket_id, fields) => {
    const allowedFields = ['work_done', 'parts_replaced', 'time_on_site_minutes', 'merchant_signoff_name', 'pdf_url'];
    const setClauses = [];
    const values = [];

    Object.keys(fields).forEach(key => {
        if (allowedFields.includes(key) && fields[key] !== undefined) {
            setClauses.push(`${key} = ?`);
            values.push(fields[key]);
        }
    });

    if (setClauses.length === 0) return null;

    setClauses.push('updated_at = NOW()');
    values.push(ticket_id);

    const query = `UPDATE job_sheets SET ${setClauses.join(', ')} WHERE ticket_id = ?`;
    await db.query(query, values);
    return true;
};

module.exports = {
    create,
    findByTicket,
    update
};
