const express = require('express');
const router = express.Router();
const MachineController = require('../controllers/Machine.controller');
const verifyToken = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/rbac.middleware');
const Validator = require('../validators/machine.validator');

router.post('/', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN', 'SUPER_ADMIN'), Validator.validateAddMachine, MachineController.addMachine);
router.get('/', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN', 'SUPER_ADMIN'), MachineController.listMachines);
router.get('/stats', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN', 'SUPER_ADMIN'), MachineController.getStats);
router.get('/:id', verifyToken, MachineController.getMachine);
router.put('/:id', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN', 'SUPER_ADMIN'), Validator.validateEditMachine, MachineController.editMachine);
router.post('/:id/decommission', verifyToken, requireRole('MANAGER', 'SUPERADMIN', 'SUPER_ADMIN'), Validator.validateDecommission, MachineController.decommission);
router.post('/:id/map-tid', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN', 'SUPER_ADMIN'), Validator.validateMapTid, MachineController.mapTid);
router.post('/:id/unmap-tid', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN', 'SUPER_ADMIN'), MachineController.unmapTid);
router.post('/:id/transfer', verifyToken, requireRole('SUPERADMIN', 'SUPER_ADMIN'), MachineController.transferBranch);
router.get('/:id/custody', verifyToken, MachineController.getCustodyChain);
router.get('/:id/tid-history', verifyToken, MachineController.getTidHistory);

module.exports = router;
