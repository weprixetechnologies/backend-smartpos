const express = require('express');
const router = express.Router();
const MachineDispatchController = require('../controllers/MachineDispatch.controller');
const verifyToken = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/rbac.middleware');
const Validator = require('../validators/machine.validator');

router.post('/:id/dispatch', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN', 'SUPER_ADMIN'), Validator.validateDispatchMachine, MachineDispatchController.dispatch);
router.post('/:id/confirm-receipt', verifyToken, requireRole('ENGINEER', 'OPERATOR', 'MANAGER', 'SUPERADMIN', 'SUPER_ADMIN'), MachineDispatchController.confirmReceipt);

module.exports = router;
