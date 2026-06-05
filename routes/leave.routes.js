const express = require('express');
const router = express.Router();
const LeaveController = require('../controllers/Leave.controller');
const verifyToken = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/rbac.middleware');
const validateRequest = require('../middlewares/validateRequest');
const { validateApplyLeave, validateReviewLeave } = require('../validators/leave.validator');

// /api/leaves/me
// MUST come before /:id
router.get(
    '/me',
    verifyToken,
    LeaveController.getMyLeaves
);

// /api/leaves/pending
// MUST come before /:id
router.get(
    '/pending',
    verifyToken,
    requireRole('MANAGER', 'SUPERADMIN'),
    LeaveController.getPending
);

// /api/leaves
router.post(
    '/',
    verifyToken,
    validateApplyLeave,
    validateRequest,
    LeaveController.apply
);

// /api/leaves/:id/review
router.put(
    '/:id/review',
    verifyToken,
    requireRole('MANAGER', 'SUPERADMIN'),
    validateReviewLeave,
    validateRequest,
    LeaveController.review
);

// /api/leaves/:id
router.delete(
    '/:id',
    verifyToken,
    LeaveController.cancel
);

module.exports = router;
