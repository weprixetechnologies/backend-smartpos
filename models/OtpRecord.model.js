const db = require('../utils/db');

const create = async ({ purpose, recipient, otp_hash, entity_id, expires_at }) => {
    const query = `
        INSERT INTO otp_records 
        (purpose, recipient, otp_hash, entity_id, expires_at, attempts, status, created_at)
        VALUES (?, ?, ?, ?, ?, 0, 'PENDING', NOW())
    `;
    await db.query(query, [purpose, recipient, otp_hash, entity_id || null, expires_at]);
    return true;
};

const updateStatus = async (id, fields) => {
    const allowedFields = ['status', 'validated_at', 'attempts'];
    const setClauses = [];
    const values = [];

    Object.keys(fields).forEach(key => {
        if (allowedFields.includes(key) && fields[key] !== undefined) {
            setClauses.push(`${key} = ?`);
            values.push(fields[key]);
        }
    });

    if (setClauses.length === 0) return null;

    values.push(id);
    const query = `UPDATE otp_records SET ${setClauses.join(', ')} WHERE id = ?`;
    await db.query(query, values);
    return true;
};

const findLatestPending = async (entity_id, purpose) => {
    const [rows] = await db.query(
        `SELECT * FROM otp_records 
         WHERE entity_id = ? AND purpose = ? AND status = 'PENDING' 
         ORDER BY created_at DESC LIMIT 1`,
        [entity_id, purpose]
    );
    return rows[0];
};

module.exports = {
    create,
    updateStatus,
    findLatestPending
};
