const auditEmitter = require('../utils/auditEmitter');
const ActionLogModel = require('../models/ActionLog.model');

const ALLOWED_MODULES = new Set([
    'AUTH',
    'TICKET',
    'ARRIVAL_OTP',
    'MACHINE',
    'STOCK',
    'TRANSIT',
    'EMPLOYEE',
    'BRANCH',
    'ATTENDANCE'
]);

const ALLOWED_ROLES = new Set([
    'ENGINEER',
    'OPERATOR',
    'MANAGER',
    'SUPERADMIN'
]);

const ALLOWED_TRIGGER_TYPES = new Set(['USER', 'SYSTEM']);

function getRequestIp(req) {
    if (!req || typeof req !== 'object') {
        return null;
    }

    const forwarded = req.headers?.['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }

    return req.ip || null;
}

function getRequestDevice(req) {
    if (!req || typeof req !== 'object') {
        return null;
    }

    return req.get ? req.get('User-Agent') || null : req.headers?.['user-agent'] || null;
}

function normalizeTriggerType(triggerType) {
    if (!triggerType) {
        return 'USER';
    }

    const normalized = String(triggerType).toUpperCase();
    return ALLOWED_TRIGGER_TYPES.has(normalized) ? normalized : null;
}

function normalizeModule(moduleValue) {
    if (!moduleValue) {
        return null;
    }

    const normalized = String(moduleValue).toUpperCase();
    return ALLOWED_MODULES.has(normalized) ? normalized : null;
}

function normalizeActorRole(role) {
    if (role === undefined || role === null) {
        return null;
    }

    const normalized = String(role).toUpperCase();
    return ALLOWED_ROLES.has(normalized) ? normalized : null;
}

function buildEntry(req, overrides = {}) {
    const user = req?.user || {};

    const entry = {
        trigger_type: 'USER',
        actor_id: user.id || null,
        actor_name: user.name || null,
        actor_role: user.role || null,
        actor_ip: getRequestIp(req),
        actor_device: getRequestDevice(req),
        branch_id: user.branch_id || null,
        ...overrides
    };

    if (overrides.actor_ip !== undefined) {
        entry.actor_ip = overrides.actor_ip;
    }
    if (overrides.actor_device !== undefined) {
        entry.actor_device = overrides.actor_device;
    }

    return entry;
}

function normalizeEntry(rawEntry) {
    if (!rawEntry || typeof rawEntry !== 'object') {
        console.error('AuditLogger: invalid audit entry payload');
        return null;
    }

    const moduleValue = normalizeModule(rawEntry.module);
    if (!moduleValue) {
        console.error('AuditLogger: invalid or missing module for audit entry', rawEntry.module);
        return null;
    }

    const actionCode = rawEntry.action_code ? String(rawEntry.action_code).trim() : '';
    if (!actionCode) {
        console.error('AuditLogger: missing action_code for audit entry');
        return null;
    }

    const triggerType = normalizeTriggerType(rawEntry.trigger_type);
    if (!triggerType) {
        console.error('AuditLogger: invalid trigger_type for audit entry', rawEntry.trigger_type);
        return null;
    }

    const actorRole = rawEntry.actor_role !== undefined ? normalizeActorRole(rawEntry.actor_role) : rawEntry.actor_role;
    if (rawEntry.actor_role !== undefined && rawEntry.actor_role !== null && actorRole === null) {
        console.error('AuditLogger: invalid actor_role for audit entry', rawEntry.actor_role);
        return null;
    }

    return {
        actor_id: rawEntry.actor_id || null,
        actor_name: rawEntry.actor_name || null,
        actor_role: actorRole,
        actor_ip: rawEntry.actor_ip || null,
        actor_device: rawEntry.actor_device || null,
        branch_id: rawEntry.branch_id || null,
        module: moduleValue,
        action_code: actionCode,
        trigger_type: triggerType,
        entity_type: rawEntry.entity_type || null,
        entity_id: rawEntry.entity_id || null,
        previous_state: rawEntry.previous_state === undefined ? null : rawEntry.previous_state,
        new_state: rawEntry.new_state === undefined ? null : rawEntry.new_state,
        notes: rawEntry.notes || null
    };
}

async function handleAuditEvent(rawEntry) {
    const entry = normalizeEntry(rawEntry);
    if (!entry) {
        return;
    }

    try {
        await ActionLogModel.insert(entry);
    } catch (err) {
        console.error('AuditLogger: failed to persist audit entry', err.message || err);
    }
}

function init() {
    if (init._initialized) {
        return;
    }

    init._initialized = true;
    auditEmitter.on('audit', (entry) => {
        void handleAuditEvent(entry);
    });
}

module.exports = {
    init,
    buildEntry
};
