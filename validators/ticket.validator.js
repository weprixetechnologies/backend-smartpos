const { body } = require('express-validator');

const validateCreateTicket = [
    body('service_type').notEmpty().withMessage('service_type is required').isIn(['REPAIR', 'PICKUP', 'REPLACEMENT', 'INSTALLATION', 'DEINSTALLATION', 'MISC_SERV']).withMessage('Invalid service_type'),
    body('merchant_name').notEmpty().withMessage('merchant_name is required').isLength({ min: 2, max: 200 }).withMessage('merchant_name must be between 2 and 200 characters'),
    body('merchant_address').notEmpty().withMessage('merchant_address is required'),
    body('merchant_pincode').notEmpty().withMessage('merchant_pincode is required').isLength({ min: 6, max: 6 }).isNumeric().withMessage('merchant_pincode must be 6 digits'),
    body('merchant_mobile').notEmpty().withMessage('merchant_mobile is required').isLength({ min: 10, max: 10 }).isNumeric().withMessage('merchant_mobile must be 10 digits'),
    body('merchant_email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email format'),
    body('business_name').optional().isString(),
    body('machine_id').optional({ checkFalsy: true }).isUUID().withMessage('Invalid machine_id format'),
    body('complaint_category').optional().isString().isLength({ max: 100 }),
    body('complaint_description').optional().isString(),
    body('priority').optional().isIn(['NORMAL', 'URGENT', 'CRITICAL']),
    body('source').optional().isIn(['CUSTOMER_PORTAL', 'OPERATOR_RAISED', 'BANK_TRIGGERED']),
    body('branch_id').optional({ checkFalsy: true }).isUUID()
];

const validateAssignEngineer = [
    body('engineer_id').notEmpty().withMessage('engineer_id is required').isUUID().withMessage('Invalid engineer_id format')
];

const validateCancelTicket = [
    body('cancelled_reason').notEmpty().withMessage('cancelled_reason is required').isString().isLength({ min: 10 }).withMessage('cancelled_reason must be at least 10 characters')
];

const validateCloseCode = [
    body('close_code').notEmpty().withMessage('close_code is required').isString().isLength({ min: 6, max: 6 }).withMessage('close_code must be exactly 6 characters')
];

const validateForceClose = [
    body('force_close_reason').notEmpty().withMessage('force_close_reason is required').isString().isLength({ min: 10 }).withMessage('force_close_reason must be at least 10 characters')
];

const validateJobSheet = [
    body('work_done').notEmpty().withMessage('work_done is required').isString().isLength({ min: 10 }).withMessage('work_done must be at least 10 characters'),
    body('parts_replaced').optional().isString(),
    body('time_on_site_minutes').notEmpty().withMessage('time_on_site_minutes is required').isInt({ min: 1 }).withMessage('time_on_site_minutes must be a positive integer'),
    body('merchant_signoff_name').optional({ checkFalsy: true }).isString().isLength({ max: 150 })
];

const validateAddAttachment = [
    body('file_url').notEmpty().withMessage('file_url is required').isURL().withMessage('file_url must be a valid URL'),
    body('description').optional().isString().isLength({ max: 200 })
];

const validateSendMessage = [
    body('message').optional().isString(),
    body('image_url').optional({ checkFalsy: true }).isURL().withMessage('image_url must be a valid URL'),
    body().custom((value) => {
        if (!value.message && !value.image_url) {
            throw new Error('At least one of message or image_url must be provided');
        }
        return true;
    })
];

module.exports = {
    validateCreateTicket,
    validateAssignEngineer,
    validateCancelTicket,
    validateCloseCode,
    validateForceClose,
    validateJobSheet,
    validateAddAttachment,
    validateSendMessage
};
