const AttendanceService = require('../services/Attendance.service');

const AttendanceController = {
    async punchIn(req, res, next) {
        try {
            const record = await AttendanceService.punchIn(req.user);
            res.status(201).json({ success: true, data: record });
        } catch (err) {
            next(err);
        }
    },

    async punchOut(req, res, next) {
        try {
            const record = await AttendanceService.punchOut(req.user);
            res.status(200).json({ success: true, data: record });
        } catch (err) {
            next(err);
        }
    },

    async getMyAttendance(req, res, next) {
        try {
            const records = await AttendanceService.getMyAttendance(req.user, req.query);
            res.status(200).json({ success: true, data: records });
        } catch (err) {
            next(err);
        }
    },

    async getEmployeeAttendance(req, res, next) {
        try {
            const records = await AttendanceService.getEmployeeAttendance(req.user, req.params.employeeId, req.query);
            res.status(200).json({ success: true, data: records });
        } catch (err) {
            next(err);
        }
    },

    async getDailyBranch(req, res, next) {
        try {
            const records = await AttendanceService.getDailyBranchAttendance(req.user, req.query);
            res.status(200).json({ success: true, data: records });
        } catch (err) {
            next(err);
        }
    },

    async getMonthlySummary(req, res, next) {
        try {
            const summary = await AttendanceService.getMonthlySummary(req.user, req.query);
            res.status(200).json({ success: true, data: summary });
        } catch (err) {
            next(err);
        }
    },

    async getPendingRegularisations(req, res, next) {
        try {
            const data = await AttendanceService.getPendingRegularisations(req.user);
            res.status(200).json({ success: true, data });
        } catch (err) {
            next(err);
        }
    },

    async submitRegularisation(req, res, next) {
        try {
            const request = await AttendanceService.submitRegularisation(req.user, req.body);
            res.status(201).json({ success: true, data: request });
        } catch (err) {
            next(err);
        }
    },

    async reviewRegularisation(req, res, next) {
        try {
            const updated = await AttendanceService.reviewRegularisation(req.user, req.params.id, req.body);
            res.status(200).json({ success: true, data: updated });
        } catch (err) {
            next(err);
        }
    }
};

module.exports = AttendanceController;
