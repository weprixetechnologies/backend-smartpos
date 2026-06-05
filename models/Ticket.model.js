const db = require('../utils/db');

const create = async (payload) => {
    // DB triggers handle id, ticket_number, sla_due_at, created_at, updated_at
    const fields = [
        'service_type', 'branch_id', 'priority', 'source',
        'merchant_name', 'business_name', 'merchant_address', 'merchant_pincode',
        'merchant_mobile', 'merchant_email', 'machine_id', 'tid',
        'serial_number', 'machine_model', 'complaint_category', 'complaint_description'
    ];

    const values = [];
    const placeholders = [];
    const insertFields = [];

    fields.forEach(field => {
        if (payload[field] !== undefined) {
            insertFields.push(field);
            placeholders.push('?');
            values.push(payload[field]);
        }
    });

    const query = `INSERT INTO tickets (${insertFields.join(', ')}) VALUES (${placeholders.join(', ')})`;
    
    const conn = await db.getConnection();
    try {
        await conn.query(query, values);
        
        // Fetch back using unique constraint surrogate (branch_id + mobile + latest)
        const [rows] = await conn.query(
            `SELECT * FROM tickets WHERE merchant_mobile = ? AND branch_id = ? ORDER BY created_at DESC LIMIT 1`,
            [payload.merchant_mobile, payload.branch_id]
        );
        return rows[0];
    } finally {
        conn.release();
    }
};

const findById = async (id) => {
    const [rows] = await db.query('SELECT * FROM tickets WHERE id = ? LIMIT 1', [id]);
    return rows[0];
};

const findAll = async (filters = {}) => {
    let query = `SELECT * FROM tickets WHERE 1=1`;
    const values = [];

    if (filters.branch_id) {
        query += ` AND branch_id = ?`;
        values.push(filters.branch_id);
    }
    if (filters.status) {
        query += ` AND status = ?`;
        values.push(filters.status);
    }
    if (filters.service_type) {
        query += ` AND service_type = ?`;
        values.push(filters.service_type);
    }
    if (filters.priority) {
        query += ` AND priority = ?`;
        values.push(filters.priority);
    }
    if (filters.assigned_engineer_id) {
        query += ` AND assigned_engineer_id = ?`;
        values.push(filters.assigned_engineer_id);
    }
    if (filters.source) {
        query += ` AND source = ?`;
        values.push(filters.source);
    }
    if (filters.sla_breached !== undefined) {
        query += ` AND sla_breached = ?`;
        values.push(filters.sla_breached);
    }
    if (filters.from_date) {
        query += ` AND created_at >= ?`;
        values.push(filters.from_date);
    }
    if (filters.to_date) {
        query += ` AND created_at <= ?`;
        values.push(filters.to_date);
    }
    if (filters.search) {
        query += ` AND merchant_name LIKE ?`;
        values.push(`%${filters.search}%`);
    }

    query += ` ORDER BY priority DESC, created_at DESC`;

    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 20;
    const offset = (page - 1) * limit;

    const countQuery = `SELECT COUNT(*) as total FROM (${query}) AS subquery`;
    const [countRows] = await db.query(countQuery, values);
    const total = countRows[0].total;

    query += ` LIMIT ? OFFSET ?`;
    values.push(limit, offset);

    const [tickets] = await db.query(query, values);

    return { tickets, total, page, limit };
};

const findByEngineer = async (engineer_id, filters = {}) => {
    let query = `SELECT * FROM tickets WHERE assigned_engineer_id = ?`;
    const values = [engineer_id];

    // Allow filtering closed/cancelled via explicit status filter, otherwise exclude them
    if (filters.status) {
        query += ` AND status = ?`;
        values.push(filters.status);
    }
    if (filters.priority) {
        query += ` AND priority = ?`;
        values.push(filters.priority);
    }
    if (filters.service_type) {
        query += ` AND service_type = ?`;
        values.push(filters.service_type);
    }
    if (filters.search) {
        query += ` AND merchant_name LIKE ?`;
        values.push(`%${filters.search}%`);
    }

    query += ` ORDER BY priority DESC, sla_due_at ASC`;

    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 20;
    const offset = (page - 1) * limit;

    const countQuery = `SELECT COUNT(*) as total FROM (${query}) AS subquery`;
    const [countRows] = await db.query(countQuery, values);
    const total = countRows[0].total;

    query += ` LIMIT ? OFFSET ?`;
    values.push(limit, offset);

    const [tickets] = await db.query(query, values);
    return { tickets, total, page, limit };
};

const update = async (id, fields) => {
    const allowedFields = [
        'status', 'assigned_engineer_id', 'assigned_at', 'assigned_by',
        'arrived_at', 'started_at', 'machine_picked_at', 'in_office_at',
        'closed_at', 'cancelled_at', 'cancelled_reason', 'cancelled_by',
        'force_closed', 'force_close_reason',
        'close_code_hash', 'close_code_expires_at',
        'arrival_otp_fallback_used', 'arrival_fallback_operator',
        'merchant_signoff_otp_verified', 'merchant_signoff_at',
        'transit_id', 'feedback_rating', 'feedback_comment', 'feedback_received_at',
        'machine_id', 'tid', 'serial_number', 'machine_model'
    ];

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
    const query = `UPDATE tickets SET ${setClauses.join(', ')} WHERE id = ?`;
    await db.query(query, values);
    return true;
};

const assignEngineer = async (ticketId, { engineer_id, assigned_by, assigned_at }) => {
    const query = `UPDATE tickets SET assigned_engineer_id = ?, assigned_by = ?, assigned_at = ?, status = 'ASSIGNED' WHERE id = ?`;
    await db.query(query, [engineer_id, assigned_by, assigned_at, ticketId]);
    return true;
};

const updateServiceType = async (id, serviceType) => {
    return await db.query(
        `UPDATE tickets SET service_type = ? WHERE id = ?`,
        [serviceType, id]
    );
};

module.exports = {
    create,
    findById,
    findAll,
    findByEngineer,
    update,
    assignEngineer,
    updateServiceType
};
