const db = require('../utils/db');

const AttendanceModel = {
    async findByEmployeeAndDate(employee_id, date) {
        const query = `SELECT * FROM attendance WHERE employee_id = ? AND attendance_date = ? LIMIT 1`;
        const conn = await db.getConnection();
        try {
            const [rows] = await conn.execute(query, [employee_id, date]);
            return rows[0] || null;
        } finally {
            conn.release();
        }
    },

    async findByEmployeeAndRange(employee_id, from_date, to_date) {
        const query = `
            SELECT * FROM attendance
            WHERE employee_id = ? AND attendance_date BETWEEN ? AND ?
            ORDER BY attendance_date ASC
        `;
        const conn = await db.getConnection();
        try {
            const [rows] = await conn.execute(query, [employee_id, from_date, to_date]);
            return rows;
        } finally {
            conn.release();
        }
    },

    async findByBranchAndDate(branch_id, date) {
        let query = `
            SELECT a.*, e.full_name, e.employee_code, e.role
            FROM attendance a
            JOIN employees e ON e.id = a.employee_id
            WHERE a.attendance_date = ?
        `;
        const params = [date];

        if (branch_id) {
            query += ` AND e.branch_id = ?`;
            params.push(branch_id);
        }

        query += ` ORDER BY e.full_name ASC`;

        const conn = await db.getConnection();
        try {
            const [rows] = await conn.execute(query, params);
            return rows;
        } finally {
            conn.release();
        }
    },

    async create({ employee_id, attendance_date, status, punch_in_at, shift_id }) {
        const query = `
            INSERT INTO attendance (
                employee_id, attendance_date, status, punch_in_at, 
                punch_in_lat, punch_in_lng, punch_out_lat, punch_out_lng,
                shift_id, overtime_minutes, is_regularised, created_at, updated_at
            ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, 0, 0, NOW(), NOW())
        `;
        const params = [employee_id, attendance_date, status, punch_in_at || null, shift_id || null];
        
        const conn = await db.getConnection();
        try {
            await conn.execute(query, params);
            return await this.findByEmployeeAndDate(employee_id, attendance_date);
        } finally {
            conn.release();
        }
    },

    async punchOut(id, { punch_out_at, overtime_minutes, status }) {
        const query = `
            UPDATE attendance 
            SET punch_out_at = ?, overtime_minutes = ?, status = ?, updated_at = NOW()
            WHERE id = ?
        `;
        const conn = await db.getConnection();
        try {
            const [result] = await conn.execute(query, [punch_out_at, overtime_minutes, status, id]);
            return result.affectedRows > 0;
        } finally {
            conn.release();
        }
    },

    async update(id, fields) {
        if (!fields || Object.keys(fields).length === 0) return false;

        const allowedFields = ['punch_in_at', 'punch_out_at', 'status', 'overtime_minutes', 'is_regularised'];
        const setClauses = [];
        const params = [];

        for (const [key, value] of Object.entries(fields)) {
            if (allowedFields.includes(key)) {
                setClauses.push(`${key} = ?`);
                params.push(value);
            }
        }

        if (setClauses.length === 0) return false;
        
        setClauses.push('updated_at = NOW()');

        const query = `UPDATE attendance SET ${setClauses.join(', ')} WHERE id = ?`;
        params.push(id);

        const conn = await db.getConnection();
        try {
            const [result] = await conn.execute(query, params);
            return result.affectedRows > 0;
        } finally {
            conn.release();
        }
    },

    async monthlySummary(employee_id, year, month) {
        const query = `
            SELECT
                COUNT(CASE WHEN status = 'PRESENT'  THEN 1 END) AS present_count,
                COUNT(CASE WHEN status = 'ABSENT'   THEN 1 END) AS absent_count,
                COUNT(CASE WHEN status = 'HALF_DAY' THEN 1 END) AS half_day_count,
                COUNT(CASE WHEN status = 'ON_LEAVE' THEN 1 END) AS on_leave_count,
                COALESCE(SUM(overtime_minutes), 0)               AS total_overtime_minutes,
                COUNT(*)                                        AS total_days_recorded
            FROM attendance
            WHERE employee_id = ?
              AND YEAR(attendance_date) = ?
              AND MONTH(attendance_date) = ?
        `;
        const conn = await db.getConnection();
        try {
            const [rows] = await conn.execute(query, [employee_id, year, month]);
            return rows[0];
        } finally {
            conn.release();
        }
    },

    async branchMonthlySummary(branch_id, year, month) {
        let query = `
            SELECT
                e.id AS employee_id,
                e.full_name,
                e.employee_code,
                COUNT(CASE WHEN a.status = 'PRESENT'  THEN 1 END) AS present_count,
                COUNT(CASE WHEN a.status = 'ABSENT'   THEN 1 END) AS absent_count,
                COUNT(CASE WHEN a.status = 'HALF_DAY' THEN 1 END) AS half_day_count,
                COUNT(CASE WHEN a.status = 'ON_LEAVE' THEN 1 END) AS on_leave_count,
                COALESCE(SUM(a.overtime_minutes), 0)               AS total_overtime_minutes,
                COUNT(a.id)                                        AS total_days_recorded
            FROM employees e
            LEFT JOIN attendance a ON a.employee_id = e.id 
                AND YEAR(a.attendance_date) = ? 
                AND MONTH(a.attendance_date) = ?
            WHERE 1=1
        `;
        const params = [year, month];

        if (branch_id) {
            query += ` AND e.branch_id = ?`;
            params.push(branch_id);
        }

        query += ` GROUP BY e.id ORDER BY e.full_name ASC`;

        const conn = await db.getConnection();
        try {
            const [rows] = await conn.execute(query, params);
            return rows;
        } finally {
            conn.release();
        }
    }
};

module.exports = AttendanceModel;
