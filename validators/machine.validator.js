const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }
    next();
};

const validateAddMachine = [
    body('serial_number').trim().isLength({ min: 2, max: 100 }).withMessage('Serial number must be 2-100 characters'),
    body('tid').optional({ checkFalsy: true }).trim().isLength({ max: 50 }).withMessage('TID max 50 characters'),
    body('model').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Model max 100 characters'),
    body('brand').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Brand max 100 characters'),
    body('branch_id').optional({ checkFalsy: true }).isUUID().withMessage('branch_id must be valid UUID'),
    body('warranty_expiry').optional({ checkFalsy: true }).isDate().withMessage('Warranty expiry must be a valid date'),
    handleValidationErrors
];

const validateEditMachine = [
    body('serial_number').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 100 }).withMessage('Serial number must be 2-100 characters'),
    body('model').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Model max 100 characters'),
    body('brand').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Brand max 100 characters'),
    body('warranty_expiry').optional({ checkFalsy: true }).isDate().withMessage('Warranty expiry must be a valid date'),
    body('branch_id').optional({ checkFalsy: true }).isUUID().withMessage('branch_id must be a valid UUID'),
    body('is_chronic_fault').optional().isBoolean().withMessage('is_chronic_fault must be boolean'),
    handleValidationErrors
];

const validateMapTid = [
    body('tid').trim().notEmpty().isLength({ max: 50 }).withMessage('TID is required and max 50 characters'),
    body('merchant_id').isUUID().withMessage('merchant_id is required and must be a valid UUID'),
    body('ticket_id').optional({ checkFalsy: true }).isUUID().withMessage('ticket_id must be a valid UUID'),
    handleValidationErrors
];

const validateDispatchMachine = [
    body('to_entity').trim().isLength({ min: 2, max: 200 }).withMessage('to_entity must be 2-200 characters'),
    body('to_engineer_id').optional({ checkFalsy: true }).isUUID().withMessage('to_engineer_id must be a valid UUID'),
    body('photo_url').optional({ checkFalsy: true }).isURL().withMessage('photo_url must be a valid URL'),
    body('ticket_id').optional({ checkFalsy: true }).isUUID().withMessage('ticket_id must be a valid UUID'),
    body('notes').optional({ checkFalsy: true }).trim().isLength({ max: 500 }).withMessage('Notes max 500 characters'),
    handleValidationErrors
];

const validateDecommission = [
    body('reason').trim().isLength({ min: 10, max: 500 }).withMessage('Reason must be 10-500 characters'),
    handleValidationErrors
];

module.exports = {
    validateAddMachine,
    validateEditMachine,
    validateMapTid,
    validateDispatchMachine,
    validateDecommission
};
