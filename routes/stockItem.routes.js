const express = require('express');
const router = express.Router();
const StockItemController = require('../controllers/StockItem.controller');
const verifyToken = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/rbac.middleware');
const Validator = require('../validators/stockItem.validator');
const { validateDecommission } = require('../validators/machine.validator');

router.get('/', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN', 'SUPER_ADMIN'), StockItemController.list);
router.get('/:id', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN', 'SUPER_ADMIN'), StockItemController.getOne);
router.put('/:id', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN', 'SUPER_ADMIN'), Validator.validateUpdateStockItem, StockItemController.update);
router.post('/:id/decommission', verifyToken, requireRole('MANAGER', 'SUPERADMIN', 'SUPER_ADMIN'), validateDecommission, StockItemController.decommission);

module.exports = router;
