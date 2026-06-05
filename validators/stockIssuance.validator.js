const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }
    next();
};

const validateIssueStock = [
    body('stock_item_id').isUUID().withMessage('stock_item_id must be a valid UUID'),
    body('engineer_id').isUUID().withMessage('engineer_id must be a valid UUID'),
    body('ticket_id').optional({ checkFalsy: true }).isUUID().withMessage('ticket_id must be a valid UUID'),
    body('notes').optional({ checkFalsy: true }).trim().isLength({ max: 500 }).withMessage('Notes max 500 characters'),
    handleValidationErrors
];

const validateReturnStock = [
    body('stock_item_id').isUUID().withMessage('stock_item_id must be a valid UUID'),
    body('item_condition').isIn(['GOOD', 'DAMAGED', 'FAULTY']).withMessage('Invalid condition'),
    body('ticket_id').optional({ checkFalsy: true }).isUUID().withMessage('ticket_id must be a valid UUID'),
    body('photo_url').optional({ checkFalsy: true }).isURL().withMessage('photo_url must be a valid URL'),
    body('notes').optional({ checkFalsy: true }).trim().isLength({ max: 500 }).withMessage('Notes max 500 characters'),
    handleValidationErrors
];

module.exports = {
    validateIssueStock,
    validateReturnStock
};
