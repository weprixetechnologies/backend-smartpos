const { body, query } = require('express-validator');

const validateRegisterMerchant = [
    body('full_name').isString().trim().isLength({ min: 2, max: 200 }).withMessage('Full name must be between 2 and 200 characters'),
    body('business_name').optional({ checkFalsy: true }).isString().trim().isLength({ max: 200 }).withMessage('Business name max 200 characters'),
    body('mobile').isString().matches(/^\d{10}$/).withMessage('Mobile must be exactly 10 digits'),
    body('pincode').isString().matches(/^\d{6}$/).withMessage('Pincode must be exactly 6 digits'),
    body('address').isString().trim().isLength({ min: 5, max: 500 }).withMessage('Address must be between 5 and 500 characters'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email format'),
    body('branch_id').optional({ checkFalsy: true }).isUUID().withMessage('branch_id must be a valid UUID')
];

const validateEditMerchant = [
    body('full_name').optional().isString().trim().isLength({ min: 2, max: 200 }).withMessage('Full name must be between 2 and 200 characters'),
    body('business_name').optional({ checkFalsy: true }).isString().trim().isLength({ max: 200 }).withMessage('Business name max 200 characters'),
    body('mobile').optional().isString().matches(/^\d{10}$/).withMessage('Mobile must be exactly 10 digits'),
    body('pincode').optional().isString().matches(/^\d{6}$/).withMessage('Pincode must be exactly 6 digits'),
    body('address').optional().isString().trim().isLength({ min: 5, max: 500 }).withMessage('Address must be between 5 and 500 characters'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email format')
];

const validateDeactivate = [
    body('reason').isString().trim().isLength({ min: 10, max: 500 }).withMessage('Reason must be between 10 and 500 characters')
];

const validateSearchMobile = [
    query('mobile').isString().matches(/^\d{10}$/).withMessage('Mobile must be exactly 10 digits')
];

const validateSearchPincode = [
    query('pincode').isString().matches(/^\d{6}$/).withMessage('Pincode must be exactly 6 digits')
];

module.exports = {
    validateRegisterMerchant,
    validateEditMerchant,
    validateDeactivate,
    validateSearchMobile,
    validateSearchPincode
};
