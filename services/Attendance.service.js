const AttendanceModel = require('../models/Attendance.model');
const AttendanceRegularisationModel = require('../models/AttendanceRegularisation.model');
const EmployeeShiftModel = require('../models/EmployeeShift.model');
const ShiftModel = require('../models/Shift.model');
const HolidayModel = require('../models/Holiday.model');
const EmployeeModel = require('../models/Employee.model');
const auditEmitter = require('../utils/auditEmitter');
const { buildEntry } = require('./AuditLogger.service');
const db = require('../utils/db');

const AttendanceService = {
    async punchIn(actorUser) {
        const today = new Date().toISOString().slice(0, 10);
        
        const existingRecord = await AttendanceModel.findByEmployeeAndDate(actorUser.id, today);
        if (existingRecord) {
            if (existingRecord.punch_in_at) {
                const err = new Error('Already punched in today');
                err.status = 409;
                throw err;
            }
            if (existingRecord.status === 'ON_LEAVE') {
                const err = new Error('You are on approved leave today');
                err.status = 409;
                throw err;
            }
        }

        const isHoliday = await HolidayModel.isHoliday(actorUser.branch_id, today);
        if (isHoliday) {
            const err = new Error('Today is a holiday');
            err.status = 409;
            throw err;
        }

        const currentShift = await EmployeeShiftModel.getCurrentShift(actorUser.id, today);
        
        const record = await AttendanceModel.create({
            employee_id: actorUser.id,
            attendance_date: today,
            status: 'PRESENT',
            punch_in_at: new Date(),
            shift_id: currentShift ? currentShift.shift_id : null
        });

        auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
            module: 'ATTENDANCE',
            action_code: 'PUNCH_IN',
            entity_type: 'attendance',
            entity_id: record.id
        }));

        return record;
    },

    async punchOut(actorUser) {
        const today = new Date().toISOString().slice(0, 10);
        const record = await AttendanceModel.findByEmployeeAndDate(actorUser.id, today);
        
        if (!record) {
            const err = new Error('No punch-in found for today');
            err.status = 404;
            throw err;
        }
        if (!record.punch_in_at) {
            const err = new Error('Cannot punch out without punching in');
            err.status = 400;
            throw err;
        }
        if (record.punch_out_at) {
            const err = new Error('Already punched out today');
            err.status = 409;
            throw err;
        }

        const punchInTime = new Date(record.punch_in_at);
        const punchOutTime = new Date();
        const totalMinutes = Math.floor((punchOutTime - punchInTime) / 60000);

        let overtimeMinutes = 0;
        if (record.shift_id) {
            const shift = await ShiftModel.findById(record.shift_id);
            if (shift) {
                const [endH, endM] = shift.end_time.split(':');
                const shiftEnd = new Date(punchInTime);
                shiftEnd.setHours(parseInt(endH), parseInt(endM), 0, 0);
                
                if (punchOutTime > shiftEnd) {
                    overtimeMinutes = Math.floor((punchOutTime - shiftEnd) / 60000);
                }
            }
        }

        const status = totalMinutes < 240 ? 'HALF_DAY' : 'PRESENT';

        await AttendanceModel.punchOut(record.id, {
            punch_out_at: punchOutTime,
            overtime_minutes: overtimeMinutes,
            status
        });

        const updatedRecord = await AttendanceModel.findByEmployeeAndDate(actorUser.id, today);

        auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
            module: 'ATTENDANCE',
            action_code: 'PUNCH_OUT',
            entity_type: 'attendance',
            entity_id: record.id,
            notes: `Duration: ${totalMinutes} min. Overtime: ${overtimeMinutes} min.`
        }));

        return updatedRecord;
    },

    async getMyAttendance(actorUser, query) {
        let fromDate = query.from_date;
        let toDate = query.to_date;

        if (query.year && query.month) {
            const y = parseInt(query.year);
            const m = parseInt(query.month);
            fromDate = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
            toDate = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
        }

        if (!fromDate || !toDate) {
            const err = new Error('Missing date range');
            err.status = 400;
            throw err;
        }

        return await AttendanceModel.findByEmployeeAndRange(actorUser.id, fromDate, toDate);
    },

    async getEmployeeAttendance(actorUser, targetEmployeeId, query) {
        if (actorUser.role === 'ENGINEER' || actorUser.role === 'OPERATOR') {
            const err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }

        const employee = await EmployeeModel.findById(targetEmployeeId);
        if (!employee) {
            const err = new Error('Employee not found');
            err.status = 404;
            throw err;
        }

        if (actorUser.role === 'MANAGER' && employee.branch_id !== actorUser.branch_id) {
            const err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }

        let fromDate = query.from_date;
        let toDate = query.to_date;

        if (query.year && query.month) {
            const y = parseInt(query.year);
            const m = parseInt(query.month);
            fromDate = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
            toDate = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
        }

        if (!fromDate || !toDate) {
            const err = new Error('Missing date range');
            err.status = 400;
            throw err;
        }

        return await AttendanceModel.findByEmployeeAndRange(targetEmployeeId, fromDate, toDate);
    },

    async getDailyBranchAttendance(actorUser, query) {
        if (actorUser.role === 'ENGINEER') {
            const err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }

        let branch_id = query.branch_id;
        if (actorUser.role === 'OPERATOR' || actorUser.role === 'MANAGER') {
            branch_id = actorUser.branch_id;
        }

        const date = query.date || new Date().toISOString().slice(0, 10);
        return await AttendanceModel.findByBranchAndDate(branch_id || null, date);
    },

    async getMonthlySummary(actorUser, query) {
        const { year, month } = query;
        if (!year || !month) {
            const err = new Error('year and month are required');
            err.status = 400;
            throw err;
        }

        if (actorUser.role === 'ENGINEER' || actorUser.role === 'OPERATOR') {
            return await AttendanceModel.monthlySummary(actorUser.id, year, month);
        }

        if (query.employee_id) {
            const employee = await EmployeeModel.findById(query.employee_id);
            if (!employee) {
                const err = new Error('Employee not found');
                err.status = 404;
                throw err;
            }
            if (actorUser.role === 'MANAGER' && employee.branch_id !== actorUser.branch_id) {
                const err = new Error('Forbidden');
                err.status = 403;
                throw err;
            }
            return await AttendanceModel.monthlySummary(query.employee_id, year, month);
        }

        let branch_id = query.branch_id;
        if (actorUser.role === 'MANAGER') {
            branch_id = actorUser.branch_id;
        }
        
        return await AttendanceModel.branchMonthlySummary(branch_id || null, year, month);
    },

    async getPendingRegularisations(actorUser) {
        let branch_id = null;
        if (actorUser.role === 'MANAGER') {
            branch_id = actorUser.branch_id;
        }

        const pending = await AttendanceRegularisationModel.findPending({ branch_id });
        return pending;
    },

    async submitRegularisation(actorUser, payload) {
        const { attendance_id, reason } = payload;

        const conn = await db.getConnection();
        let record;
        try {
            const [rows] = await conn.execute(`SELECT * FROM attendance WHERE id = ?`, [attendance_id]);
            record = rows[0];
            if (!record) {
                const err = new Error('Attendance record not found');
                err.status = 404;
                throw err;
            }
            if (record.employee_id !== actorUser.id) {
                const err = new Error('Forbidden');
                err.status = 403;
                throw err;
            }

            const [pendingRows] = await conn.execute(
                `SELECT COUNT(*) AS count FROM attendance_regularisation WHERE attendance_id = ? AND status = 'PENDING'`,
                [attendance_id]
            );
            if (pendingRows[0].count > 0) {
                const err = new Error('A pending regularisation request already exists for this date');
                err.status = 409;
                throw err;
            }
        } finally {
            conn.release();
        }

        const reg = await AttendanceRegularisationModel.create({
            attendance_id,
            employee_id: actorUser.id,
            reason
        });

        auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
            module: 'ATTENDANCE',
            action_code: 'REGULARISATION_SUBMITTED',
            entity_type: 'attendance_regularisation',
            entity_id: reg.id
        }));

        return reg;
    },

    async reviewRegularisation(actorUser, regularisationId, payload) {
        if (actorUser.role === 'ENGINEER' || actorUser.role === 'OPERATOR') {
            const err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }

        const reg = await AttendanceRegularisationModel.findById(regularisationId);
        if (!reg) {
            const err = new Error('Regularisation request not found');
            err.status = 404;
            throw err;
        }

        if (reg.status !== 'PENDING') {
            const err = new Error('Already reviewed');
            err.status = 409;
            throw err;
        }

        if (actorUser.role === 'MANAGER' && reg.branch_id !== actorUser.branch_id) {
            const err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }

        if (reg.employee_id === actorUser.id) {
            const err = new Error('Cannot review your own regularisation request');
            err.status = 403;
            throw err;
        }

        const { status, corrected_punch_in, corrected_punch_out } = payload;
        
        await AttendanceRegularisationModel.review(regularisationId, {
            status,
            reviewed_by: actorUser.id,
            reviewed_at: new Date()
        });

        if (status === 'APPROVED') {
            const updateFields = { is_regularised: 1 };
            if (corrected_punch_in) updateFields.punch_in_at = new Date(corrected_punch_in);
            if (corrected_punch_out) updateFields.punch_out_at = new Date(corrected_punch_out);
            
            const pIn = updateFields.punch_in_at || reg.punch_in_at;
            const pOut = updateFields.punch_out_at || reg.punch_out_at;

            if (pIn && pOut) {
                const mins = Math.floor((new Date(pOut) - new Date(pIn)) / 60000);
                updateFields.status = mins < 240 ? 'HALF_DAY' : 'PRESENT';
            }

            await AttendanceModel.update(reg.attendance_id, updateFields);
        }

        const updated = await AttendanceRegularisationModel.findById(regularisationId);

        auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
            module: 'ATTENDANCE',
            action_code: 'REGULARISATION_REVIEWED',
            entity_type: 'attendance_regularisation',
            entity_id: regularisationId,
            notes: `${status} by ${actorUser.name}`
        }));

        return updated;
    }
};

module.exports = AttendanceService;
