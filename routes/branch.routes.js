const express = require('express');
const router = express.Router();
const BranchController = require('../controllers/Branch.controller');
const verifyToken = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/rbac.middleware');
const { createBranchSchema, updateBranchSchema, updateStatusSchema } = require('../validators/branch.validator');

// All branch routes require authentication
router.use(verifyToken);

// List branches (SUPERADMIN, MANAGER)
router.get('/', requireRole('SUPERADMIN', 'MANAGER'), BranchController.list);

// Get single branch details (SUPERADMIN, MANAGER)
router.get('/:id', requireRole('SUPERADMIN', 'MANAGER'), BranchController.get);

// Get pre-delete dependency counts (SUPERADMIN, MANAGER)
router.get('/:id/dependencies', requireRole('SUPERADMIN', 'MANAGER'), BranchController.getDependencies);

// Create branch (SUPERADMIN only)
router.post('/', requireRole('SUPERADMIN'), createBranchSchema, BranchController.create);

// Update branch details (SUPERADMIN only)
router.patch('/:id', requireRole('SUPERADMIN'), updateBranchSchema, BranchController.update);

// Toggle branch status (SUPERADMIN, MANAGER)
router.patch('/:id/status', requireRole('SUPERADMIN', 'MANAGER'), updateStatusSchema, BranchController.updateStatus);

// Delete branch (SUPERADMIN only)
router.delete('/:id', requireRole('SUPERADMIN'), BranchController.remove);

module.exports = router;
