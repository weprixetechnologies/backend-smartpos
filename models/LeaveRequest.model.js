const db = require('../utils/db');

const LeaveRequestModel = {
    async create({ employee_id, leave_type, from_date, to_date, reason }) {
        const query = `
            INSERT INTO leave_requests (employee_id, leave_type, from_date, to_date, reason, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'PENDING', NOW())
        `;
        const conn = await db.getConnection();
        try {
            await conn.execute(query, [employee_id, leave_type, from_date, to_date, reason || null]);
            
            const fetchQuery = `
                SELECT * FROM leave_requests 
                WHERE employee_id = ? 
                ORDER BY created_at DESC 
                LIMIT 1
            `;
            const [rows] = await conn.execute(fetchQuery, [employee_id]);
            return rows[0];
        } finally {
            conn.release();
        }
    },

    async findById(id) {
        const query = `
            SELECT lr.*, e.full_name, e.employee_code, e.branch_id
            FROM leave_requests lr
            JOIN employees e ON e.id = lr.employee_id
            WHERE lr.id = ?
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

    async findByEmployee(employee_id, { status, year }) {
        let query = `SELECT * FROM leave_requests WHERE employee_id = ?`;
        const params = [employee_id];

        if (status) {
            query += ` AND status = ?`;
            params.push(status);
        }

        if (year) {
            query += ` AND YEAR(from_date) = ?`;
            params.push(year);
        }

        query += ` ORDER BY from_date DESC`;

        const conn = await db.getConnection();
        try {
            const [rows] = await conn.execute(query, params);
            return rows;
        } finally {
            conn.release();
        }
    },

    async findPending({ branch_id }) {
        let query = `
            SELECT lr.*, e.full_name, e.employee_code, e.branch_id
            FROM leave_requests lr
            JOIN employees e ON e.id = lr.employee_id
            WHERE lr.status = 'PENDING'
        `;
        const params = [];

        if (branch_id) {
            query += ` AND e.branch_id = ?`;
            params.push(branch_id);
        }

        query += ` ORDER BY lr.created_at ASC`;

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
            UPDATE leave_requests 
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
    },

    async checkOverlap(employee_id, from_date, to_date) {
        const query = `
            SELECT COUNT(*) AS overlap_count 
            FROM leave_requests
            WHERE employee_id = ?
              AND status != 'REJECTED'
              AND from_date <= ? AND to_date >= ?
        `;
        const conn = await db.getConnection();
        try {
            const [rows] = await conn.execute(query, [employee_id, to_date, from_date]);
            return rows[0].overlap_count > 0;
        } finally {
            conn.release();
        }
    }
};

module.exports = LeaveRequestModel;
