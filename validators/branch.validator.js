const { body } = require('express-validator');
const validateRequest = require('../middlewares/validateRequest');

const createBranchSchema = [
    body('branch_code')
        .trim()
        .notEmpty().withMessage('Branch code is required')
        .isLength({ min: 2, max: 20 }).withMessage('Branch code must be between 2 and 20 characters')
        .matches(/^[A-Za-z0-9\-]+$/).withMessage('Only letters, digits, and hyphens allowed'),
    
    body('branch_name')
        .trim()
        .notEmpty().withMessage('Branch name is required')
        .isLength({ min: 1, max: 150 }).withMessage('Branch name must be between 1 and 150 characters'),
    
    body('address')
        .trim()
        .notEmpty().withMessage('Address is required')
        .isLength({ min: 1 }).withMessage('Address must not be empty'),
    
    body('contact_person')
        .optional({ nullable: true, checkFalsy: true })
        .trim()
        .isLength({ max: 100 }).withMessage('Contact person name is too long'),
    
    body('contact_mobile')
        .optional({ nullable: true, checkFalsy: true })
        .trim()
        .matches(/^[6-9]\d{9}$/).withMessage('Invalid Indian mobile number'),
    
    body('contact_email')
        .optional({ nullable: true, checkFalsy: true })
        .trim()
        .isEmail().withMessage('Invalid email format'),
    
    body('status')
        .optional()
        .isIn(['ACTIVE', 'INACTIVE']).withMessage('Status must be ACTIVE or INACTIVE'),
    
    body('pincode_ranges')
        .isArray({ min: 1 }).withMessage('At least one pincode range is required'),
    
    body('pincode_ranges.*.pincode_from')
        .trim()
        .matches(/^\d{6}$/).withMessage('Pincode from must be exactly 6 digits'),
    
    body('pincode_ranges.*.pincode_to')
        .trim()
        .matches(/^\d{6}$/).withMessage('Pincode to must be exactly 6 digits'),
        
    validateRequest
];

const updateBranchSchema = [
    body('branch_code')
        .not().exists().withMessage('Branch code is immutable and cannot be updated'),

    body('branch_name')
        .optional()
        .trim()
        .isLength({ min: 1, max: 150 }).withMessage('Branch name must be between 1 and 150 characters'),
    
    body('address')
        .optional()
        .trim()
        .isLength({ min: 1 }).withMessage('Address must not be empty'),
    
    body('contact_person')
        .optional({ nullable: true, checkFalsy: true })
        .trim()
        .isLength({ max: 100 }).withMessage('Contact person name is too long'),
    
    body('contact_mobile')
        .optional({ nullable: true, checkFalsy: true })
        .trim()
        .matches(/^[6-9]\d{9}$/).withMessage('Invalid Indian mobile number'),
    
    body('contact_email')
        .optional({ nullable: true, checkFalsy: true })
        .trim()
        .isEmail().withMessage('Invalid email format'),
    
    body('status')
        .optional()
        .isIn(['ACTIVE', 'INACTIVE']).withMessage('Status must be ACTIVE or INACTIVE'),
    
    body('pincode_ranges')
        .optional()
        .isObject().withMessage('pincode_ranges must be an object with upsert and delete arrays'),
        
    body('pincode_ranges.upsert')
        .optional()
        .isArray().withMessage('upsert must be an array'),
        
    body('pincode_ranges.upsert.*.id')
        .optional()
        .isUUID().withMessage('ID must be a valid UUID'),
        
    body('pincode_ranges.upsert.*.pincode_from')
        .optional()
        .trim()
        .matches(/^\d{6}$/).withMessage('Pincode from must be exactly 6 digits'),
    
    body('pincode_ranges.upsert.*.pincode_to')
        .optional()
        .trim()
        .matches(/^\d{6}$/).withMessage('Pincode to must be exactly 6 digits'),
        
    body('pincode_ranges.delete')
        .optional()
        .isArray().withMessage('delete must be an array of UUIDs'),
        
    body('pincode_ranges.delete.*')
        .isUUID().withMessage('ID must be a valid UUID'),

    validateRequest
];

const updateStatusSchema = [
    body('status')
        .notEmpty().withMessage('Status is required')
        .isIn(['ACTIVE', 'INACTIVE']).withMessage('Status must be ACTIVE or INACTIVE'),
        
    validateRequest
];

module.exports = {
    createBranchSchema,
    updateBranchSchema,
    updateStatusSchema
};
