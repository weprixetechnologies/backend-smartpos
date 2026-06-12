const express = require('express');
const router = express.Router();
const EmployeeController = require('../controllers/Employee.controller');
const { validateRegister, validateEdit } = require('../validators/employee.validator');
const verifyToken = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/rbac.middleware');

router.post('/create', verifyToken, requireRole('SUPERADMIN', 'MANAGER'), validateRegister, EmployeeController.register);
router.get('/list', verifyToken, EmployeeController.list);
router.get('/me', verifyToken, EmployeeController.getMe);
router.get('/:id', verifyToken, EmployeeController.getOne);
router.put('/update/:id', verifyToken, validateEdit, EmployeeController.edit);
router.patch('/status/:id', verifyToken, requireRole('SUPERADMIN', 'SUPERADMIN', 'MANAGER'), EmployeeController.edit);
router.post('/reset-password', verifyToken, requireRole('SUPERADMIN', 'SUPERADMIN', 'MANAGER'), async (req, res, next) => {
    // Wrap to EmployeeController.edit for password update
    req.params.id = req.body.employeeID;
    return EmployeeController.edit(req, res, next);
});
// Legacy
router.delete('/:id', verifyToken, requireRole('SUPERADMIN', 'SUPERADMIN', 'MANAGER'), EmployeeController.remove);

module.exports = router;
