const MachineDispatchService = require('../services/MachineDispatch.service');

const dispatch = async (req, res, next) => {
    try {
        const result = await MachineDispatchService.dispatchMachine(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
};

const confirmReceipt = async (req, res, next) => {
    try {
        const result = await MachineDispatchService.confirmMachineReceipt(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, ...result });
    } catch (err) { next(err); }
};

module.exports = {
    dispatch, confirmReceipt
};
