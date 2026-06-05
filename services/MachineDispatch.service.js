const MachineModel = require('../models/Machine.model');
const MachineCustodyModel = require('../models/MachineCustody.model');
const auditEmitter = require('../utils/auditEmitter');
const { buildEntry } = require('./AuditLogger.service');
const db = require('../utils/db');

const dispatchMachine = async (actorUser, machineId, payload) => {
    const machine = await MachineModel.findById(machineId);
    if (!machine) throw { status: 404, message: 'Machine not found' };

    if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        if (machine.branch_id !== actorUser.branch_id) throw { status: 403, message: 'Branch scope violation' };
    }

    if (!['AVAILABLE', 'IN_OFFICE', 'READY_DEPLOY'].includes(machine.status)) {
        throw { status: 409, message: `Machine is not available for dispatch (current status: ${machine.status})` };
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
