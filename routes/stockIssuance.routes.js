const express = require('express');
const router = express.Router();
const StockIssuanceController = require('../controllers/StockIssuance.controller');
const verifyToken = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/rbac.middleware');
const Validator = require('../validators/stockIssuance.validator');

router.post('/', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN', 'SUPER_ADMIN'), Validator.validateIssueStock, StockIssuanceController.issue);
router.post('/return', verifyToken, Validator.validateReturnStock, StockIssuanceController.returnStock);
router.post('/:id/acknowledge', verifyToken, requireRole('ENGINEER'), StockIssuanceController.acknowledge);
router.get('/history', verifyToken, StockIssuanceController.history);

module.exports = router;
