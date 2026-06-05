const HolidayService = require('../services/Holiday.service');

const HolidayController = {
    async create(req, res, next) {
        try {
            const holiday = await HolidayService.createHoliday(req.user, req.body);
            res.status(201).json({ success: true, data: holiday });
        } catch (err) {
            next(err);
        }
    },

    async list(req, res, next) {
        try {
            const holidays = await HolidayService.listHolidays(req.user, req.query);
            res.status(200).json({ success: true, data: holidays });
        } catch (err) {
            next(err);
        }
    },

    async delete(req, res, next) {
        try {
            await HolidayService.deleteHoliday(req.user, req.params.id);
            res.status(200).json({ success: true, message: 'Holiday deleted successfully' });
        } catch (err) {
            next(err);
        }
    }
};

module.exports = HolidayController;
