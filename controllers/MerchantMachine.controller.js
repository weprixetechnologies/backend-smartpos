const MerchantMachineService = require('../services/MerchantMachine.service');
const { validationResult } = require('express-validator');

const MerchantMachineController = {
    async assign(req, res) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        try {
            const data = await MerchantMachineService.assignMachine(req.user, req.params.merchantId, req.body);
            res.status(201).json({ success: true, data });
        } catch (error) {
            res.status(error.statusCode || 500).json({ success: false, message: error.message });
        }
    },

    async unassign(req, res) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        try {
            const result = await MerchantMachineService.unassignMachine(req.user, req.params.merchantId, req.body);
            res.status(200).json({ success: true, ...result });
        } catch (error) {
            res.status(error.statusCode || 500).json({ success: false, message: error.message });
        }
    },

    async listMachines(req, res) {
        try {
            const data = await MerchantMachineService.getMerchantMachines(req.user, req.params.merchantId);
            res.status(200).json({ success: true, data });
        } catch (error) {
            res.status(error.statusCode || 500).json({ success: false, message: error.message });
        }
    },

    async machineHistory(req, res) {
        try {
            const data = await MerchantMachineService.getMerchantMachineHistory(req.user, req.params.merchantId);
            res.status(200).json({ success: true, data });
        } catch (error) {
            res.status(error.statusCode || 500).json({ success: false, message: error.message });
        }
    }
};

module.exports = MerchantMachineController;
