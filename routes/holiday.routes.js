const express = require('express');
const router = express.Router();
const HolidayController = require('../controllers/Holiday.controller');
const verifyToken = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/rbac.middleware');
const validateRequest = require('../middlewares/validateRequest');
const { validateCreateHoliday } = require('../validators/holiday.validator');

// /api/holidays
router.post(
    '/',
    verifyToken,
    requireRole('SUPERADMIN'),
    validateCreateHoliday,
    validateRequest,
    HolidayController.create
);

router.get(
    '/',
    verifyToken,
    HolidayController.list
);

router.delete(
    '/:id',
    verifyToken,
    requireRole('SUPERADMIN'),
    HolidayController.delete
);

module.exports = router;
