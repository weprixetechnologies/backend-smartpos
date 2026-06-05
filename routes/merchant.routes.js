const express = require('express');
const router = express.Router();
const MerchantController = require('../controllers/Merchant.controller');
const verifyToken = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/rbac.middleware');
const {
    validateRegisterMerchant,
    validateEditMerchant,
    validateDeactivate,
    validateSearchMobile,
    validateSearchPincode
} = require('../validators/merchant.validator');

// IMPORTANT: Search routes must be registered before /:id routes
router.get('/search', verifyToken, validateSearchMobile, MerchantController.searchByMobile);
router.get('/search-pincode', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPER_ADMIN', 'SUPERADMIN'), validateSearchPincode, MerchantController.searchByPincode);

router.post('/', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPER_ADMIN', 'SUPERADMIN'), validateRegisterMerchant, MerchantController.register);
router.get('/', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPER_ADMIN', 'SUPERADMIN'), MerchantController.list);

router.get('/:id', verifyToken, MerchantController.getOne);
router.put('/:id', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPER_ADMIN', 'SUPERADMIN'), validateEditMerchant, MerchantController.edit);

router.post('/:id/deactivate', verifyToken, requireRole('MANAGER', 'SUPER_ADMIN', 'SUPERADMIN'), validateDeactivate, MerchantController.deactivate);
router.post('/:id/reactivate', verifyToken, requireRole('MANAGER', 'SUPER_ADMIN', 'SUPERADMIN'), MerchantController.reactivate);

module.exports = router;
