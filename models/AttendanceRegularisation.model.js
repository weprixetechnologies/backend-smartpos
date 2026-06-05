const db = require('../utils/db');

const AttendanceRegularisationModel = {
    async create({ attendance_id, employee_id, reason }) {
        const query = `
            INSERT INTO attendance_regularisation (attendance_id, employee_id, reason, status, created_at)
            VALUES (?, ?, ?, 'PENDING', NOW())
        `;
        const conn = await db.getConnection();
        try {
            await conn.execute(query, [attendance_id, employee_id, reason]);
            
            const fetchQuery = `
                SELECT * FROM attendance_regularisation 
                WHERE attendance_id = ? AND employee_id = ? 
                ORDER BY created_at DESC 
                LIMIT 1
            `;
            const [rows] = await conn.execute(fetchQuery, [attendance_id, employee_id]);
            return rows[0];
        } finally {
            conn.release();
        }
    },

    async findById(id) {
        const query = `
            SELECT ar.*, a.attendance_date, a.punch_in_at, a.punch_out_at, a.status AS attendance_status,
                   e.full_name, e.employee_code, e.branch_id
            FROM attendance_regularisation ar
            JOIN attendance a ON a.id = ar.attendance_id
            JOIN employees e ON e.id = ar.employee_id
            WHERE ar.id = ?
            LIMIT 1
        `;
        const conn = await db.getConnection();
        try {
            const [rows] = await conn.execute(query, [id]);
            return rows[0] || null;
        } finally {
            conn.release();
        }
    },

    async findPending({ branch_id }) {
        let query = `
            SELECT ar.*, a.attendance_date, e.full_name, e.employee_code, e.branch_id
            FROM attendance_regularisation ar
            JOIN attendance a ON a.id = ar.attendance_id
            JOIN employees e ON e.id = ar.employee_id
            WHERE ar.status = 'PENDING'
        `;
        const params = [];

        if (branch_id) {
            query += ` AND e.branch_id = ?`;
            params.push(branch_id);
        }

        query += ` ORDER BY ar.created_at ASC`;

        const conn = await db.getConnection();
        try {
            const [rows] = await conn.execute(query, params);
            return rows;
        } finally {
            conn.release();
        }
    },

    async review(id, { status, reviewed_by, reviewed_at }) {
        const query = `
            UPDATE attendance_regularisation
            SET status = ?, reviewed_by = ?, reviewed_at = ?
            WHERE id = ?
        `;
        const conn = await db.getConnection();
        try {
            const [result] = await conn.execute(query, [status, reviewed_by, reviewed_at, id]);
            return result.affectedRows > 0;
        } finally {
            conn.release();
        }
    }
};

module.exports = AttendanceRegularisationModel;
