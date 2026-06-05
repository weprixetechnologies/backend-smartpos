const StockIssuanceService = require('../services/StockIssuance.service');

const issue = async (req, res, next) => {
    try {
        const result = await StockIssuanceService.issueStockItem(req.user, req.body);
        res.status(201).json({ success: true, data: result });
    } catch (err) { next(err); }
};

const acknowledge = async (req, res, next) => {
    try {
        const result = await StockIssuanceService.acknowledgeIssuance(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, ...result });
    } catch (err) { next(err); }
};

const returnStock = async (req, res, next) => {
    try {
        const result = await StockIssuanceService.returnStockItem(req.user, req.body);
        res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
};

const history = async (req, res, next) => {
    try {
        const result = await StockIssuanceService.getIssuanceHistory(req.user, req.query);
        res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
};

module.exports = {
    issue, acknowledge, returnStock, history
};
