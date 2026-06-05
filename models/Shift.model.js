const db = require('../utils/db');

const ShiftModel = {
    async create({ branch_id, shift_name, shift_type, start_time, end_time }) {
        const query = `
            INSERT INTO shifts (branch_id, shift_name, shift_type, start_time, end_time, created_at)
            VALUES (?, ?, ?, ?, ?, NOW())
        `;
        const params = [branch_id, shift_name, shift_type, start_time, end_time];

        const conn = await db.getConnection();
        try {
            await conn.execute(query, params);
            
            // Fetch back the created row by branch_id and shift_name to get the UUID
            const fetchQuery = `
                SELECT * FROM shifts 
                WHERE branch_id = ? AND shift_name = ? 
                ORDER BY created_at DESC 
                LIMIT 1
            `;
            const [rows] = await conn.execute(fetchQuery, [branch_id, shift_name]);
            return rows[0];
        } finally {
            conn.release();
        }
    },

    async findAll({ branch_id, is_active }) {
        let query = `SELECT * FROM shifts WHERE 1=1`;
        const params = [];

        if (branch_id) {
            query += ` AND branch_id = ?`;
            params.push(branch_id);
        }

        if (is_active !== undefined) {
            query += ` AND is_active = ?`;
            params.push(is_active);
        }

        query += ` ORDER BY branch_id, shift_type, shift_name`;

        const conn = await db.getConnection();
        try {
            const [rows] = await conn.execute(query, params);
            return rows;
        } finally {
            conn.release();
        }
    },

    async findById(id) {
        const query = `SELECT * FROM shifts WHERE id = ? LIMIT 1`;
        const conn = await db.getConnection();
        try {
            const [rows] = await conn.execute(query, [id]);
            return rows[0] || null;
        } finally {
            conn.release();
        }
    },

    async update(id, updates) {
        if (!updates || Object.keys(updates).length === 0) return false;

        const allowedFields = ['shift_name', 'shift_type', 'start_time', 'end_time', 'is_active'];
        const setClauses = [];
        const params = [];

        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                setClauses.push(`${key} = ?`);
                params.push(value);
            }
        }

        if (setClauses.length === 0) return false;

        const query = `UPDATE shifts SET ${setClauses.join(', ')} WHERE id = ?`;
        params.push(id);

        const conn = await db.getConnection();
        try {
            const [result] = await conn.execute(query, params);
            return result.affectedRows > 0;
        } finally {
            conn.release();
        }
    },

    async softDelete(id) {
        const query = `UPDATE shifts SET is_active = 0 WHERE id = ?`;
        const conn = await db.getConnection();
        try {
            const [result] = await conn.execute(query, [id]);
            return result.affectedRows > 0;
        } finally {
            conn.release();
        }
    }
};

module.exports = ShiftModel;
