const { body } = require('express-validator');

const validateApplyLeave = [
    body('leave_type')
        .isIn(['CASUAL', 'SICK', 'UNPAID']).withMessage('Invalid leave_type'),
    body('from_date')
        .isISO8601().withMessage('from_date must be a valid date (YYYY-MM-DD)'),
    body('to_date')
        .isISO8601().withMessage('to_date must be a valid date (YYYY-MM-DD)')
        .custom((value, { req }) => {
            if (req.body.from_date && value < req.body.from_date) {
                throw new Error('to_date must be greater than or equal to from_date');
            }
            return true;
        }),
    body('reason')
        .optional({ checkFalsy: true })
        .isString().withMessage('reason must be a string')
        .isLength({ max: 500 }).withMessage('reason must not exceed 500 characters')
];

const validateReviewLeave = [
    body('status')
        .isIn(['APPROVED', 'REJECTED']).withMessage('status must be APPROVED or REJECTED')
];

module.exports = {
    validateApplyLeave,
    validateReviewLeave
};
