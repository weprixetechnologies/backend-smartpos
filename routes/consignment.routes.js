const express = require('express');
const router = express.Router();
const ConsignmentController = require('../controllers/Consignment.controller');
const verifyToken = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/rbac.middleware');
const Validator = require('../validators/consignment.validator');

router.post('/', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN', 'SUPER_ADMIN'), Validator.validateCreateConsignment, ConsignmentController.create);
router.get('/', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN', 'SUPER_ADMIN'), ConsignmentController.list);
router.get('/:id', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN', 'SUPER_ADMIN'), ConsignmentController.getOne);
router.post('/:id/receive', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN', 'SUPER_ADMIN'), Validator.validateReceiveItem, ConsignmentController.receiveItem);
router.post('/:id/discrepancy', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN', 'SUPER_ADMIN'), Validator.validateDiscrepancy, ConsignmentController.raiseDiscrepancy);
router.post('/:id/discrepancies/:discrepancyId/resolve', verifyToken, requireRole('MANAGER', 'SUPERADMIN', 'SUPER_ADMIN'), ConsignmentController.resolveDiscrepancy);
router.put('/:id/actual-count', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN', 'SUPER_ADMIN'), ConsignmentController.updateActualCount);
router.post('/:id/mark-arrived', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN', 'SUPER_ADMIN'), ConsignmentController.markArrived);

module.exports = router;
