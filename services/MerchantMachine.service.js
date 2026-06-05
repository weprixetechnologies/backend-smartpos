const Merchant = require('../models/Merchant.model');
const MerchantMachineAssignment = require('../models/MerchantMachineAssignment.model');
const Machine = require('../models/Machine.model');
const TidMapping = require('../models/TidMapping.model');
const auditEmitter = require('../utils/auditEmitter');
const { buildEntry } = require('./AuditLogger.service');
const safeMerchant = require('../utils/safeMerchant');

const MerchantMachineService = {
    async assignMachine(actorUser, merchantId, payload) {
        const { machine_id, notes } = payload;

        const merchant = await Merchant.findById(merchantId);
        if (!merchant) {
            throw Object.assign(new Error('Merchant not found'), { statusCode: 404 });
        }
        if (merchant.status !== 'ACTIVE') {
            throw Object.assign(new Error('Merchant is not active'), { statusCode: 409 });
        }

        if (actorUser.role === 'OPERATOR' || actorUser.role === 'MANAGER') {
            if (merchant.branch_id !== actorUser.branch_id) {
                throw Object.assign(new Error('Access denied: Merchant belongs to a different branch'), { statusCode: 403 });
            }
        }

        const machine = await Machine.findById(machine_id);
        if (!machine) {
            throw Object.assign(new Error('Machine not found'), { statusCode: 404 });
        }
        if (machine.status !== 'AVAILABLE') {
            throw Object.assign(new Error(`Machine is not available for assignment (current status: ${machine.status})`), { statusCode: 409 });
        }
        if (machine.branch_id !== merchant.branch_id) {
            throw Object.assign(new Error('Machine belongs to a different branch than the merchant'), { statusCode: 409 });
        }

        const activeCount = await MerchantMachineAssignment.checkActiveMachineAssignment(machine_id);
        if (activeCount > 0) {
            throw Object.assign(new Error('Machine is already assigned to a merchant'), { statusCode: 409 });
        }

        const assignment = await MerchantMachineAssignment.create({
            merchant_id: merchantId,
            machine_id,
            assigned_by: actorUser.id,
            notes
        });

        await Machine.updateStatus(machine_id, 'DEPLOYED');

        if (machine.tid) {
            await TidMapping.mapTid({
                machine_id,
                tid: machine.tid,
                merchant_name: merchant.full_name,
                merchant_address: merchant.address,
                mapped_by: actorUser.id,
                ticket_id: null
            });
        }

        auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
            module: 'MERCHANT',
            action_code: 'MACHINE_ASSIGNED_TO_MERCHANT',
            entity_type: 'merchant_machine_assignments',
            entity_id: assignment.id,
            new_state: { merchant_id: merchantId, machine_id, tid: machine.tid }
        }));

        return {
            assignment,
            machine,
            merchant: safeMerchant(merchant)
        };
    },

    async unassignMachine(actorUser, merchantId, payload) {
        const { machine_id, reason } = payload;

        const merchant = await Merchant.findById(merchantId);
        if (!merchant) {
            throw Object.assign(new Error('Merchant not found'), { statusCode: 404 });
        }
        if (actorUser.role === 'OPERATOR' || actorUser.role === 'MANAGER') {
            if (merchant.branch_id !== actorUser.branch_id) {
                throw Object.assign(new Error('Access denied'), { statusCode: 403 });
            }
        }

        const assignment = await MerchantMachineAssignment.findActiveByMachine(machine_id);
        if (!assignment) {
            throw Object.assign(new Error('No active assignment found for this machine'), { statusCode: 404 });
        }
        if (assignment.merchant_id !== merchantId) {
            throw Object.assign(new Error('Machine is not assigned to this merchant'), { statusCode: 409 });
        }

        const machine = await Machine.findById(machine_id);
        if (!machine) {
            throw Object.assign(new Error('Machine not found'), { statusCode: 404 });
        }

        await MerchantMachineAssignment.unassign(machine_id, { unassigned_by: actorUser.id });
        await Machine.updateStatus(machine_id, 'AVAILABLE');

        if (machine.tid) {
            // Check if there is an active mapping before unmapping (TidMapping logic handles this, but it's safe to call)
            const activeMapping = await TidMapping.findActiveMapping(machine_id);
            if (activeMapping) {
                await TidMapping.unmapTid(machine_id, { unmapped_by: actorUser.id, ticket_id: null });
            }
        }

        auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
            module: 'MERCHANT',
            action_code: 'MACHINE_UNASSIGNED_FROM_MERCHANT',
            entity_type: 'merchant_machine_assignments',
            new_state: { merchant_id: merchantId, machine_id },
            notes: reason
        }));

        return { message: 'Machine unassigned successfully' };
    },

    async getMerchantMachines(actorUser, merchantId) {
        const merchant = await Merchant.findById(merchantId);
        if (!merchant) {
            throw Object.assign(new Error('Merchant not found'), { statusCode: 404 });
        }

        if (actorUser.role === 'OPERATOR' || actorUser.role === 'MANAGER') {
            if (merchant.branch_id !== actorUser.branch_id) {
                throw Object.assign(new Error('Access denied'), { statusCode: 403 });
            }
        }

        const machines = await MerchantMachineAssignment.findActiveByMerchant(merchantId);
        return machines;
    },

    async getMerchantMachineHistory(actorUser, merchantId) {
        if (actorUser.role === 'ENGINEER') {
            throw Object.assign(new Error('Access denied'), { statusCode: 403 });
        }

        const merchant = await Merchant.findById(merchantId);
        if (!merchant) {
            throw Object.assign(new Error('Merchant not found'), { statusCode: 404 });
        }

        if (actorUser.role === 'OPERATOR' || actorUser.role === 'MANAGER') {
            if (merchant.branch_id !== actorUser.branch_id) {
                throw Object.assign(new Error('Access denied'), { statusCode: 403 });
            }
        }

        const history = await MerchantMachineAssignment.findHistoryByMerchant(merchantId);
        return history;
    }
};

module.exports = MerchantMachineService;
