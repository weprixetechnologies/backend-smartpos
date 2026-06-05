const LeaveService = require('../services/Leave.service');

const LeaveController = {
    async apply(req, res, next) {
        try {
            const leave = await LeaveService.applyLeave(req.user, req.body);
            res.status(201).json({ success: true, data: leave });
        } catch (err) {
            next(err);
        }
    },

    async getMyLeaves(req, res, next) {
        try {
            const leaves = await LeaveService.getMyLeaves(req.user, req.query);
            res.status(200).json({ success: true, data: leaves });
        } catch (err) {
            next(err);
        }
    },

    async getPending(req, res, next) {
        try {
            const leaves = await LeaveService.getPendingLeaves(req.user, req.query);
            res.status(200).json({ success: true, data: leaves });
        } catch (err) {
            next(err);
        }
    },

    async review(req, res, next) {
        try {
            const leave = await LeaveService.reviewLeave(req.user, req.params.id, req.body);
            res.status(200).json({ success: true, data: leave });
        } catch (err) {
            next(err);
        }
    },

    async cancel(req, res, next) {
        try {
            await LeaveService.cancelLeave(req.user, req.params.id);
            res.status(200).json({ success: true, message: 'Leave cancelled successfully' });
        } catch (err) {
            next(err);
        }
    }
};

module.exports = LeaveController;
