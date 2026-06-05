const { body } = require('express-validator');

const validateCreateShift = [
    body('shift_name')
        .isString().withMessage('shift_name must be a string')
        .isLength({ min: 2, max: 100 }).withMessage('shift_name must be between 2 and 100 characters'),
    body('shift_type')
        .isIn(['MORNING', 'EVENING', 'FULL_DAY', 'CUSTOM']).withMessage('Invalid shift_type'),
    body('start_time')
        .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('start_time must be HH:MM or HH:MM:SS format'),
    body('end_time')
        .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('end_time must be HH:MM or HH:MM:SS format'),
    body('branch_id')
        .optional({ checkFalsy: true })
        .isUUID().withMessage('branch_id must be a valid UUID')
];

const validateAssignShift = [
    body('employee_id')
        .isUUID().withMessage('employee_id must be a valid UUID'),
    body('shift_id')
        .isUUID().withMessage('shift_id must be a valid UUID'),
    body('effective_from')
        .isISO8601().withMessage('effective_from must be a valid date'),
    body('effective_to')
        .optional({ checkFalsy: true })
        .isISO8601().withMessage('effective_to must be a valid date')
];

module.exports = {
    validateCreateShift,
    validateAssignShift
};
