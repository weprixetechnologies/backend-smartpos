const TicketStatusService = require('../services/TicketStatus.service');

const markEnRoute = async (req, res) => {
    try {
        const ticket = await TicketStatusService.markEnRoute(req.user, req.params.id);
        res.status(200).json({ success: true, data: ticket });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const markArrived = async (req, res) => {
    try {
        const result = await TicketStatusService.markArrived(req.user, req.params.id);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const markMachinePicked = async (req, res) => {
    try {
        const ticket = await TicketStatusService.markMachinePicked(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, data: ticket });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const markInOffice = async (req, res) => {
    try {
        const ticket = await TicketStatusService.markInOffice(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, data: ticket });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const markUnderRepair = async (req, res) => {
    try {
        const ticket = await TicketStatusService.markUnderRepair(req.user, req.params.id);
        res.status(200).json({ success: true, data: ticket });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const markReadyDeploy = async (req, res) => {
    try {
        const ticket = await TicketStatusService.markReadyDeploy(req.user, req.params.id);
        res.status(200).json({ success: true, data: ticket });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

module.exports = {
    markEnRoute,
    markArrived,
    markMachinePicked,
    markInOffice,
    markUnderRepair,
    markReadyDeploy
};
