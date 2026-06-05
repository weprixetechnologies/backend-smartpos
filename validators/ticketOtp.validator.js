const { body } = require('express-validator');

const validateOtp = [
    body('otp').notEmpty().withMessage('otp is required').isString().isLength({ min: 6, max: 6 }).isNumeric().withMessage('otp must be exactly 6 numeric digits')
];

const validateFallbackCode = [
    body('fallback_code').notEmpty().withMessage('fallback_code is required').isString().isLength({ min: 6, max: 6 }).withMessage('fallback_code must be exactly 6 characters')
];

module.exports = {
    validateOtp,
    validateFallbackCode
};
