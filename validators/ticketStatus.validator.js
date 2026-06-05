const { body } = require('express-validator');

const validateMarkMachinePicked = [
    body('photo_url').notEmpty().withMessage('photo_url is required').isURL().withMessage('photo_url must be a valid URL'),
    body('notes').optional().isString()
];

const validateMarkInOffice = [
    body('photo_url').notEmpty().withMessage('photo_url is required').isURL().withMessage('photo_url must be a valid URL'),
    body('notes').optional().isString()
];

module.exports = {
    validateMarkMachinePicked,
    validateMarkInOffice
};
