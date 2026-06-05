const express = require('express');
const router = express.Router();
const TicketController = require('../controllers/Ticket.controller');
const verifyToken = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/rbac.middleware');
const { 
    validateCreateTicket, 
    validateAssignEngineer, 
    validateCancelTicket, 
    validateCloseCode, 
    validateForceClose, 
    validateJobSheet, 
    validateAddAttachment, 
    validateSendMessage 
} = require('../validators/ticket.validator');
const validateRequest = require('../middlewares/validateRequest');

router.post('/', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN'), validateCreateTicket, validateRequest, TicketController.create);
router.get('/', verifyToken, TicketController.list);
router.get('/:id', verifyToken, TicketController.getOne);

router.post('/:id/assign', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN'), validateAssignEngineer, validateRequest, TicketController.assign);
router.post('/:id/cancel', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN'), validateCancelTicket, validateRequest, TicketController.cancel);

router.put('/:id/type', verifyToken, requireRole('ENGINEER', 'OPERATOR', 'MANAGER', 'SUPERADMIN'), TicketController.updateServiceType);

router.get('/:id/workflow', verifyToken, TicketController.getWorkflowState);
router.post('/:id/milestone', verifyToken, requireRole('ENGINEER'), TicketController.submitMilestone);
router.post('/:id/request-closure', verifyToken, requireRole('ENGINEER'), TicketController.requestClosure);

router.post('/:id/attachments', verifyToken, validateAddAttachment, validateRequest, TicketController.addAttachment);
router.post('/:id/messages', verifyToken, validateSendMessage, validateRequest, TicketController.sendMessage);

router.post('/:id/job-sheet', verifyToken, requireRole('ENGINEER'), validateJobSheet, validateRequest, TicketController.submitJobSheet);

router.post('/:id/close-code/generate', verifyToken, requireRole('OPERATOR', 'MANAGER', 'SUPERADMIN'), TicketController.generateCloseCode);
router.post('/:id/close-code/submit', verifyToken, requireRole('ENGINEER'), validateCloseCode, validateRequest, TicketController.submitCloseCode);

router.post('/:id/close', verifyToken, requireRole('ENGINEER', 'OPERATOR', 'MANAGER', 'SUPERADMIN'), TicketController.finalClose);
router.post('/:id/force-close', verifyToken, requireRole('MANAGER', 'SUPERADMIN'), validateForceClose, validateRequest, TicketController.forceClose);

module.exports = router;
