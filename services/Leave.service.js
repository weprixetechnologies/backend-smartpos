const LeaveRequestModel = require('../models/LeaveRequest.model');
const AttendanceModel = require('../models/Attendance.model');
const auditEmitter = require('../utils/auditEmitter');
const { buildEntry } = require('./AuditLogger.service');
const db = require('../utils/db');

const LeaveService = {
    async applyLeave(actorUser, payload) {
        const { leave_type, from_date, to_date, reason } = payload;
        
        const todayStr = new Date().toISOString().slice(0, 10);
        if (from_date < todayStr) {
            const err = new Error('from_date cannot be in the past');
            err.status = 400;
            throw err;
        }

        if (to_date < from_date) {
            const err = new Error('to_date must be >= from_date');
            err.status = 400;
            throw err;
        }

        const conn = await db.getConnection();
        try {
            // Check attendance records in range
            const [attRows] = await conn.execute(
                `SELECT COUNT(*) AS count FROM attendance 
                 WHERE employee_id = ? AND punch_in_at IS NOT NULL 
                 AND attendance_date BETWEEN ? AND ?`,
                [actorUser.id, from_date, to_date]
            );
            if (attRows[0].count > 0) {
                const err = new Error('You have already punched in on one or more of the requested dates');
                err.status = 409;
                throw err;
            }
        } finally {
            conn.release();
        }

        const hasOverlap = await LeaveRequestModel.checkOverlap(actorUser.id, from_date, to_date);
        if (hasOverlap) {
            const err = new Error('You already have a leave request overlapping these dates');
            err.status = 409;
            throw err;
        }

        const leave = await LeaveRequestModel.create({
            employee_id: actorUser.id,
            leave_type,
            from_date,
            to_date,
            reason
        });

        auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
            module: 'ATTENDANCE',
            action_code: 'LEAVE_APPLIED',
            entity_type: 'leave_requests',
            entity_id: leave.id
        }));

        return leave;
    },

    async getMyLeaves(actorUser, query) {
        return await LeaveRequestModel.findByEmployee(actorUser.id, {
            status: query.status,
            year: query.year
        });
    },

    async getPendingLeaves(actorUser, query) {
        if (actorUser.role === 'ENGINEER' || actorUser.role === 'OPERATOR') {
            const err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }

        let branch_id = query.branch_id;
        if (actorUser.role === 'MANAGER') {
            branch_id = actorUser.branch_id;
        }

        return await LeaveRequestModel.findPending({ branch_id: branch_id || null });
    },

    async reviewLeave(actorUser, leaveId, payload) {
        if (actorUser.role === 'ENGINEER' || actorUser.role === 'OPERATOR') {
            const err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }

        const leave = await LeaveRequestModel.findById(leaveId);
        if (!leave) {
            const err = new Error('Leave request not found');
            err.status = 404;
            throw err;
        }

        if (leave.status !== 'PENDING') {
            const err = new Error('Leave already reviewed');
            err.status = 409;
            throw err;
        }

        if (actorUser.role === 'MANAGER' && leave.branch_id !== actorUser.branch_id) {
            const err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }

        if (leave.employee_id === actorUser.id) {
            const err = new Error('Cannot review your own leave request');
            err.status = 403;
            throw err;
        }

        const { status } = payload;
        await LeaveRequestModel.review(leaveId, {
            status,
            reviewed_by: actorUser.id,
            reviewed_at: new Date()
        });

        if (status === 'APPROVED') {
            // Generate array of dates
            const startDate = new Date(leave.from_date);
            const endDate = new Date(leave.to_date);
            const dates = [];
            for (let d = startDate; d <= endDate; d.setDate(d.getDate() + 1)) {
                dates.push(new Date(d).toISOString().slice(0, 10));
            }

            for (const date of dates) {
                const record = await AttendanceModel.findByEmployeeAndDate(leave.employee_id, date);
                if (record) {
                    await AttendanceModel.update(record.id, { status: 'ON_LEAVE' });
                } else {
                    await AttendanceModel.create({
                        employee_id: leave.employee_id,
                        attendance_date: date,
                        status: 'ON_LEAVE',
                        punch_in_at: null,
                        shift_id: null
                    });
                }
            }
        }

        const updated = await LeaveRequestModel.findById(leaveId);

        auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
            module: 'ATTENDANCE',
            action_code: 'LEAVE_REVIEWED',
            entity_type: 'leave_requests',
            entity_id: leaveId,
            notes: `${status} by ${actorUser.name} for ${leave.employee_id}`
        }));

        return updated;
    },

    async cancelLeave(actorUser, leaveId) {
        const leave = await LeaveRequestModel.findById(leaveId);
        if (!leave) {
            const err = new Error('Leave request not found');
            err.status = 404;
            throw err;
        }

        if (leave.employee_id !== actorUser.id) {
            const err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }

        if (leave.status !== 'PENDING') {
            const err = new Error('Can only cancel a pending leave request');
            err.status = 409;
            throw err;
        }

        const todayStr = new Date().toISOString().slice(0, 10);
        if (leave.from_date < todayStr) {
            const err = new Error('Cannot cancel a leave that has already started');
            err.status = 409;
            throw err;
        }

        await LeaveRequestModel.review(leaveId, {
            status: 'REJECTED',
            reviewed_by: actorUser.id,
            reviewed_at: new Date()
        });

        auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
            module: 'ATTENDANCE',
            action_code: 'LEAVE_CANCELLED',
            entity_type: 'leave_requests',
            entity_id: leaveId
        }));

        return { success: true };
    }
};

module.exports = LeaveService;
