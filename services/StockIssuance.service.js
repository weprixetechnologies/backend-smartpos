const StockIssuanceModel = require('../models/StockIssuance.model');
const StockItemModel = require('../models/StockItem.model');
const StockReturnModel = require('../models/StockReturn.model');
const auditEmitter = require('../utils/auditEmitter');
const { buildEntry } = require('./AuditLogger.service');
const db = require('../utils/db');

const issueStockItem = async (actorUser, payload) => {
    if (actorUser.role === 'ENGINEER') throw { status: 403, message: 'Permission denied' };

    const item = await StockItemModel.findById(payload.stock_item_id);
    if (!item) throw { status: 404, message: 'Stock item not found' };

    if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        if (item.branch_id !== actorUser.branch_id) throw { status: 403, message: 'Branch scope violation' };
    }

    if (!['AVAILABLE', 'IN_OFFICE_AWAITING_DISPATCH'].includes(item.state)) {
        throw { status: 409, message: `Item is not available for issuance (current state: ${item.state})` };
    }

    const [[engineer]] = await db.query('SELECT * FROM employees WHERE id = ? LIMIT 1', [payload.engineer_id]);
    if (!engineer || engineer.role !== 'ENGINEER' || engineer.status !== 'ACTIVE') {
        throw { status: 400, message: 'Invalid engineer' };
    }

    if (['OPERATOR', 'MANAGER'].includes(actorUser.role) && engineer.branch_id !== actorUser.branch_id) {
        throw { status: 403, message: 'Engineer is in a different branch' };
    }

    const [[{ count }]] = await db.query('SELECT COUNT(*) as count FROM stock_issuances WHERE stock_item_id = ? AND returned_at IS NULL', [payload.stock_item_id]);
    if (count > 0) throw { status: 409, message: 'Item is already issued and not yet returned' };

    await StockItemModel.updateState(payload.stock_item_id, 'RESERVED');
    await StockIssuanceModel.create({
        ...payload,
        branch_id: item.branch_id,
        issued_by: actorUser.id
    });

    const [[issuance]] = await db.query('SELECT * FROM stock_issuances WHERE stock_item_id = ? AND returned_at IS NULL LIMIT 1', [payload.stock_item_id]);

    auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
        module: 'STOCK',
        action_code: 'STOCK_ITEM_ISSUED',
        entity_type: 'stock_issuances',
        entity_id: issuance.id,
        new_state: { stock_item_id: payload.stock_item_id, engineer_id: payload.engineer_id, ticket_id: payload.ticket_id }
    }));

    return issuance;
};

const acknowledgeIssuance = async (actorUser, issuanceId, payload) => {
    if (actorUser.role !== 'ENGINEER') throw { status: 403, message: 'Permission denied' };

    const issuance = await StockIssuanceModel.findById(issuanceId);
    if (!issuance) throw { status: 404, message: 'Issuance not found' };

    if (issuance.engineer_id !== actorUser.id) {
        throw { status: 403, message: 'This issuance is not assigned to you' };
    }

    if (issuance.engineer_ack_at !== null) {
        throw { status: 409, message: 'Already acknowledged' };
    }

    await StockIssuanceModel.acknowledge(issuanceId, { engineer_ack_photo: payload.engineer_ack_photo });
    await StockItemModel.updateState(issuance.stock_item_id, 'DEPLOYED');

    auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
        module: 'STOCK',
        action_code: 'STOCK_ISSUANCE_ACKNOWLEDGED',
        entity_type: 'stock_issuances',
        entity_id: issuanceId
    }));

    return { success: true };
};

const returnStockItem = async (actorUser, payload) => {
    const item = await StockItemModel.findById(payload.stock_item_id);
    if (!item) throw { status: 404, message: 'Stock item not found' };

    const [[issuance]] = await db.query('SELECT * FROM stock_issuances WHERE stock_item_id = ? AND returned_at IS NULL LIMIT 1', [payload.stock_item_id]);
    if (!issuance) throw { status: 404, message: 'No active issuance found for this item' };

    if (actorUser.role === 'ENGINEER') {
        if (issuance.engineer_id !== actorUser.id) throw { status: 403, message: 'Permission denied: Not your issuance' };
    } else if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        if (issuance.branch_id !== actorUser.branch_id) throw { status: 403, message: 'Branch scope violation' };
    }

    await StockReturnModel.create({
        stock_item_id: payload.stock_item_id,
        engineer_id: issuance.engineer_id,
        ticket_id: payload.ticket_id,
        branch_id: issuance.branch_id,
        item_condition: payload.item_condition,
        received_by: actorUser.id,
        photo_url: payload.photo_url,
        notes: payload.notes
    });

    await StockIssuanceModel.markReturned(issuance.id, { return_condition: payload.item_condition, returned_at: new Date() });

    let newState = 'IN_OFFICE_AWAITING_DISPATCH';
    if (payload.item_condition === 'DAMAGED' || payload.item_condition === 'FAULTY') {
        newState = 'IN_OFFICE_UNDER_REPAIR';
    }

    await StockItemModel.updateState(payload.stock_item_id, newState);
    await StockItemModel.update(payload.stock_item_id, { item_condition: payload.item_condition });

    auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
        module: 'STOCK',
        action_code: 'STOCK_ITEM_RETURNED',
        entity_type: 'stock_items',
        entity_id: payload.stock_item_id,
        notes: `Condition: ${payload.item_condition}`
    }));

    const updatedItem = await StockItemModel.findById(payload.stock_item_id);
    const [[returnRecord]] = await db.query('SELECT * FROM stock_returns WHERE stock_item_id = ? ORDER BY returned_at DESC LIMIT 1', [payload.stock_item_id]);

    return { return_record: returnRecord, updated_item: updatedItem };
};

const getIssuanceHistory = async (actorUser, query) => {
    let engineerId = query.engineer_id;
    if (actorUser.role === 'ENGINEER') {
        engineerId = actorUser.id;
    }

    if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        return await StockIssuanceModel.findByBranch(actorUser.branch_id, { ...query, engineer_id: engineerId });
    }

    // fallback for SA/others without branch constraint if needed, 
    // but findByBranch requires branch_id. For SA, we can allow querying by branch if passed.
    if (query.branch_id) {
        return await StockIssuanceModel.findByBranch(query.branch_id, { ...query, engineer_id: engineerId });
    }
    
    // For SA without branch_id
    if (engineerId) {
        return await StockIssuanceModel.findByEngineer(engineerId);
    }
    
    throw { status: 400, message: 'Must provide branch_id or engineer_id' };
};

module.exports = {
    issueStockItem, acknowledgeIssuance, returnStockItem, getIssuanceHistory
};
