const express = require('express');
const router = express.Router();
const AttendanceController = require('../controllers/Attendance.controller');
const verifyToken = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/rbac.middleware');
const validateRequest = require('../middlewares/validateRequest');
const { validateDateRangeQuery, validateRegularisationSubmit, validateRegularisationReview } = require('../validators/attendance.validator');

// /api/attendance/punch-in
router.post(
    '/punch-in',
    verifyToken,
    AttendanceController.punchIn
);

// /api/attendance/punch-out
router.post(
    '/punch-out',
    verifyToken,
    AttendanceController.punchOut
);

// /api/attendance/me
router.get(
    '/me',
    verifyToken,
    validateDateRangeQuery,
    validateRequest,
    AttendanceController.getMyAttendance
);

// /api/attendance/daily
router.get(
    '/daily',
    verifyToken,
    requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN'),
    AttendanceController.getDailyBranch
);

// /api/attendance/summary
router.get(
    '/summary',
    verifyToken,
    AttendanceController.getMonthlySummary
);

// /api/attendance/regularise/pending
router.get(
    '/regularise/pending',
    verifyToken,
    requireRole('MANAGER', 'SUPERADMIN'),
    AttendanceController.getPendingRegularisations
);

// /api/attendance/regularise
router.post(
    '/regularise',
    verifyToken,
    validateRegularisationSubmit,
    validateRequest,
    AttendanceController.submitRegularisation
);

// /api/attendance/regularise/:id/review
router.put(
    '/regularise/:id/review',
    verifyToken,
    requireRole('MANAGER', 'SUPERADMIN'),
    validateRegularisationReview,
    validateRequest,
    AttendanceController.reviewRegularisation
);

// /api/attendance/employee/:employeeId
// Must come after literal routes
router.get(
    '/employee/:employeeId',
    verifyToken,
    requireRole('MANAGER', 'SUPERADMIN'),
    validateDateRangeQuery,
    validateRequest,
    AttendanceController.getEmployeeAttendance
);

module.exports = router;
