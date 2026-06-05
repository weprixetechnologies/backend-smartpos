const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, '../services');

const machineService = `const MachineModel = require('../models/Machine.model');
const TidMappingModel = require('../models/TidMapping.model');
const MachineCustodyModel = require('../models/MachineCustody.model');
const auditEmitter = require('../utils/auditEmitter');
const { buildEntry } = require('./AuditLogger.service');
const db = require('../config/db');

const addMachine = async (actorUser, payload) => {
    let branch_id = payload.branch_id;
    if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        branch_id = actorUser.branch_id;
    } else if (actorUser.role === 'SUPERADMIN' || actorUser.role === 'SUPER_ADMIN') {
        if (!branch_id) throw { status: 400, message: 'branch_id is required for SUPER_ADMIN' };
    } else {
        throw { status: 403, message: 'Permission denied' };
    }

    const [[{ count: serialCount }]] = await db.query('SELECT COUNT(*) AS count FROM machines WHERE serial_number = ?', [payload.serial_number]);
    if (serialCount > 0) throw { status: 409, message: 'Serial number already registered' };

    if (payload.tid) {
        const [[{ count: tidCount }]] = await db.query('SELECT COUNT(*) AS count FROM machines WHERE tid = ?', [payload.tid]);
        if (tidCount > 0) throw { status: 409, message: 'TID already registered to another machine' };
    }

    const machine = await MachineModel.create({ ...payload, branch_id });

    if (payload.tid) {
        await TidMappingModel.mapTid({
            machine_id: machine.id,
            tid: payload.tid,
            mapped_by: actorUser.id,
            ticket_id: null
        });
    }

    auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
        module: 'MACHINE',
        action_code: 'MACHINE_ADDED',
        entity_type: 'machines',
        entity_id: machine.id,
        new_state: machine
    }));

    return machine;
};

const editMachine = async (actorUser, machineId, payload) => {
    const machine = await MachineModel.findById(machineId);
    if (!machine) throw { status: 404, message: 'Machine not found' };

    if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        if (machine.branch_id !== actorUser.branch_id) throw { status: 403, message: 'Branch scope violation' };
    }

    if (payload.serial_number && payload.serial_number !== machine.serial_number) {
        const [[{ count: serialCount }]] = await db.query('SELECT COUNT(*) AS count FROM machines WHERE serial_number = ? AND id != ?', [payload.serial_number, machineId]);
        if (serialCount > 0) throw { status: 409, message: 'Serial number already registered' };
    }

    const previous_state = { ...machine };
    await MachineModel.update(machineId, payload);
    const updated = await MachineModel.findById(machineId);

    auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
        module: 'MACHINE',
        action_code: 'MACHINE_UPDATED',
        entity_type: 'machines',
        entity_id: machineId,
        previous_state,
        new_state: updated
    }));

    return updated;
};

const decommissionMachine = async (actorUser, machineId, { reason }) => {
    const machine = await MachineModel.findById(machineId);
    if (!machine) throw { status: 404, message: 'Machine not found' };

    if (actorUser.role === 'MANAGER') {
        if (machine.branch_id !== actorUser.branch_id) throw { status: 403, message: 'Branch scope violation' };
    } else if (actorUser.role !== 'SUPERADMIN' && actorUser.role !== 'SUPER_ADMIN') {
        throw { status: 403, message: 'Permission denied' };
    }

    if (machine.status === 'DECOMMISSIONED') throw { status: 409, message: 'Machine already decommissioned' };
    if (machine.status === 'DEPLOYED') throw { status: 409, message: 'Cannot decommission a deployed machine. Collect it first.' };

    await MachineModel.decommission(machineId);

    const activeMapping = await TidMappingModel.getCurrentMapping(machineId);
    if (activeMapping) {
        await TidMappingModel.unmapTid(machineId, { unmapped_by: actorUser.id });
    }

    auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
        module: 'MACHINE',
        action_code: 'MACHINE_DECOMMISSIONED',
        entity_type: 'machines',
        entity_id: machineId,
        previous_state: machine,
        notes: reason
    }));

    return { success: true };
};

const getMachine = async (actorUser, machineId) => {
    const machine = await MachineModel.findById(machineId);
    if (!machine) throw { status: 404, message: 'Machine not found' };

    if (actorUser.role === 'ENGINEER') {
        const [[{ count }]] = await db.query(\`SELECT COUNT(*) as count FROM tickets 
                                              WHERE machine_id = ? AND assigned_engineer_id = ? 
                                              AND status NOT IN ('CLOSED','CANCELLED')\`, [machineId, actorUser.id]);
        if (count === 0) throw { status: 403, message: 'Permission denied: Not assigned to any active tickets for this machine' };
    } else if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        if (machine.branch_id !== actorUser.branch_id) throw { status: 403, message: 'Branch scope violation' };
    }

    const tidMapping = await TidMappingModel.getCurrentMapping(machineId);
    const custodyEvents = await MachineCustodyModel.findByMachine(machineId);

    return { ...machine, tidMapping, lastCustodyEvent: custodyEvents[0] || null };
};

const listMachines = async (actorUser, query) => {
    if (actorUser.role === 'ENGINEER') throw { status: 403, message: 'Permission denied' };

    const filters = { ...query };
    if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        filters.branch_id = actorUser.branch_id;
    }

    return await MachineModel.findAll(filters);
};

const mapTid = async (actorUser, machineId, payload) => {
    const machine = await MachineModel.findById(machineId);
    if (!machine) throw { status: 404, message: 'Machine not found' };

    if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        if (machine.branch_id !== actorUser.branch_id) throw { status: 403, message: 'Branch scope violation' };
    }

    if (machine.status === 'DECOMMISSIONED') throw { status: 409, message: 'Machine is decommissioned' };

    const [[{ count }]] = await db.query('SELECT COUNT(*) as count FROM machines WHERE tid = ? AND id != ?', [payload.tid, machineId]);
    if (count > 0) throw { status: 409, message: 'TID already assigned to another machine' };

    const activeMapping = await TidMappingModel.getCurrentMapping(machineId);
    if (activeMapping) {
        await TidMappingModel.unmapTid(machineId, { unmapped_by: actorUser.id, ticket_id: payload.ticket_id });
    }

    await MachineModel.update(machineId, { tid: payload.tid });
    await TidMappingModel.mapTid({
        machine_id: machineId,
        tid: payload.tid,
        merchant_name: payload.merchant_name,
        merchant_address: payload.merchant_address,
        mapped_by: actorUser.id,
        ticket_id: payload.ticket_id
    });

    auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
        module: 'MACHINE',
        action_code: 'TID_MAPPED',
        entity_type: 'machines',
        entity_id: machineId,
        new_state: { machine_id: machineId, tid: payload.tid, merchant_name: payload.merchant_name }
    }));

    return { success: true };
};

const unmapTid = async (actorUser, machineId, payload) => {
    const machine = await MachineModel.findById(machineId);
    if (!machine) throw { status: 404, message: 'Machine not found' };

    if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        if (machine.branch_id !== actorUser.branch_id) throw { status: 403, message: 'Branch scope violation' };
    }

    const activeMapping = await TidMappingModel.getCurrentMapping(machineId);
    if (!activeMapping) throw { status: 404, message: 'No active TID mapping found' };

    await TidMappingModel.unmapTid(machineId, { unmapped_by: actorUser.id, ticket_id: payload.ticket_id });
    await MachineModel.update(machineId, { tid: null });

    auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
        module: 'MACHINE',
        action_code: 'TID_UNMAPPED',
        entity_type: 'machines',
        entity_id: machineId,
        notes: payload.reason
    }));

    return { success: true };
};

const transferBranch = async (actorUser, machineId, payload) => {
    if (actorUser.role !== 'SUPERADMIN' && actorUser.role !== 'SUPER_ADMIN') throw { status: 403, message: 'Permission denied' };

    const machine = await MachineModel.findById(machineId);
    if (!machine) throw { status: 404, message: 'Machine not found' };

    if (machine.status === 'DEPLOYED' || machine.status === 'DECOMMISSIONED') {
        throw { status: 409, message: 'Machine cannot be transferred in its current status' };
    }

    const [[{ count }]] = await db.query('SELECT COUNT(*) as count FROM branches WHERE id = ?', [payload.target_branch_id]);
    if (count === 0) throw { status: 400, message: 'Target branch does not exist' };

    await MachineModel.update(machineId, { branch_id: payload.target_branch_id });
    await MachineCustodyModel.create({
        machine_id: machineId,
        transferred_by: actorUser.id,
        from_entity: 'BRANCH:' + machine.branch_id,
        to_entity: 'BRANCH:' + payload.target_branch_id,
        notes: payload.notes
    });

    auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
        module: 'MACHINE',
        action_code: 'MACHINE_BRANCH_TRANSFERRED',
        entity_type: 'machines',
        entity_id: machineId,
        previous_state: { branch_id: machine.branch_id },
        new_state: { branch_id: payload.target_branch_id }
    }));

    return { success: true };
};

module.exports = {
    addMachine, editMachine, decommissionMachine, getMachine, listMachines,
    mapTid, unmapTid, transferBranch
};
`;

const machineDispatchService = `const MachineModel = require('../models/Machine.model');
const MachineCustodyModel = require('../models/MachineCustody.model');
const auditEmitter = require('../utils/auditEmitter');
const { buildEntry } = require('./AuditLogger.service');
const db = require('../config/db');

const dispatchMachine = async (actorUser, machineId, payload) => {
    const machine = await MachineModel.findById(machineId);
    if (!machine) throw { status: 404, message: 'Machine not found' };

    if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        if (machine.branch_id !== actorUser.branch_id) throw { status: 403, message: 'Branch scope violation' };
    }

    if (!['AVAILABLE', 'IN_OFFICE', 'READY_DEPLOY'].includes(machine.status)) {
        throw { status: 409, message: \`Machine is not available for dispatch (current status: \${machine.status})\` };
    }

    if (payload.to_engineer_id) {
        const [[engineer]] = await db.query('SELECT * FROM employees WHERE id = ? LIMIT 1', [payload.to_engineer_id]);
        if (!engineer) throw { status: 404, message: 'Engineer not found' };
        if (engineer.role !== 'ENGINEER' || engineer.status !== 'ACTIVE') throw { status: 400, message: 'Invalid engineer status or role' };
        
        if (['OPERATOR', 'MANAGER'].includes(actorUser.role) && engineer.branch_id !== actorUser.branch_id) {
            throw { status: 403, message: 'Engineer is in a different branch' };
        }
    }

    await MachineModel.updateStatus(machineId, 'IN_TRANSIT');
    await MachineCustodyModel.create({
        machine_id: machineId,
        transferred_by: actorUser.id,
        received_by: payload.to_engineer_id || null,
        from_entity: 'OFFICE',
        to_entity: payload.to_entity,
        photo_url: payload.photo_url,
        ticket_id: payload.ticket_id,
        notes: payload.notes
    });

    auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
        module: 'MACHINE',
        action_code: 'MACHINE_DISPATCHED',
        entity_type: 'machines',
        entity_id: machineId,
        new_state: { to_entity: payload.to_entity, to_engineer_id: payload.to_engineer_id, ticket_id: payload.ticket_id }
    }));

    return { machine: await MachineModel.findById(machineId) };
};

const confirmMachineReceipt = async (actorUser, machineId, payload) => {
    const machine = await MachineModel.findById(machineId);
    if (!machine) throw { status: 404, message: 'Machine not found' };

    if (machine.status !== 'IN_TRANSIT') {
        throw { status: 409, message: 'Machine is not in transit' };
    }

    if (actorUser.role === 'ENGINEER') {
        const [latestCustody] = await db.query('SELECT * FROM machine_custody_events WHERE machine_id = ? ORDER BY occurred_at DESC LIMIT 1', [machineId]);
        if (!latestCustody || latestCustody.received_by !== actorUser.id) {
            throw { status: 403, message: 'Machine was not dispatched to you' };
        }
    } else if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        if (machine.branch_id !== actorUser.branch_id) throw { status: 403, message: 'Branch scope violation' };
    }

    const newStatus = actorUser.role === 'ENGINEER' ? 'DEPLOYED' : 'IN_OFFICE';
    await MachineModel.updateStatus(machineId, newStatus);
    
    await MachineCustodyModel.create({
        machine_id: machineId,
        received_by: actorUser.id,
        from_entity: 'IN_TRANSIT',
        to_entity: actorUser.role === 'ENGINEER' ? 'ENGINEER:' + actorUser.name : 'OFFICE',
        photo_url: payload.photo_url,
        notes: payload.notes
    });

    auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
        module: 'MACHINE',
        action_code: 'MACHINE_RECEIPT_CONFIRMED',
        entity_type: 'machines',
        entity_id: machineId,
        new_state: { status: newStatus }
    }));

    return { success: true };
};

module.exports = { dispatchMachine, confirmMachineReceipt };
`;

fs.writeFileSync(path.join(servicesDir, 'Machine.service.js'), machineService);
fs.writeFileSync(path.join(servicesDir, 'MachineDispatch.service.js'), machineDispatchService);
console.log('Machine and Dispatch services written');
