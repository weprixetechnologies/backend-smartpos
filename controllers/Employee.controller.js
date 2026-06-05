const EmployeeService = require('../services/Employee.service');
const logger = require('../utils/logger');

async function register(req, res, next) {
    logger.info(`[EmployeeController.register] Request initiated by user ID: ${req.user?.id} (${req.user?.role})`);
    logger.info(`[EmployeeController.register] Payload:`, { ...req.body, password: req.body.password ? '***' : undefined });
    try {
        const actorUser = {
            ...req.user,
            ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
            device: req.headers['user-agent'] || 'unknown'
        };

        const employee = await EmployeeService.registerEmployee(actorUser, req.body);
        logger.info(`[EmployeeController.register] Successfully created employee ID: ${employee.id} (${employee.employee_code})`);
        return res.status(201).json({
            success: true,
            data: employee
        });
    } catch (err) {
        logger.error(`[EmployeeController.register] Error creating employee: ${err.message || err}`, err);
        next(err);
    }
}

async function getOne(req, res, next) {
    logger.info(`[EmployeeController.getOne] Fetching employee ID: ${req.params.id} by user ID: ${req.user?.id} (${req.user?.role})`);
    try {
        const employee = await EmployeeService.getEmployee(req.user, req.params.id);
        return res.json({
            success: true,
            data: employee
        });
    } catch (err) {
        next(err);
    }
}

async function list(req, res, next) {
    logger.info(`[EmployeeController.list] Listing employees by user ID: ${req.user?.id} (${req.user?.role})`, req.query);
    try {
        const result = await EmployeeService.listEmployees(req.user, req.query);
        return res.json({
            success: true,
            ...result
        });
    } catch (err) {
        next(err);
    }
}

async function edit(req, res, next) {
    logger.info(`[EmployeeController.edit] Editing employee ID: ${req.params.id} by user ID: ${req.user?.id} (${req.user?.role})`);
    try {
        const actorUser = {
            ...req.user,
            ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
            device: req.headers['user-agent'] || 'unknown'
        };

        const updatedEmployee = await EmployeeService.editEmployee(actorUser, req.params.id, req.body);
        return res.json({
            success: true,
            data: updatedEmployee
        });
    } catch (err) {
        next(err);
    }
}

async function remove(req, res, next) {
    logger.info(`[EmployeeController.remove] Deleting employee ID: ${req.params.id} by user ID: ${req.user?.id} (${req.user?.role})`);
    try {
        const actorUser = {
            ...req.user,
            ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
            device: req.headers['user-agent'] || 'unknown'
        };

        const result = await EmployeeService.deleteEmployee(actorUser, req.params.id);
        return res.json({
            success: true,
            message: result.message
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    register,
    getOne,
    list,
    edit,
    remove
};
