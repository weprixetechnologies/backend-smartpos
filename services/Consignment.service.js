const ConsignmentModel = require('../models/Consignment.model');
const StockItemModel = require('../models/StockItem.model');
const GoodsReceiptModel = require('../models/GoodsReceipt.model');
const ConsignmentDiscrepancyModel = require('../models/ConsignmentDiscrepancy.model');
const auditEmitter = require('../utils/auditEmitter');
const { buildEntry } = require('./AuditLogger.service');
const db = require('../utils/db');

const createConsignment = async (actorUser, payload) => {
    let branch_id = payload.branch_id;
    if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        branch_id = actorUser.branch_id;
    } else if (actorUser.role === 'SUPERADMIN' || actorUser.role === 'SUPER_ADMIN') {
        if (!branch_id) throw { status: 400, message: 'branch_id is required for SUPER_ADMIN' };
    } else {
        throw { status: 403, message: 'Permission denied' };
    }

    const consignment = await ConsignmentModel.create({ ...payload, branch_id, created_by: actorUser.id });

    auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
        module: 'STOCK',
        action_code: 'CONSIGNMENT_CREATED',
        entity_type: 'consignments',
        entity_id: consignment.id,
        new_state: consignment
    }));

    return consignment;
};

const receiveConsignmentItem = async (actorUser, consignmentId, payload) => {
    const consignment = await ConsignmentModel.findById(consignmentId);
    if (!consignment) throw { status: 404, message: 'Consignment not found' };

    if (consignment.status === 'RECEIVED') {
        throw { status: 409, message: 'Consignment already fully received' };
    }

    if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        if (consignment.branch_id !== actorUser.branch_id) throw { status: 403, message: 'Branch scope violation' };
    } else if (actorUser.role !== 'SUPERADMIN' && actorUser.role !== 'SUPER_ADMIN') {
        throw { status: 403, message: 'Permission denied' };
    }

    const [[{ count }]] = await db.query('SELECT COUNT(*) as count FROM stock_items WHERE serial_number = ?', [payload.serial_number]);
    if (count > 0) throw { status: 409, message: 'Serial number already exists in stock' };

    const stockItem = await StockItemModel.create({
        ...payload,
        branch_id: consignment.branch_id,
        consignment_id: consignmentId
    });

    await GoodsReceiptModel.create({
        consignment_id: consignmentId,
        stock_item_id: stockItem.id,
        received_by: actorUser.id,
        item_condition: payload.item_condition,
        notes: payload.notes
    });

    await ConsignmentModel.incrementReceivedCount(consignmentId);
    const updatedConsignment = await ConsignmentModel.findById(consignmentId);

    if (updatedConsignment.expected_count && updatedConsignment.received_count >= updatedConsignment.expected_count) {
        await ConsignmentModel.markReceived(consignmentId, actorUser.id);
    } else {
        await ConsignmentModel.updateStatus(consignmentId, 'PARTIALLY_RECEIVED');
    }

    const finalConsignment = await ConsignmentModel.findById(consignmentId);

    auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
        module: 'STOCK',
        action_code: 'CONSIGNMENT_ITEM_RECEIVED',
        entity_type: 'stock_items',
        entity_id: stockItem.id,
        new_state: { serial_number: payload.serial_number, item_condition: payload.item_condition, consignment_id: consignmentId }
    }));

    return { stock_item: stockItem, consignment: finalConsignment };
};

const raiseDiscrepancy = async (actorUser, consignmentId, payload) => {
    const consignment = await ConsignmentModel.findById(consignmentId);
    if (!consignment) throw { status: 404, message: 'Consignment not found' };

    if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        if (consignment.branch_id !== actorUser.branch_id) throw { status: 403, message: 'Branch scope violation' };
    }

    await ConsignmentDiscrepancyModel.create({
        consignment_id: consignmentId,
        description: payload.description,
        raised_by: actorUser.id
    });

    await ConsignmentModel.updateStatus(consignmentId, 'DISCREPANCY');

    auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
        module: 'STOCK',
        action_code: 'CONSIGNMENT_DISCREPANCY_RAISED',
        entity_type: 'consignments',
        entity_id: consignmentId,
        notes: payload.description
    }));

    return { success: true };
};

const resolveDiscrepancy = async (actorUser, discrepancyId) => {
    if (actorUser.role !== 'MANAGER' && actorUser.role !== 'SUPERADMIN' && actorUser.role !== 'SUPER_ADMIN') {
        throw { status: 403, message: 'Permission denied' };
    }

    const [[discrepancy]] = await db.query('SELECT * FROM consignment_discrepancies WHERE id = ?', [discrepancyId]);
    if (!discrepancy) throw { status: 404, message: 'Discrepancy not found' };

    const consignment = await ConsignmentModel.findById(discrepancy.consignment_id);
    if (actorUser.role === 'MANAGER' && consignment.branch_id !== actorUser.branch_id) {
        throw { status: 403, message: 'Branch scope violation' };
    }

    await ConsignmentDiscrepancyModel.resolve(discrepancyId);

    auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
        module: 'STOCK',
        action_code: 'CONSIGNMENT_DISCREPANCY_RESOLVED',
        entity_type: 'consignments',
        entity_id: consignment.id
    }));

    return { success: true };
};

const getConsignment = async (actorUser, consignmentId) => {
    const consignment = await ConsignmentModel.findById(consignmentId);
    if (!consignment) throw { status: 404, message: 'Consignment not found' };

    if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        if (consignment.branch_id !== actorUser.branch_id) throw { status: 403, message: 'Branch scope violation' };
    } else if (actorUser.role === 'ENGINEER') {
        throw { status: 403, message: 'Permission denied' };
    }

    const receipts = await GoodsReceiptModel.findByConsignment(consignmentId);
    const discrepancies = await ConsignmentDiscrepancyModel.findByConsignment(consignmentId);

    return { ...consignment, receipts, discrepancies };
};

const listConsignments = async (actorUser, query) => {
    if (actorUser.role === 'ENGINEER') throw { status: 403, message: 'Permission denied' };

    const filters = { ...query };
    if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        filters.branch_id = actorUser.branch_id;
    }

    return await ConsignmentModel.findAll(filters);
};

const updateActualCount = async (actorUser, consignmentId, count) => {
    const consignment = await ConsignmentModel.findById(consignmentId);
    if (!consignment) throw { status: 404, message: 'Consignment not found' };

    if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        if (consignment.branch_id !== actorUser.branch_id) throw { status: 403, message: 'Branch scope violation' };
    }

    await ConsignmentModel.updateReceivedCount(consignmentId, count);

    auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
        module: 'STOCK',
        action_code: 'CONSIGNMENT_ACTUAL_COUNT_UPDATED',
        entity_type: 'consignments',
        entity_id: consignmentId,
        new_state: { received_count: count }
    }));

    return await getConsignment(actorUser, consignmentId);
};

const markArrived = async (actorUser, consignmentId) => {
    const consignment = await ConsignmentModel.findById(consignmentId);
    if (!consignment) throw { status: 404, message: 'Consignment not found' };

    if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        if (consignment.branch_id !== actorUser.branch_id) throw { status: 403, message: 'Branch scope violation' };
    }

    await ConsignmentModel.markReceived(consignmentId, actorUser.id);

    auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
        module: 'STOCK',
        action_code: 'CONSIGNMENT_MARKED_ARRIVED',
        entity_type: 'consignments',
        entity_id: consignmentId,
        new_state: { status: 'RECEIVED', received_at: new Date() }
    }));

    return await getConsignment(actorUser, consignmentId);
};

module.exports = {
    createConsignment, receiveConsignmentItem, raiseDiscrepancy, resolveDiscrepancy, getConsignment, listConsignments, updateActualCount, markArrived
};
