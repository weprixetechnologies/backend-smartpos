const StockItemModel = require('../models/StockItem.model');
const auditEmitter = require('../utils/auditEmitter');
const { buildEntry } = require('./AuditLogger.service');

const getStockItem = async (actorUser, itemId) => {
    if (actorUser.role === 'ENGINEER') throw { status: 403, message: 'Permission denied' };

    const item = await StockItemModel.findById(itemId);
    if (!item) throw { status: 404, message: 'Stock item not found' };

    if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        if (item.branch_id !== actorUser.branch_id) throw { status: 403, message: 'Branch scope violation' };
    }

    return item;
};

const listStockItems = async (actorUser, query) => {
    if (actorUser.role === 'ENGINEER') throw { status: 403, message: 'Permission denied' };

    const filters = { ...query };
    if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        filters.branch_id = actorUser.branch_id;
    }

    return await StockItemModel.findAll(filters);
};

const updateStockItem = async (actorUser, itemId, payload) => {
    const item = await StockItemModel.findById(itemId);
    if (!item) throw { status: 404, message: 'Stock item not found' };

    if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        if (item.branch_id !== actorUser.branch_id) throw { status: 403, message: 'Branch scope violation' };
    } else if (actorUser.role !== 'SUPERADMIN' && actorUser.role !== 'SUPER_ADMIN') {
        throw { status: 403, message: 'Permission denied' };
    }

    await StockItemModel.update(itemId, payload);
    const updated = await StockItemModel.findById(itemId);

    auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
        module: 'STOCK',
        action_code: 'STOCK_ITEM_UPDATED',
        entity_type: 'stock_items',
        entity_id: itemId,
        previous_state: item,
        new_state: updated
    }));

    return updated;
};

const decommissionStockItem = async (actorUser, itemId, { reason }) => {
    if (actorUser.role !== 'MANAGER' && actorUser.role !== 'SUPERADMIN' && actorUser.role !== 'SUPER_ADMIN') {
        throw { status: 403, message: 'Permission denied' };
    }

    const item = await StockItemModel.findById(itemId);
    if (!item) throw { status: 404, message: 'Stock item not found' };

    if (actorUser.role === 'MANAGER' && item.branch_id !== actorUser.branch_id) {
        throw { status: 403, message: 'Branch scope violation' };
    }

    if (!['AVAILABLE', 'IN_OFFICE_AWAITING_DISPATCH'].includes(item.state)) {
        throw { status: 409, message: `Cannot decommission item in current state: ${item.state}` };
    }

    await StockItemModel.decommission(itemId);

    auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
        module: 'STOCK',
        action_code: 'STOCK_ITEM_DECOMMISSIONED',
        entity_type: 'stock_items',
        entity_id: itemId,
        previous_state: item,
        notes: reason
    }));

    return { success: true };
};

module.exports = {
    getStockItem, listStockItems, updateStockItem, decommissionStockItem
};
