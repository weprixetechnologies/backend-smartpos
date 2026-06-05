const express = require('express');
const router = express.Router();
const MerchantMachineController = require('../controllers/MerchantMachine.controller');
const verifyToken = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/rbac.middleware');
const {
    validateAssignMachine,
    validateUnassignMachine
} = require('../validators/merchantMachine.validator');

// IMPORTANT: /history must be registered before general / routes
router.get('/:merchantId/machines/history', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPER_ADMIN', 'SUPERADMIN'), MerchantMachineController.machineHistory);

router.post('/:merchantId/machines', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPER_ADMIN', 'SUPERADMIN'), validateAssignMachine, MerchantMachineController.assign);
router.delete('/:merchantId/machines', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPER_ADMIN', 'SUPERADMIN'), validateUnassignMachine, MerchantMachineController.unassign);
router.get('/:merchantId/machines', verifyToken, MerchantMachineController.listMachines);

module.exports = router;
