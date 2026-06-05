const express = require('express');
const router = express.Router();
const TicketStatusController = require('../controllers/TicketStatus.controller');
const verifyToken = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/rbac.middleware');
const { validateMarkMachinePicked, validateMarkInOffice } = require('../validators/ticketStatus.validator');
const validateRequest = require('../middlewares/validateRequest');

router.post('/:id/status/en-route', verifyToken, requireRole('ENGINEER'), TicketStatusController.markEnRoute);
router.post('/:id/status/arrived', verifyToken, requireRole('ENGINEER'), TicketStatusController.markArrived);
router.post('/:id/status/machine-picked', verifyToken, requireRole('ENGINEER'), validateMarkMachinePicked, validateRequest, TicketStatusController.markMachinePicked);
router.post('/:id/status/in-office', verifyToken, requireRole('ENGINEER', 'OPERATOR'), validateMarkInOffice, validateRequest, TicketStatusController.markInOffice);
router.post('/:id/status/under-repair', verifyToken, requireRole('ENGINEER', 'OPERATOR'), TicketStatusController.markUnderRepair);
router.post('/:id/status/ready-deploy', verifyToken, requireRole('ENGINEER', 'OPERATOR'), TicketStatusController.markReadyDeploy);

module.exports = router;
