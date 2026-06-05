const db = require('../utils/db');

const HolidayModel = {
    async create({ branch_id, holiday_date, description, created_by }) {
        const query = `
            INSERT INTO holidays (branch_id, holiday_date, description, created_by, created_at)
            VALUES (?, ?, ?, ?, NOW())
        `;
        const conn = await db.getConnection();
        try {
            await conn.execute(query, [branch_id || null, holiday_date, description || null, created_by || null]);
            
            // fetch back
            let fetchQuery = `SELECT * FROM holidays WHERE holiday_date = ? `;
            const params = [holiday_date];
            if (branch_id) {
                fetchQuery += `AND branch_id = ? `;
                params.push(branch_id);
            } else {
                fetchQuery += `AND branch_id IS NULL `;
            }
            fetchQuery += `ORDER BY created_at DESC LIMIT 1`;

            const [rows] = await conn.execute(fetchQuery, params);
            return rows[0];
        } finally {
            conn.release();
        }
    },

    async findAll({ branch_id, year }) {
        let query = `SELECT * FROM holidays WHERE (branch_id IS NULL`;
        const params = [];

        if (branch_id) {
            query += ` OR branch_id = ?)`;
            params.push(branch_id);
        } else {
            query += `)`;
        }

        if (year) {
            query += ` AND YEAR(holiday_date) = ?`;
            params.push(year);
        }

        query += ` ORDER BY holiday_date ASC`;

        const conn = await db.getConnection();
        try {
            const [rows] = await conn.execute(query, params);
            return rows;
        } finally {
            conn.release();
        }
    },

    async isHoliday(branch_id, date) {
        let query = `SELECT COUNT(*) AS count FROM holidays WHERE holiday_date = ? AND (branch_id IS NULL`;
        const params = [date];

        if (branch_id) {
            query += ` OR branch_id = ?)`;
            params.push(branch_id);
        } else {
            query += `)`;
        }

        const conn = await db.getConnection();
        try {
            const [rows] = await conn.execute(query, params);
            return rows[0].count > 0;
        } finally {
            conn.release();
        }
    },

    async delete(id) {
        const query = `DELETE FROM holidays WHERE id = ?`;
        const conn = await db.getConnection();
        try {
            const [result] = await conn.execute(query, [id]);
            return result.affectedRows > 0;
        } finally {
            conn.release();
        }
    }
};

module.exports = HolidayModel;
