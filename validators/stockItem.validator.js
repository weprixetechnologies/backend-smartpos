const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }
    next();
};

const validateUpdateStockItem = [
    body('item_name').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 200 }).withMessage('Item name must be 2-200 characters'),
    body('brand').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Brand max 100 characters'),
    body('model').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Model max 100 characters'),
    body('item_condition').optional({ checkFalsy: true }).isIn(['GOOD', 'DAMAGED', 'FAULTY']).withMessage('Invalid condition'),
    body('notes').optional({ checkFalsy: true }).trim(),
    handleValidationErrors
];

module.exports = {
    validateUpdateStockItem
};
