const express = require('express');
const router = express.Router();
const ActionLogController = require('../controllers/ActionLog.controller');
const verifyToken = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/rbac.middleware');

// Add authentication / authorization middleware here if needed.
router.use(verifyToken);
router.use(requireRole('SUPERADMIN', 'MANAGER'));

router.get('/number/:log_number', ActionLogController.getByLogNumber);
router.get('/:id', ActionLogController.getById);
router.get('/', ActionLogController.getAll);

module.exports = router;
