const { query, body } = require('express-validator');

const validateDateRangeQuery = [
    query('from_date')
        .optional()
        .isISO8601().withMessage('from_date must be a valid date (YYYY-MM-DD)'),
    query('to_date')
        .optional()
        .isISO8601().withMessage('to_date must be a valid date (YYYY-MM-DD)')
        .custom((value, { req }) => {
            if (req.query.from_date && value < req.query.from_date) {
                throw new Error('to_date must be greater than or equal to from_date');
            }
            return true;
        }),
    query('year')
        .optional()
        .isInt({ min: 2020, max: 2099 }).withMessage('year must be between 2020 and 2099'),
    query('month')
        .optional()
        .isInt({ min: 1, max: 12 }).withMessage('month must be between 1 and 12')
];

const validateRegularisationSubmit = [
    body('attendance_id')
        .isUUID().withMessage('attendance_id must be a valid UUID'),
    body('reason')
        .isString().withMessage('reason must be a string')
        .isLength({ min: 10, max: 500 }).withMessage('reason must be between 10 and 500 characters')
];

const validateRegularisationReview = [
    body('status')
        .isIn(['APPROVED', 'REJECTED']).withMessage('status must be APPROVED or REJECTED'),
    body('corrected_punch_in')
        .optional({ checkFalsy: true })
        .isISO8601().withMessage('corrected_punch_in must be a valid ISO8601 datetime'),
    body('corrected_punch_out')
        .optional({ checkFalsy: true })
        .isISO8601().withMessage('corrected_punch_out must be a valid ISO8601 datetime')
];

module.exports = {
    validateDateRangeQuery,
    validateRegularisationSubmit,
    validateRegularisationReview
};
