const express = require('express');
const router = express.Router();
const TicketOtpController = require('../controllers/TicketOtp.controller');
const verifyToken = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/rbac.middleware');
const { validateOtp, validateFallbackCode } = require('../validators/ticketOtp.validator');
const validateRequest = require('../middlewares/validateRequest');

router.post('/:id/otp/arrival/validate', verifyToken, requireRole('ENGINEER'), validateOtp, validateRequest, TicketOtpController.validateArrivalOtp);
router.post('/:id/otp/fallback/request', verifyToken, requireRole('ENGINEER'), TicketOtpController.requestFallback);
router.post('/:id/otp/fallback/generate', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN'), TicketOtpController.generateFallback);
router.post('/:id/otp/fallback/validate', verifyToken, requireRole('ENGINEER'), validateFallbackCode, validateRequest, TicketOtpController.validateFallback);

router.post('/:id/otp/signoff/send', verifyToken, requireRole('ENGINEER'), TicketOtpController.sendSignoffOtp);
router.post('/:id/otp/signoff/validate', verifyToken, requireRole('ENGINEER'), validateOtp, validateRequest, TicketOtpController.validateSignoffOtp);

module.exports = router;
