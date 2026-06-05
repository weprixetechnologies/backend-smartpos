const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }
    next();
};

const validateLogin = [
    body('identifier')
        .trim()
        .notEmpty().withMessage('Identifier is required'),
    body('password')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
    handleValidationErrors
];

const validateRefreshToken = [
    body('refreshToken')
        .trim()
        .notEmpty().withMessage('refreshToken is required'),
    handleValidationErrors
];

module.exports = {
    validateLogin,
    validateRefreshToken
};
