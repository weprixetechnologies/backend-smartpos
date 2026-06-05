const ShiftService = require('../services/Shift.service');

const ShiftController = {
    async create(req, res, next) {
        try {
            const shift = await ShiftService.createShift(req.user, req.body);
            res.status(201).json({ success: true, data: shift });
        } catch (err) {
            next(err);
        }
    },

    async list(req, res, next) {
        try {
            const shifts = await ShiftService.listShifts(req.user, req.query);
            res.status(200).json({ success: true, data: shifts });
        } catch (err) {
            next(err);
        }
    },

    async update(req, res, next) {
        try {
            const shift = await ShiftService.updateShift(req.user, req.params.id, req.body);
            res.status(200).json({ success: true, data: shift });
        } catch (err) {
            next(err);
        }
    },

    async deactivate(req, res, next) {
        try {
            await ShiftService.deactivateShift(req.user, req.params.id);
            res.status(200).json({ success: true, message: 'Shift deactivated successfully' });
        } catch (err) {
            next(err);
        }
    },

    async assignShift(req, res, next) {
        try {
            const assignment = await ShiftService.assignShift(req.user, req.body);
            res.status(201).json({ success: true, data: assignment });
        } catch (err) {
            next(err);
        }
    }
};

module.exports = ShiftController;
