const { body } = require('express-validator');

const validateAssignMachine = [
    body('machine_id').isUUID().withMessage('machine_id must be a valid UUID'),
    body('notes').optional({ checkFalsy: true }).isString().trim().isLength({ max: 500 }).withMessage('Notes max 500 characters')
];

const validateUnassignMachine = [
    body('machine_id').isUUID().withMessage('machine_id must be a valid UUID'),
    body('reason').optional({ checkFalsy: true }).isString().trim().isLength({ max: 500 }).withMessage('Reason max 500 characters')
];

module.exports = {
    validateAssignMachine,
    validateUnassignMachine
};
