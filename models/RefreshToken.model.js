const db = require('../utils/db');

async function create(data) {
    const sql = `INSERT INTO refresh_tokens (
        employee_id, token_hash, device_info, ip_address, expires_at
    ) VALUES (?, ?, ?, ?, ?)`;
    const values = [
        data.employee_id,
        data.token_hash,
        data.device_info || null,
        data.ip_address || null,
        data.expires_at
    ];
    const [result] = await db.query(sql, values);
    return result.insertId;
}

async function findValidToken(employee_id, tokenHash) {
    const sql = `SELECT * FROM refresh_tokens
        WHERE employee_id = ? AND token_hash = ? AND revoked = 0 AND expires_at > NOW()
        LIMIT 1`;
    const [rows] = await db.query(sql, [employee_id, tokenHash]);
    return rows[0] || null;
}

// Used by /refresh-token when access token is expired — hash is 64-byte SHA-256, collision-safe
async function findValidTokenByHash(tokenHash) {
    const sql = `SELECT * FROM refresh_tokens
        WHERE token_hash = ? AND revoked = 0 AND expires_at > NOW()
        LIMIT 1`;
    const [rows] = await db.query(sql, [tokenHash]);
    return rows[0] || null;
}

async function revokeToken(id) {
    const sql = `UPDATE refresh_tokens SET revoked = 1 WHERE id = ?`;
    const [result] = await db.query(sql, [id]);
    return result.affectedRows > 0;
}

async function revokeAllForEmployee(employee_id) {
    const sql = `UPDATE refresh_tokens SET revoked = 1 WHERE employee_id = ?`;
    const [result] = await db.query(sql, [employee_id]);
    return result.affectedRows > 0;
}

async function deleteExpired() {
    const sql = `DELETE FROM refresh_tokens WHERE expires_at < NOW()`;
    const [result] = await db.query(sql);
    return result.affectedRows;
}

module.exports = {
    create,
    findValidToken,
    findValidTokenByHash,
    revokeToken,
    revokeAllForEmployee,
    deleteExpired
};
