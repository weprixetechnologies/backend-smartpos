const StockItemService = require('../services/StockItem.service');

const getOne = async (req, res, next) => {
    try {
        const result = await StockItemService.getStockItem(req.user, req.params.id);
        res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
};

const list = async (req, res, next) => {
    try {
        const result = await StockItemService.listStockItems(req.user, req.query);
        res.status(200).json({ success: true, ...result });
    } catch (err) { next(err); }
};

const update = async (req, res, next) => {
    try {
        const result = await StockItemService.updateStockItem(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
};

const decommission = async (req, res, next) => {
    try {
        const result = await StockItemService.decommissionStockItem(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, ...result });
    } catch (err) { next(err); }
};

module.exports = {
    getOne, list, update, decommission
};
