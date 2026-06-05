const db = require('../utils/db');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function serializeState(value) {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value === 'string') {
        try {
            JSON.parse(value);
            return value;
        } catch (err) {
            throw new Error('State field must be a valid JSON string or an object');
        }
    }

    try {
        return JSON.stringify(value);
    } catch (err) {
        throw new Error('State field is not serializable to JSON');
    }
}

function buildWhereClause(filters) {
    const clauses = [];
    const values = [];

    if (filters.actor_id) {
        clauses.push('actor_id = ?');
        values.push(filters.actor_id);
    }
    if (filters.branch_id) {
        clauses.push('branch_id = ?');
        values.push(filters.branch_id);
    }
    if (filters.module) {
        clauses.push('module = ?');
        values.push(filters.module);
    }
    if (filters.action_code) {
        clauses.push('action_code = ?');
        values.push(filters.action_code);
    }
    if (filters.entity_type) {
        clauses.push('entity_type = ?');
        values.push(filters.entity_type);
    }
    if (filters.entity_id) {
        clauses.push('entity_id = ?');
        values.push(filters.entity_id);
    }
    if (filters.trigger_type) {
        clauses.push('trigger_type = ?');
        values.push(filters.trigger_type);
    }
    if (filters.from) {
        clauses.push('occurred_at >= ?');
        values.push(filters.from);
    }
    if (filters.to) {
        clauses.push('occurred_at <= ?');
        values.push(filters.to);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    return { whereClause, values };
}

async function insert(log) {
    const sql = `INSERT INTO action_logs (
      actor_id,
      actor_name,
      actor_role,
      actor_ip,
      actor_device,
      branch_id,
      module,
      action_code,
      trigger_type,
      entity_type,
      entity_id,
      previous_state,
      new_state,
      notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [
        log.actor_id || null,
        log.actor_name || null,
        log.actor_role || null,
        log.actor_ip || null,
        log.actor_device || null,
        log.branch_id || null,
        log.module,
        log.action_code,
        log.trigger_type || 'USER',
        log.entity_type || null,
        log.entity_id || null,
        serializeState(log.previous_state),
        serializeState(log.new_state),
        log.notes || null
    ];

    const [result] = await db.query(sql, values);
    return result.insertId;
}

async function findAll(filters = {}) {
    const page = Math.max(1, parseInt(filters.page, 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(filters.limit, 10) || DEFAULT_LIMIT));
    const offset = (page - 1) * limit;

    const { whereClause, values } = buildWhereClause(filters);
    const rowsSql = `SELECT * FROM action_logs ${whereClause} ORDER BY occurred_at DESC, log_number DESC LIMIT ? OFFSET ?`;
    const countSql = `SELECT COUNT(*) AS total FROM action_logs ${whereClause}`;

    const [rows] = await db.query(rowsSql, [...values, limit, offset]);
    const [countRows] = await db.query(countSql, values);

    return {
        rows,
        total: countRows[0]?.total || 0,
        page,
        limit
    };
}

async function findById(id) {
    const [rows] = await db.query('SELECT * FROM action_logs WHERE id = ? LIMIT 1', [id]);
    return rows[0] || null;
}

async function findByLogNumber(log_number) {
    const [rows] = await db.query('SELECT * FROM action_logs WHERE log_number = ? LIMIT 1', [log_number]);
    return rows[0] || null;
}

module.exports = {
    insert,
    findAll,
    findById,
    findByLogNumber
};
