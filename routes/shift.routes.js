const express = require('express');
const router = express.Router();
const ShiftController = require('../controllers/Shift.controller');
const verifyToken = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/rbac.middleware');
const validateRequest = require('../middlewares/validateRequest');
const { validateCreateShift, validateAssignShift } = require('../validators/shift.validator');

// /api/shifts/assign
// Must come before /:id routes
router.post(
    '/assign',
    verifyToken,
    requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN'),
    validateAssignShift,
    validateRequest,
    ShiftController.assignShift
);

// /api/shifts
router.post(
    '/',
    verifyToken,
    requireRole('MANAGER', 'SUPERADMIN'),
    validateCreateShift,
    validateRequest,
    ShiftController.create
);

router.get(
    '/',
    verifyToken,
    ShiftController.list
);

// /api/shifts/:id
router.put(
    '/:id',
    verifyToken,
    requireRole('MANAGER', 'SUPERADMIN'),
    ShiftController.update
);

router.delete(
    '/:id',
    verifyToken,
    requireRole('MANAGER', 'SUPERADMIN'),
    ShiftController.deactivate
);

module.exports = router;
