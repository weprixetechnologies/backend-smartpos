const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }
    next();
};

const validateRegister = [
    body('full_name')
        .trim()
        .isString().withMessage('Full name must be a string')
        .isLength({ min: 2, max: 150 }).withMessage('full_name must be 2-150 characters'),
    body('mobile')
        .trim()
        .isNumeric().withMessage('Mobile must contain only numbers')
        .isLength({ min: 10, max: 20 }).withMessage('mobile must be 10-20 characters'),
    body('email')
        .optional({ nullable: true, checkFalsy: true })
        .trim()
        .isEmail().withMessage('email must be a valid email format'),
    body('password')
        .isLength({ min: 8 }).withMessage('password must be at least 8 characters long')
        .matches(/^(?=.*[A-Za-z])(?=.*\d)/).withMessage('password must contain at least 1 number and 1 letter'),
    body('role')
        .isIn(['ENGINEER', 'OPERATOR', 'MANAGER', 'SUPERADMIN']).withMessage('role must be one of : ENGINEER, OPERATOR, MANAGER, SUPERADMIN'),
    body('branch_id').isUUID().withMessage('branch_id must be a valid UUID format'),
    body('base_salary')
        .optional({ nullable: true, checkFalsy: true })
        .isFloat({ min: 0 }).withMessage('base_salary must be a positive number'),
    body('date_of_joining')
        .optional({ nullable: true, checkFalsy: true })
        .isISO8601().withMessage('date_of_joining must be a valid date (YYYY-MM-DD)'),
    handleValidationErrors
];

const validateEdit = [
    body('full_name')
        .optional()
        .trim()
        .isString().withMessage('Full name must be a string')
        .isLength({ min: 2, max: 150 }).withMessage('full_name must be 2-150 characters'),
    body('mobile')
        .optional()
        .trim()
        .isNumeric().withMessage('Mobile must contain only numbers')
        .isLength({ min: 10, max: 20 }).withMessage('mobile must be 10-20 characters'),
    body('email')
        .optional({ nullable: true, checkFalsy: true })
        .trim()
        .isEmail().withMessage('email must be a valid email'),
    body('password')
        .optional()
        .isLength({ min: 8 }).withMessage('password must be at least 8 characters long')
        .matches(/^(?=.*[A-Za-z])(?=.*\d)/).withMessage('password must contain at least 1 number and 1 letter'),
    body('role')
        .optional()
        .isIn(['ENGINEER', 'OPERATOR', 'MANAGER', 'SUPERADMIN']).withMessage('role must be a valid ENUM value'),
    body('branch_id')
        .optional()
        .isUUID().withMessage('branch_id must be a valid UUID format'),
    body('base_salary')
        .optional({ nullable: true, checkFalsy: true })
        .isFloat({ min: 0 }).withMessage('base_salary must be a positive number'),
    body('date_of_joining')
        .optional({ nullable: true, checkFalsy: true })
        .isISO8601().withMessage('date_of_joining must be a valid date'),
    body('status')
        .optional()
        .isIn(['ACTIVE', 'INACTIVE']).withMessage('status must be ACTIVE or INACTIVE'),
    body('profile_photo')
        .optional({ nullable: true, checkFalsy: true })
        .isString().withMessage('profile_photo must be a string'),
    handleValidationErrors
];

module.exports = {
    validateRegister,
    validateEdit
};
