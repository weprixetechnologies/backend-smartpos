const bcrypt = require('bcryptjs');
const EmployeeModel = require('../models/Employee.model');
const RefreshTokenModel = require('../models/RefreshToken.model');
const auditEmitter = require('../utils/auditEmitter');
const safeEmployee = require('../utils/safeEmployee');

const createError = (status, message) => {
    const err = new Error(message);
    err.status = status;
    return err;
};

async function registerEmployee(actorUser, payload) {
    // 1. Role gate
    if (actorUser.role === 'OPERATOR' || actorUser.role === 'ENGINEER') {
        throw createError(403, 'Forbidden: You do not have permission to register employees');
    }

    if (actorUser.role === 'MANAGER') {
        if (payload.branch_id !== actorUser.branch_id) {
            throw createError(403, 'Forbidden: Managers can only register employees in their own branch');
        }
        if (payload.role === 'SUPERADMIN' || payload.role === 'SUPERADMIN' || payload.role === 'MANAGER') {
            throw createError(403, 'Forbidden: Managers cannot create SUPERADMIN or MANAGER roles');
        }
    }

    // 2. Uniqueness checks
    const existingMobile = await EmployeeModel.findByMobileOrEmail(payload.mobile);
    if (existingMobile) {
        throw createError(409, 'Mobile already registered');
    }

    if (payload.email) {
        const existingEmail = await EmployeeModel.findByMobileOrEmail(payload.email);
        if (existingEmail) {
            throw createError(409, 'Email already registered');
        }
    }

    // 3. Hash password
    const password_hash = await bcrypt.hash(payload.password, 12);

    // 4. Create in DB
    const newEmployee = await EmployeeModel.create({
        full_name: payload.full_name,
        mobile: payload.mobile,
        email: payload.email || null,
        password_hash,
        role: payload.role,
        branch_id: payload.branch_id,
        base_salary: payload.base_salary || null,
        date_of_joining: payload.date_of_joining || null,
        profile_photo: payload.profile_photo || null,
        employee_code: payload.employee_code || null,
        status: payload.status || 'ACTIVE'
    });

    // 5. Emit audit
    auditEmitter.emit('audit', {
        module: 'EMPLOYEE',
        action_code: 'EMPLOYEE_REGISTERED',
        actor_id: actorUser.id,
        actor_name: actorUser.name || null,
        actor_role: actorUser.role,
        actor_ip: actorUser.ip || null,
        actor_device: actorUser.device || null,
        branch_id: actorUser.branch_id,
        trigger_type: 'USER',
        entity_type: 'employees',
        entity_id: newEmployee.id,
        new_state: safeEmployee(newEmployee)
    });

    return safeEmployee(newEmployee);
}

async function editEmployee(actorUser, targetId, payload) {
    // 1. Fetch target
    const target = await EmployeeModel.findById(targetId);
    if (!target) {
        throw createError(404, 'Employee not found');
    }

    // 2. Determine allowed fields based on role + relationship
    let allowedFields = [];

    if (actorUser.role === 'ENGINEER' || actorUser.role === 'OPERATOR') {
        if (targetId !== actorUser.id) {
            throw createError(403, 'Forbidden: You can only edit your own profile');
        }
        allowedFields = ['full_name', 'mobile', 'email', 'profile_photo', 'password'];
    } else if (actorUser.role === 'MANAGER') {
        if (targetId === actorUser.id) {
            allowedFields = ['full_name', 'mobile', 'email', 'profile_photo', 'password'];
        } else {
            // Check if subordinate in own branch
            if (target.branch_id !== actorUser.branch_id) {
                throw createError(403, 'Forbidden: Managers can only edit employees in their own branch');
            }
            if (target.role === 'SUPERADMIN' || target.role === 'SUPERADMIN' || target.role === 'MANAGER') {
                throw createError(403, 'Forbidden: Managers cannot edit SUPERADMIN or MANAGER roles');
            }
            if (payload.role && (payload.role === 'SUPERADMIN' || payload.role === 'SUPERADMIN' || payload.role === 'MANAGER')) {
                throw createError(403, 'Forbidden: Managers cannot assign SUPERADMIN or MANAGER roles');
            }
            if (payload.branch_id && payload.branch_id !== actorUser.branch_id) {
                throw createError(403, 'Forbidden: Managers cannot change branch assignment');
            }
            allowedFields = ['full_name', 'mobile', 'email', 'profile_photo', 'base_salary', 'date_of_joining', 'status', 'password', 'role', 'employee_code'];
        }
    } else if (actorUser.role === 'SUPERADMIN' || actorUser.role === 'SUPERADMIN') {
        if (targetId === actorUser.id) {
            // Prevent self-lockout
            if (payload.role !== undefined && payload.role !== target.role) {
                throw createError(403, 'Forbidden: SUPERADMIN cannot edit their own role');
            }
            if (payload.status !== undefined && payload.status !== target.status) {
                throw createError(403, 'Forbidden: SUPERADMIN cannot edit their own status');
            }
            allowedFields = ['full_name', 'mobile', 'email', 'profile_photo', 'base_salary', 'date_of_joining', 'password', 'employee_code'];
        } else {
            allowedFields = ['full_name', 'mobile', 'email', 'profile_photo', 'base_salary', 'date_of_joining', 'status', 'role', 'branch_id', 'password', 'employee_code'];
        }
    }

    // 3. Clean payload
    const cleanedFields = {};
    for (const key of allowedFields) {
        if (payload[key] !== undefined) {
            cleanedFields[key] = payload[key];
        }
    }

    // At least one editable field must be present
    if (Object.keys(cleanedFields).length === 0) {
        throw createError(400, 'At least one editable field must be provided');
    }

    // 4. Validate unique mobile / email
    if (cleanedFields.mobile && cleanedFields.mobile !== target.mobile) {
        const existingMobile = await EmployeeModel.findByMobileOrEmail(cleanedFields.mobile);
        if (existingMobile) {
            throw createError(409, 'Mobile already registered');
        }
    }

    if (cleanedFields.email && cleanedFields.email !== target.email) {
        const existingEmail = await EmployeeModel.findByMobileOrEmail(cleanedFields.email);
        if (existingEmail) {
            throw createError(409, 'Email already registered');
        }
    }

    if (cleanedFields.employee_code && cleanedFields.employee_code !== target.employee_code) {
        const existingCode = await EmployeeModel.findByEmployeeCode(cleanedFields.employee_code);
        if (existingCode) {
            throw createError(409, 'Employee Code already exists');
        }
    }

    // 5. Handle password hash
    if (cleanedFields.password !== undefined) {
        cleanedFields.password_hash = await bcrypt.hash(cleanedFields.password, 12);
        delete cleanedFields.password;
    }

    // 6. State capture
    const previous_state = safeEmployee(target);

    // 7. Update in DB
    const updated = await EmployeeModel.update(targetId, cleanedFields);

    // If target is deactivated, revoke all their refresh tokens immediately
    if (cleanedFields.status === 'INACTIVE') {
        await RefreshTokenModel.revokeAllForEmployee(targetId);
    }

    // 8. Emit audit
    auditEmitter.emit('audit', {
        module: 'EMPLOYEE',
        action_code: 'EMPLOYEE_UPDATED',
        actor_id: actorUser.id,
        actor_name: actorUser.name || null,
        actor_role: actorUser.role,
        actor_ip: actorUser.ip || null,
        actor_device: actorUser.device || null,
        branch_id: actorUser.branch_id,
        trigger_type: 'USER',
        entity_type: 'employees',
        entity_id: targetId,
        previous_state,
        new_state: safeEmployee(updated)
    });

    return safeEmployee(updated);
}

async function deleteEmployee(actorUser, targetId) {
    // 1. Fetch target
    const target = await EmployeeModel.findById(targetId);
    if (!target) {
        throw createError(404, 'Employee not found');
    }

    // 2. Prevent self deletion
    if (targetId === actorUser.id) {
        throw createError(403, 'Forbidden: You cannot delete yourself');
    }

    // 3. Permission gate
    if (actorUser.role === 'OPERATOR' || actorUser.role === 'ENGINEER') {
        throw createError(403, 'Forbidden: You do not have permission to delete employees');
    }

    if (actorUser.role === 'MANAGER') {
        if (target.branch_id !== actorUser.branch_id) {
            throw createError(403, 'Forbidden: Managers can only delete employees in their own branch');
        }
        if (target.role === 'SUPERADMIN' || target.role === 'SUPERADMIN' || target.role === 'MANAGER') {
            throw createError(403, 'Forbidden: Managers cannot delete SUPERADMIN or MANAGER subordinates');
        }
    }

    // 4. Deactivation checks
    if (target.status === 'INACTIVE') {
        throw createError(409, 'Employee already deactivated');
    }

    // 5. Deactivate (soft delete)
    await EmployeeModel.softDelete(targetId);

    // 6. Force logout (revoke all refresh tokens)
    await RefreshTokenModel.revokeAllForEmployee(targetId);

    // 7. Emit audit
    auditEmitter.emit('audit', {
        module: 'EMPLOYEE',
        action_code: 'EMPLOYEE_DEACTIVATED',
        actor_id: actorUser.id,
        actor_name: actorUser.name || null,
        actor_role: actorUser.role,
        actor_ip: actorUser.ip || null,
        actor_device: actorUser.device || null,
        branch_id: actorUser.branch_id,
        trigger_type: 'USER',
        entity_type: 'employees',
        entity_id: targetId,
        previous_state: safeEmployee(target)
    });

    return { message: 'Employee deactivated successfully' };
}

async function getEmployee(actorUser, targetId) {
    const target = await EmployeeModel.findById(targetId);
    if (!target) {
        throw createError(404, 'Employee not found');
    }

    // Permission check
    if (actorUser.role === 'ENGINEER' || actorUser.role === 'OPERATOR') {
        if (targetId !== actorUser.id) {
            throw createError(403, 'Forbidden: You can only view your own profile');
        }
    } else if (actorUser.role === 'MANAGER') {
        if (target.branch_id !== actorUser.branch_id) {
            throw createError(403, 'Forbidden: Managers can only fetch employees in their own branch');
        }
    }

    return safeEmployee(target);
}

async function listEmployees(actorUser, query) {
    // Permission check
    if (actorUser.role === 'ENGINEER') {
        throw createError(403, 'Forbidden: You do not have permission to list employees');
    }

    const filters = {
        branch_id: query.branch_id || undefined,
        role: query.role || undefined,
        status: query.status || undefined,
        page: query.page || undefined,
        limit: query.limit || undefined
    };
    // console.log('List Employees - Actor:', actorUser, 'Query:', query);
    if (actorUser.role === 'MANAGER') {
        filters.branch_id = actorUser.branch_id;
        if (query.role) {
            if (query.role !== 'SUPERADMIN' && query.role !== 'SUPERADMIN' && query.role !== 'MANAGER') {
                filters.role = query.role;
            } else {
                // Force return nothing since managers cannot see other managers or super admins
                filters.role = 'NONE';
            }
        } else {
            filters.role = ['OPERATOR', 'ENGINEER'];
        }
    }

    const result = await EmployeeModel.findAll(filters);
    const safeEmployees = result.employees.map(emp => safeEmployee(emp));
    // console.log('List Employees - Result:', result);
    return {
        employees: safeEmployees,
        total: result.total,
        page: result.page,
        limit: result.limit
    };
}

module.exports = {
    registerEmployee,
    editEmployee,
    deleteEmployee,
    getEmployee,
    listEmployees
};
