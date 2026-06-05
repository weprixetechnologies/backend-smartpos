const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }
    next();
};

const validateCreateConsignment = [
    body('supplier_name').optional({ checkFalsy: true }).trim().isLength({ max: 200 }).withMessage('Supplier name max 200 characters'),
    body('dispatch_reference').optional({ checkFalsy: true }).trim().isLength({ max: 200 }).withMessage('Dispatch reference max 200 characters'),
    body('expected_count').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('expected_count must be min 1'),
    body('expected_arrival').optional({ checkFalsy: true }).isDate().withMessage('expected_arrival must be a valid date'),
    body('notes').optional({ checkFalsy: true }).trim().isLength({ max: 500 }).withMessage('Notes max 500 characters'),
    body('branch_id').optional({ checkFalsy: true }).isUUID().withMessage('branch_id must be valid UUID'),
    handleValidationErrors
];

const validateReceiveItem = [
    body('serial_number').trim().isLength({ min: 2, max: 100 }).withMessage('Serial number must be 2-100 characters'),
    body('category').isIn(['POS_TERMINAL', 'SPARE_PART', 'ACCESSORY', 'CONSUMABLE']).withMessage('Invalid category'),
    body('item_name').trim().isLength({ min: 2, max: 200 }).withMessage('Item name must be 2-200 characters'),
    body('brand').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Brand max 100 characters'),
    body('model').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Model max 100 characters'),
    body('item_condition').optional({ checkFalsy: true }).isIn(['GOOD', 'DAMAGED', 'FAULTY']).withMessage('Invalid condition'),
    body('notes').optional({ checkFalsy: true }).trim(),
    handleValidationErrors
];

const validateDiscrepancy = [
    body('description').trim().isLength({ min: 10, max: 1000 }).withMessage('Description must be 10-1000 characters'),
    handleValidationErrors
];

module.exports = {
    validateCreateConsignment,
    validateReceiveItem,
    validateDiscrepancy
};
