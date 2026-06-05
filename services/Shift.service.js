const ShiftModel = require('../models/Shift.model');
const EmployeeShiftModel = require('../models/EmployeeShift.model');
const EmployeeModel = require('../models/Employee.model');
const auditEmitter = require('../utils/auditEmitter');
const { buildEntry } = require('./AuditLogger.service');
const db = require('../utils/db');

const ShiftService = {
    async createShift(actorUser, payload) {
        let branch_id = payload.branch_id;

        if (actorUser.role === 'MANAGER') {
            branch_id = actorUser.branch_id;
        } else if (actorUser.role !== 'SUPERADMIN') {
            const err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }

        if (!branch_id) {
            const err = new Error('branch_id is required');
            err.status = 400;
            throw err;
        }

        // Check name uniqueness
        const conn = await db.getConnection();
        try {
            const [rows] = await conn.execute(
                `SELECT COUNT(*) AS count FROM shifts WHERE branch_id = ? AND shift_name = ? AND is_active = 1`,
                [branch_id, payload.shift_name]
            );
            if (rows[0].count > 0) {
                const err = new Error('Shift name already exists in this branch');
                err.status = 409;
                throw err;
            }
        } finally {
            conn.release();
        }

        const created = await ShiftModel.create({
            branch_id,
            shift_name: payload.shift_name,
            shift_type: payload.shift_type,
            start_time: payload.start_time,
            end_time: payload.end_time
        });

        auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
            module: 'ATTENDANCE',
            action_code: 'SHIFT_CREATED',
            entity_type: 'shifts',
            entity_id: created.id,
            new_state: created
        }));

        return created;
    },

    async listShifts(actorUser, query) {
        let branch_id = query.branch_id;
        if (actorUser.role !== 'SUPERADMIN') {
            branch_id = actorUser.branch_id;
        }

        return await ShiftModel.findAll({
            branch_id: branch_id || null,
            is_active: query.is_active !== undefined ? query.is_active : undefined
        });
    },

    async updateShift(actorUser, shiftId, payload) {
        if (actorUser.role !== 'MANAGER' && actorUser.role !== 'SUPERADMIN') {
            const err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }

        const shift = await ShiftModel.findById(shiftId);
        if (!shift) {
            const err = new Error('Shift not found');
            err.status = 404;
            throw err;
        }

        if (actorUser.role === 'MANAGER' && shift.branch_id !== actorUser.branch_id) {
            const err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }

        if (payload.shift_name && payload.shift_name !== shift.shift_name) {
            const conn = await db.getConnection();
            try {
                const [rows] = await conn.execute(
                    `SELECT COUNT(*) AS count FROM shifts WHERE branch_id = ? AND shift_name = ? AND is_active = 1 AND id != ?`,
                    [shift.branch_id, payload.shift_name, shiftId]
                );
                if (rows[0].count > 0) {
                    const err = new Error('Shift name already exists in this branch');
                    err.status = 409;
                    throw err;
                }
            } finally {
                conn.release();
            }
        }

        const updatedFields = {
            shift_name: payload.shift_name,
            shift_type: payload.shift_type,
            start_time: payload.start_time,
            end_time: payload.end_time,
            is_active: payload.is_active
        };

        // remove undefined
        Object.keys(updatedFields).forEach(k => updatedFields[k] === undefined && delete updatedFields[k]);

        await ShiftModel.update(shiftId, updatedFields);
        const newState = await ShiftModel.findById(shiftId);

        auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
            module: 'ATTENDANCE',
            action_code: 'SHIFT_UPDATED',
            entity_type: 'shifts',
            entity_id: shiftId,
            previous_state: shift,
            new_state: newState
        }));

        return newState;
    },

    async deactivateShift(actorUser, shiftId) {
        if (actorUser.role !== 'MANAGER' && actorUser.role !== 'SUPERADMIN') {
            const err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }

        const shift = await ShiftModel.findById(shiftId);
        if (!shift) {
            const err = new Error('Shift not found');
            err.status = 404;
            throw err;
        }

        if (actorUser.role === 'MANAGER' && shift.branch_id !== actorUser.branch_id) {
            const err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }

        const conn = await db.getConnection();
        try {
            const [rows] = await conn.execute(
                `SELECT COUNT(*) AS count FROM employee_shifts WHERE shift_id = ? AND effective_to IS NULL`,
                [shiftId]
            );
            if (rows[0].count > 0) {
                const err = new Error('Shift is currently assigned to employees. Reassign before deactivating.');
                err.status = 409;
                throw err;
            }
        } finally {
            conn.release();
        }

        await ShiftModel.softDelete(shiftId);

        auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
            module: 'ATTENDANCE',
            action_code: 'SHIFT_DEACTIVATED',
            entity_type: 'shifts',
            entity_id: shiftId
        }));

        return { success: true };
    },

    async assignShift(actorUser, payload) {
        const { employee_id, shift_id, effective_from, effective_to } = payload;

        if (actorUser.role !== 'OPERATOR' && actorUser.role !== 'MANAGER' && actorUser.role !== 'SUPERADMIN') {
            const err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }

        const employee = await EmployeeModel.findById(employee_id);
        if (!employee || employee.status !== 'ACTIVE') {
            const err = new Error('Employee not found or not active');
            err.status = 404;
            throw err;
        }

        if (actorUser.role !== 'SUPERADMIN' && employee.branch_id !== actorUser.branch_id) {
            const err = new Error('Forbidden: Cannot assign shift to employee from another branch');
            err.status = 403;
            throw err;
        }

        const shift = await ShiftModel.findById(shift_id);
        if (!shift || !shift.is_active) {
            const err = new Error('Shift not found or inactive');
            err.status = 404;
            throw err;
        }

        if (shift.branch_id !== employee.branch_id) {
            const err = new Error('Shift branch does not match employee branch');
            err.status = 400;
            throw err;
        }

        const todayStr = new Date().toISOString().slice(0, 10);
        if (effective_from < todayStr) {
            const err = new Error('effective_from cannot be in the past');
            err.status = 400;
            throw err;
        }

        if (effective_to && effective_to <= effective_from) {
            const err = new Error('effective_to must be after effective_from');
            err.status = 400;
            throw err;
        }

        const assignment = await EmployeeShiftModel.assign({
            employee_id,
            shift_id,
            effective_from,
            effective_to,
            assigned_by: actorUser.id
        });

        auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
            module: 'ATTENDANCE',
            action_code: 'SHIFT_ASSIGNED',
            entity_type: 'employee_shifts',
            entity_id: assignment.id,
            new_state: { employee_id, shift_id, effective_from, effective_to }
        }));

        return assignment;
    }
};

module.exports = ShiftService;
