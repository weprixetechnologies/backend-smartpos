const db = require('../utils/db');
const auditEmitter = require('../utils/auditEmitter');

function hasPincodeOverlap(ranges) {
    for (let i = 0; i < ranges.length; i++) {
        for (let j = i + 1; j < ranges.length; j++) {
            const from1 = parseInt(ranges[i].pincode_from, 10);
            const to1 = parseInt(ranges[i].pincode_to, 10);
            const from2 = parseInt(ranges[j].pincode_from, 10);
            const to2 = parseInt(ranges[j].pincode_to, 10);

            if (from1 <= to2 && from2 <= to1) {
                return { overlapping: true, details: `Range ${ranges[i].pincode_from}-${ranges[i].pincode_to} overlaps with ${ranges[j].pincode_from}-${ranges[j].pincode_to}` };
            }
        }
    }
    return { overlapping: false };
}

async function getAll(filters) {
    const page = Math.max(1, parseInt(filters.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(filters.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const clauses = [];
    const values = [];

    if (filters.search) {
        clauses.push('(b.branch_code LIKE ? OR b.branch_name LIKE ? OR b.contact_person LIKE ?)');
        const search = `%${filters.search}%`;
        values.push(search, search, search);
    }
    if (filters.status) {
        clauses.push('b.status = ?');
        values.push(filters.status);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    const validSorts = ['branch_name', 'created_at', 'employee_count'];
    const sortBy = validSorts.includes(filters.sort_by) ? filters.sort_by : 'created_at';
    const sortDir = filters.sort_dir === 'ASC' ? 'ASC' : 'DESC';

    const rowsSql = `
        SELECT 
            b.id, b.branch_code, b.branch_name, b.address,
            b.contact_person, b.contact_mobile, b.contact_email,
            b.status, b.created_at, b.updated_at,
            COUNT(DISTINCT e.id) AS employee_count,
            COUNT(DISTINCT m.id) AS machine_count,
            COUNT(DISTINCT t.id) AS open_ticket_count,
            COUNT(DISTINCT si.id) AS stock_item_count
        FROM branches b
        LEFT JOIN employees e ON e.branch_id = b.id AND e.status = 'ACTIVE'
        LEFT JOIN machines m ON m.branch_id = b.id AND m.status NOT IN ('DECOMMISSIONED')
        LEFT JOIN tickets t ON t.branch_id = b.id AND t.status NOT IN ('CLOSED', 'CANCELLED')
        LEFT JOIN stock_items si ON si.branch_id = b.id AND si.state NOT IN ('DECOMMISSIONED')
        ${whereClause}
        GROUP BY b.id
        ORDER BY ${sortBy} ${sortDir}
        LIMIT ? OFFSET ?
    `;

    const countSql = `SELECT COUNT(*) AS total FROM branches b ${whereClause}`;

    const [rows] = await db.query(rowsSql, [...values, limit, offset]);
    const [countRows] = await db.query(countSql, values);
    const total = countRows[0]?.total || 0;

    if (rows.length > 0) {
        const branchIds = rows.map(r => r.id);
        const [pincodes] = await db.query(
            `SELECT id, branch_id, pincode_from, pincode_to FROM branch_pincode_coverage WHERE branch_id IN (?)`,
            [branchIds]
        );
        
        const pincodeMap = {};
        for (const pc of pincodes) {
            if (!pincodeMap[pc.branch_id]) pincodeMap[pc.branch_id] = [];
            pincodeMap[pc.branch_id].push({ id: pc.id, pincode_from: pc.pincode_from, pincode_to: pc.pincode_to });
        }

        for (const row of rows) {
            row.pincode_ranges = pincodeMap[row.id] || [];
        }
    }

    return {
        data: rows,
        pagination: {
            page,
            limit,
            total,
            total_pages: Math.ceil(total / limit)
        }
    };
}

async function getById(id) {
    const [rows] = await db.query(`
        SELECT 
            b.id, b.branch_code, b.branch_name, b.address,
            b.contact_person, b.contact_mobile, b.contact_email,
            b.status, b.created_at, b.updated_at,
            COUNT(DISTINCT e.id) AS employee_count,
            COUNT(DISTINCT m.id) AS machine_count,
            COUNT(DISTINCT t.id) AS open_ticket_count,
            COUNT(DISTINCT si.id) AS stock_item_count
        FROM branches b
        LEFT JOIN employees e ON e.branch_id = b.id AND e.status = 'ACTIVE'
        LEFT JOIN machines m ON m.branch_id = b.id AND m.status NOT IN ('DECOMMISSIONED')
        LEFT JOIN tickets t ON t.branch_id = b.id AND t.status NOT IN ('CLOSED', 'CANCELLED')
        LEFT JOIN stock_items si ON si.branch_id = b.id AND si.state NOT IN ('DECOMMISSIONED')
        WHERE b.id = ?
        GROUP BY b.id
    `, [id]);

    if (rows.length === 0) return null;
    const branch = rows[0];

    const [pincodes] = await db.query(
        `SELECT id, pincode_from, pincode_to FROM branch_pincode_coverage WHERE branch_id = ?`,
        [id]
    );
    branch.pincode_ranges = pincodes;

    return branch;
}

async function getDependencies(id) {
    const [b] = await db.query('SELECT id, branch_name FROM branches WHERE id = ?', [id]);
    if (b.length === 0) return null;

    const queries = [
        db.query(`SELECT COUNT(*) as count FROM employees WHERE branch_id = ? AND status = 'ACTIVE'`, [id]),
        db.query(`SELECT COUNT(*) as count FROM machines WHERE branch_id = ? AND status NOT IN ('DECOMMISSIONED')`, [id]),
        db.query(`SELECT COUNT(*) as count FROM tickets WHERE branch_id = ? AND status NOT IN ('CLOSED', 'CANCELLED')`, [id]),
        db.query(`SELECT COUNT(*) as count FROM stock_items WHERE branch_id = ? AND state NOT IN ('DECOMMISSIONED')`, [id]),
        db.query(`SELECT COUNT(*) as count FROM zones WHERE branch_id = ?`, [id])
    ];

    const results = await Promise.all(queries);
    const deps = {
        employees: results[0][0][0].count,
        machines: results[1][0][0].count,
        open_tickets: results[2][0][0].count,
        stock_items: results[3][0][0].count,
        zones: results[4][0][0].count
    };

    const can_delete = Object.values(deps).every(v => v === 0);

    return {
        branch_id: b[0].id,
        branch_name: b[0].branch_name,
        can_delete,
        dependencies: deps
    };
}

async function create(payload, actor) {
    // Validate individual ranges
    for (const r of payload.pincode_ranges) {
        if (parseInt(r.pincode_from) > parseInt(r.pincode_to)) {
            const err = new Error('Pincode from cannot be greater than to');
            err.status = 400;
            throw err;
        }
    }

    const overlap = hasPincodeOverlap(payload.pincode_ranges);
    if (overlap.overlapping) {
        const err = new Error(overlap.details);
        err.status = 400;
        throw err;
    }

    const branchCode = payload.branch_code.trim().toUpperCase();

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        const [existing] = await conn.query('SELECT id FROM branches WHERE branch_code = ?', [branchCode]);
        if (existing.length > 0) {
            const err = new Error('Branch code already exists');
            err.status = 409;
            err.field = 'branch_code';
            throw err;
        }

        await conn.query(`
            INSERT INTO branches (branch_code, branch_name, address, contact_person, contact_mobile, contact_email, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            branchCode,
            payload.branch_name,
            payload.address,
            payload.contact_person || null,
            payload.contact_mobile || null,
            payload.contact_email || null,
            payload.status || 'ACTIVE'
        ]);

        const [newBranchRows] = await conn.query('SELECT id FROM branches WHERE branch_code = ?', [branchCode]);
        const branchId = newBranchRows[0].id;

        if (payload.pincode_ranges.length > 0) {
            const values = payload.pincode_ranges.map(r => [branchId, r.pincode_from, r.pincode_to]);
            await conn.query('INSERT INTO branch_pincode_coverage (branch_id, pincode_from, pincode_to) VALUES ?', [values]);
        }

        auditEmitter.emit('audit', {
            module: 'BRANCH',
            action_code: 'BRANCH_CREATED',
            actor_id: actor.id,
            actor_name: actor.full_name || actor.name,
            actor_role: actor.role,
            actor_ip: actor.ip || null,
            actor_device: actor.device || null,
            branch_id: null,
            trigger_type: 'USER',
            entity_type: 'branch',
            entity_id: branchId,
            new_state: { branch_code: branchCode, branch_name: payload.branch_name, status: payload.status || 'ACTIVE' }
        });

        await conn.commit();
        return branchId;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

async function update(id, payload, actor) {
    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        const [branches] = await conn.query('SELECT * FROM branches WHERE id = ? FOR UPDATE', [id]);
        if (branches.length === 0) {
            const err = new Error('Branch not found');
            err.status = 404;
            throw err;
        }
        const oldBranch = branches[0];

        // Process pincodes
        const [existingPincodes] = await conn.query('SELECT id, pincode_from, pincode_to FROM branch_pincode_coverage WHERE branch_id = ?', [id]);
        let currentRanges = [...existingPincodes];

        const deletes = payload.pincode_ranges?.delete || [];
        const upserts = payload.pincode_ranges?.upsert || [];

        if (deletes.length > 0) {
            const invalidDeletes = deletes.filter(dId => !existingPincodes.find(e => e.id === dId));
            if (invalidDeletes.length > 0) {
                const err = new Error('Some pincode range IDs to delete do not belong to this branch');
                err.status = 400;
                throw err;
            }
            currentRanges = currentRanges.filter(r => !deletes.includes(r.id));
        }

        for (const u of upserts) {
            if (u.id) {
                if (!existingPincodes.find(e => e.id === u.id)) {
                    const err = new Error(`Upsert ID ${u.id} does not belong to this branch`);
                    err.status = 400;
                    throw err;
                }
                const idx = currentRanges.findIndex(r => r.id === u.id);
                if (idx !== -1) {
                    currentRanges[idx] = { ...currentRanges[idx], pincode_from: u.pincode_from, pincode_to: u.pincode_to };
                }
            } else {
                currentRanges.push({ pincode_from: u.pincode_from, pincode_to: u.pincode_to });
            }
        }

        for (const r of currentRanges) {
            if (parseInt(r.pincode_from) > parseInt(r.pincode_to)) {
                const err = new Error('Pincode from cannot be greater than to');
                err.status = 400;
                throw err;
            }
        }

        const overlap = hasPincodeOverlap(currentRanges);
        if (overlap.overlapping) {
            const err = new Error(overlap.details);
            err.status = 400;
            throw err;
        }

        const updates = [];
        const values = [];
        const newValues = {};

        const fields = ['branch_name', 'address', 'contact_person', 'contact_mobile', 'contact_email', 'status'];
        fields.forEach(f => {
            if (payload[f] !== undefined) {
                updates.push(`${f} = ?`);
                values.push(payload[f]);
                newValues[f] = payload[f];
            }
        });

        if (updates.length > 0) {
            values.push(id);
            await conn.query(`UPDATE branches SET ${updates.join(', ')} WHERE id = ?`, values);
        }

        if (deletes.length > 0) {
            await conn.query('DELETE FROM branch_pincode_coverage WHERE id IN (?) AND branch_id = ?', [deletes, id]);
        }

        for (const u of upserts) {
            if (u.id) {
                await conn.query('UPDATE branch_pincode_coverage SET pincode_from = ?, pincode_to = ? WHERE id = ? AND branch_id = ?', [u.pincode_from, u.pincode_to, u.id, id]);
            } else {
                await conn.query('INSERT INTO branch_pincode_coverage (branch_id, pincode_from, pincode_to) VALUES (?, ?, ?)', [id, u.pincode_from, u.pincode_to]);
            }
        }

        auditEmitter.emit('audit', {
            module: 'BRANCH',
            action_code: 'BRANCH_UPDATED',
            actor_id: actor.id,
            actor_name: actor.full_name || actor.name,
            actor_role: actor.role,
            actor_ip: actor.ip || null,
            actor_device: actor.device || null,
            branch_id: id,
            trigger_type: 'USER',
            entity_type: 'branch',
            entity_id: id,
            previous_state: oldBranch,
            new_state: newValues
        });

        await conn.commit();
        return id;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

async function updateStatus(id, status, actor) {
    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        const [branches] = await conn.query('SELECT status, branch_code FROM branches WHERE id = ? FOR UPDATE', [id]);
        if (branches.length === 0) {
            const err = new Error('Branch not found');
            err.status = 404;
            throw err;
        }

        const oldStatus = branches[0].status;
        const branchCode = branches[0].branch_code;
        
        let warnings = {};
        if (status === 'INACTIVE' && oldStatus !== 'INACTIVE') {
            const [e] = await conn.query(`SELECT COUNT(*) as c FROM employees WHERE branch_id = ? AND status = 'ACTIVE'`, [id]);
            const [t] = await conn.query(`SELECT COUNT(*) as c FROM tickets WHERE branch_id = ? AND status NOT IN ('CLOSED','CANCELLED')`, [id]);
            warnings = {
                active_employees: e[0].c,
                open_tickets: t[0].c
            };
        }

        if (status !== oldStatus) {
            await conn.query('UPDATE branches SET status = ? WHERE id = ?', [status, id]);
            auditEmitter.emit('audit', {
                module: 'BRANCH',
                action_code: 'BRANCH_STATUS_CHANGED',
                actor_id: actor.id,
                actor_name: actor.full_name || actor.name,
                actor_role: actor.role,
                actor_ip: actor.ip || null,
                actor_device: actor.device || null,
                branch_id: id,
                trigger_type: 'USER',
                entity_type: 'branch',
                entity_id: id,
                previous_state: { status: oldStatus },
                new_state: { status }
            });
        }

        await conn.commit();
        
        return {
            id,
            branch_code: branchCode,
            status,
            warnings,
            message: `Status updated to ${status}`
        };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

async function remove(id, actor) {
    const deps = await getDependencies(id);
    if (!deps) {
        const err = new Error('Branch not found');
        err.status = 404;
        throw err;
    }

    if (!deps.can_delete) {
        const err = new Error('Cannot delete branch with active dependencies');
        err.status = 409;
        err.dependencies = deps.dependencies;
        throw err;
    }

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        const [branches] = await conn.query('SELECT * FROM branches WHERE id = ? FOR UPDATE', [id]);
        if (branches.length === 0) {
            const err = new Error('Branch not found');
            err.status = 404;
            throw err;
        }
        const branchSnapshot = branches[0];

        // Explicit cascades
        await conn.query('DELETE FROM branch_pincode_coverage WHERE branch_id = ?', [id]);
        await conn.query('DELETE FROM sla_config WHERE branch_id = ?', [id]);
        await conn.query('DELETE FROM system_config WHERE branch_id = ?', [id]);
        await conn.query('DELETE FROM zones WHERE branch_id = ?', [id]); // cascades in DB to zone_pincode_ranges, etc
        
        auditEmitter.emit('audit', {
            module: 'BRANCH',
            action_code: 'BRANCH_DELETED',
            actor_id: actor.id,
            actor_name: actor.full_name || actor.name,
            actor_role: actor.role,
            actor_ip: actor.ip || null,
            actor_device: actor.device || null,
            branch_id: null,
            trigger_type: 'USER',
            entity_type: 'branch',
            entity_id: id,
            previous_state: branchSnapshot
        });

        await conn.query('DELETE FROM branches WHERE id = ?', [id]);

        await conn.commit();
        return branchSnapshot.branch_code;
    } catch (err) {
        await conn.rollback();
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
            const refErr = new Error('Record is referenced by other data');
            refErr.status = 409;
            throw refErr;
        }
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = {
    hasPincodeOverlap,
    getAll,
    getById,
    getDependencies,
    create,
    update,
    updateStatus,
    remove
};
