const { body } = require('express-validator');

const validateCreateHoliday = [
    body('holiday_date')
        .isISO8601().withMessage('holiday_date must be a valid date (YYYY-MM-DD)'),
    body('description')
        .optional({ checkFalsy: true })
        .isString().withMessage('description must be a string')
        .isLength({ max: 200 }).withMessage('description must not exceed 200 characters'),
    body('branch_id')
        .optional({ checkFalsy: true })
        .isUUID().withMessage('branch_id must be a valid UUID')
];

module.exports = {
    validateCreateHoliday
};
