const db = require('../utils/db');

const EmployeeShiftModel = {
    async assign({ employee_id, shift_id, effective_from, effective_to, assigned_by }) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // Close any currently open assignment
            const closeQuery = `
                UPDATE employee_shifts 
                SET effective_to = DATE_SUB(?, INTERVAL 1 DAY)
                WHERE employee_id = ? AND effective_to IS NULL
            `;
            await conn.execute(closeQuery, [effective_from, employee_id]);

            // Insert new assignment
            const insertQuery = `
                INSERT INTO employee_shifts (employee_id, shift_id, effective_from, effective_to, assigned_by, created_at)
                VALUES (?, ?, ?, ?, ?, NOW())
            `;
            await conn.execute(insertQuery, [employee_id, shift_id, effective_from, effective_to || null, assigned_by || null]);

            // Fetch back
            const fetchQuery = `
                SELECT * FROM employee_shifts 
                WHERE employee_id = ? 
                ORDER BY created_at DESC 
                LIMIT 1
            `;
            const [rows] = await conn.execute(fetchQuery, [employee_id]);
            
            await conn.commit();
            return rows[0];
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    async getCurrentShift(employee_id, date) {
        const query = `
            SELECT es.*, s.*
            FROM employee_shifts es
            JOIN shifts s ON s.id = es.shift_id
            WHERE es.employee_id = ?
              AND es.effective_from <= ?
              AND (es.effective_to IS NULL OR es.effective_to >= ?)
            ORDER BY es.effective_from DESC
            LIMIT 1
        `;
        const conn = await db.getConnection();
        try {
            const [rows] = await conn.execute(query, [employee_id, date, date]);
            return rows[0] || null;
        } finally {
            conn.release();
        }
    },

    async getHistory(employee_id) {
        const query = `
            SELECT es.*, s.shift_name, s.shift_type, s.start_time, s.end_time
            FROM employee_shifts es
            JOIN shifts s ON s.id = es.shift_id
            WHERE es.employee_id = ?
            ORDER BY es.effective_from DESC
        `;
        const conn = await db.getConnection();
        try {
            const [rows] = await conn.execute(query, [employee_id]);
            return rows;
        } finally {
            conn.release();
        }
    }
};

module.exports = EmployeeShiftModel;
