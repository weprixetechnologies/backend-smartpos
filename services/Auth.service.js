const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const EmployeeModel = require('../models/Employee.model');
const RefreshTokenModel = require('../models/RefreshToken.model');
const LoginAuditModel = require('../models/LoginAudit.model');
const auditEmitter = require('../utils/auditEmitter');

const createError = (status, message) => {
    const err = new Error(message);
    err.status = status;
    return err;
};

async function login(identifier, password, deviceInfo, ipAddress) {
    const employee = await EmployeeModel.findByMobileOrEmail(identifier);
    if (!employee) {
        await LoginAuditModel.create({
            employee_id: null,
            email_or_mobile: identifier,
            success: false,
            ip_address: ipAddress,
            device_info: deviceInfo,
            branch_id: null
        });

        auditEmitter.emit('audit', {
            module: 'AUTH',
            action_code: 'LOGIN_FAILED',
            actor_id: null,
            actor_name: 'Anonymous',
            actor_role: null,
            actor_ip: ipAddress,
            actor_device: deviceInfo,
            branch_id: null,
            trigger_type: 'USER',
            entity_type: 'employees',
            entity_id: null,
            notes: `Login failed: user not found with identifier: ${identifier}`
        });

        throw createError(401, 'Invalid credentials');
    }

    if (employee.status === 'INACTIVE') {
        await LoginAuditModel.create({
            employee_id: employee.id,
            email_or_mobile: identifier,
            success: false,
            ip_address: ipAddress,
            device_info: deviceInfo,
            branch_id: employee.branch_id
        });

        auditEmitter.emit('audit', {
            module: 'AUTH',
            action_code: 'LOGIN_FAILED',
            actor_id: employee.id,
            actor_name: employee.full_name,
            actor_role: employee.role,
            actor_ip: ipAddress,
            actor_device: deviceInfo,
            branch_id: employee.branch_id,
            trigger_type: 'USER',
            entity_type: 'employees',
            entity_id: employee.id,
            notes: `Login failed: account is inactive`
        });

        throw createError(403, 'Account is inactive');
    }

    const isMatch = await bcrypt.compare(password, employee.password_hash);
    if (!isMatch) {
        await LoginAuditModel.create({
            employee_id: employee.id,
            email_or_mobile: identifier,
            success: false,
            ip_address: ipAddress,
            device_info: deviceInfo,
            branch_id: employee.branch_id
        });

        auditEmitter.emit('audit', {
            module: 'AUTH',
            action_code: 'LOGIN_FAILED',
            actor_id: employee.id,
            actor_name: employee.full_name,
            actor_role: employee.role,
            actor_ip: ipAddress,
            actor_device: deviceInfo,
            branch_id: employee.branch_id,
            trigger_type: 'USER',
            entity_type: 'employees',
            entity_id: employee.id,
            notes: `Login failed: invalid password`
        });

        throw createError(401, 'Invalid credentials');
    }

    // Generate tokens — embed all profile fields so validate-me needs no DB query
    const loginTime = new Date().toISOString();

    // Pre-fetch branch name for JWT payload
    const db = require('../utils/db');
    const [[branchRowForToken]] = await db.query(
        'SELECT branch_name FROM branches WHERE id = ? LIMIT 1',
        [employee.branch_id]
    );
    const branchName = branchRowForToken?.branch_name || null;

    const accessToken = jwt.sign(
        {
            id: employee.id,
            name: employee.full_name,
            email: employee.email || null,
            employee_code: employee.employee_code,
            role: employee.role,
            branch_id: employee.branch_id,
            branch_name: branchName,
            login_time: loginTime
        },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: process.env.JWT_ACCESS_EXPIRY || '180m' }
    );

    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    const refreshExpiryDays = parseInt(process.env.JWT_REFRESH_EXPIRY_DAYS || '30', 10);
    const expiresAt = new Date(Date.now() + refreshExpiryDays * 24 * 60 * 60 * 1000);

    await RefreshTokenModel.create({
        employee_id: employee.id,
        token_hash: tokenHash,
        device_info: deviceInfo,
        ip_address: ipAddress,
        expires_at: expiresAt
    });

    await EmployeeModel.updateLastLogin(employee.id);

    await LoginAuditModel.create({
        employee_id: employee.id,
        email_or_mobile: identifier,
        success: true,
        ip_address: ipAddress,
        device_info: deviceInfo,
        branch_id: employee.branch_id
    });

    // Emit LOGIN_SUCCESS audit
    auditEmitter.emit('audit', {
        module: 'AUTH',
        action_code: 'LOGIN_SUCCESS',
        actor_id: employee.id,
        actor_name: employee.full_name,
        actor_role: employee.role,
        actor_ip: ipAddress,
        actor_device: deviceInfo,
        branch_id: employee.branch_id,
        trigger_type: 'USER',
        entity_type: 'employees',
        entity_id: employee.id
    });

    // Return tokens + user data — controller will set tokens as HttpOnly cookies
    return {
        accessToken,
        refreshToken: rawRefreshToken,
        user: {
            id: employee.id,
            full_name: employee.full_name,
            email: employee.email || null,
            employee_code: employee.employee_code,
            role: employee.role,
            branch_id: employee.branch_id,
            branch_name: branchName,
            login_time: loginTime,
            isAuthenticated: true
        }
    };
}

async function refreshToken(rawRefreshToken, employeeId, deviceInfo, ipAddress) {
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const tokenRow = await RefreshTokenModel.findValidToken(employeeId, tokenHash);

    if (!tokenRow) {
        throw createError(401, 'Invalid or expired refresh token');
    }

    const employee = await EmployeeModel.findById(employeeId);
    if (!employee || employee.status === 'INACTIVE') {
        // Revoke all tokens for that employee
        await RefreshTokenModel.revokeAllForEmployee(employeeId);
        throw createError(403, 'Account is inactive');
    }

    // Revoke old token
    await RefreshTokenModel.revokeToken(tokenRow.id);

    const loginTime = new Date().toISOString();

    const db = require('../utils/db');
    const [[branchRowForToken]] = await db.query(
        'SELECT branch_name FROM branches WHERE id = ? LIMIT 1',
        [employee.branch_id]
    );
    const branchName = branchRowForToken?.branch_name || null;

    // Generate new tokens
    const accessToken = jwt.sign(
        {
            id: employee.id,
            name: employee.full_name,
            email: employee.email || null,
            employee_code: employee.employee_code,
            role: employee.role,
            branch_id: employee.branch_id,
            branch_name: branchName,
            login_time: loginTime
        },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
    );

    const newRawRefreshToken = crypto.randomBytes(64).toString('hex');
    const newTokenHash = crypto.createHash('sha256').update(newRawRefreshToken).digest('hex');

    const refreshExpiryDays = parseInt(process.env.JWT_REFRESH_EXPIRY_DAYS || '30', 10);
    const expiresAt = new Date(Date.now() + refreshExpiryDays * 24 * 60 * 60 * 1000);

    await RefreshTokenModel.create({
        employee_id: employee.id,
        token_hash: newTokenHash,
        device_info: deviceInfo,
        ip_address: ipAddress,
        expires_at: expiresAt
    });

    // Emit TOKEN_REFRESHED audit
    auditEmitter.emit('audit', {
        module: 'AUTH',
        action_code: 'TOKEN_REFRESHED',
        actor_id: employee.id,
        actor_name: employee.full_name,
        actor_role: employee.role,
        actor_ip: ipAddress,
        actor_device: deviceInfo,
        branch_id: employee.branch_id,
        trigger_type: 'USER',
        entity_type: 'employees',
        entity_id: employee.id
    });

    return {
        accessToken,
        refreshToken: newRawRefreshToken,
        user: {
            id: employee.id,
            full_name: employee.full_name,
            email: employee.email || null,
            employee_code: employee.employee_code,
            role: employee.role,
            branch_id: employee.branch_id,
            branch_name: branchName,
            login_time: loginTime,
            isAuthenticated: true
        }
    };
}

async function logout(rawRefreshToken, employeeId) {
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const tokenRow = await RefreshTokenModel.findValidToken(employeeId, tokenHash);

    if (tokenRow) {
        await RefreshTokenModel.revokeToken(tokenRow.id);
    }

    const employee = await EmployeeModel.findById(employeeId);
    if (employee) {
        // Emit LOGOUT audit
        auditEmitter.emit('audit', {
            module: 'AUTH',
            action_code: 'LOGOUT',
            actor_id: employee.id,
            actor_name: employee.full_name,
            actor_role: employee.role,
            branch_id: employee.branch_id,
            trigger_type: 'USER',
            entity_type: 'employees',
            entity_id: employee.id
        });
    }

    return { success: true };
}

async function logoutAll(employeeId) {
    await RefreshTokenModel.revokeAllForEmployee(employeeId);

    const employee = await EmployeeModel.findById(employeeId);
    if (employee) {
        // Emit LOGOUT_ALL audit
        auditEmitter.emit('audit', {
            module: 'AUTH',
            action_code: 'LOGOUT_ALL',
            actor_id: employee.id,
            actor_name: employee.full_name,
            actor_role: employee.role,
            branch_id: employee.branch_id,
            trigger_type: 'USER',
            entity_type: 'employees',
            entity_id: employee.id
        });
    }

    return { success: true };
}

module.exports = {
    login,
    refreshToken,
    logout,
    logoutAll
};
