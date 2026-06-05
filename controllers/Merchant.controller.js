const MerchantService = require('../services/Merchant.service');
const { validationResult } = require('express-validator');

const MerchantController = {
    async register(req, res) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        try {
            const data = await MerchantService.registerMerchant(req.user, req.body);
            res.status(201).json({ success: true, data });
        } catch (error) {
            res.status(error.statusCode || 500).json({ success: false, message: error.message });
        }
    },

    async getOne(req, res) {
        try {
            const data = await MerchantService.getMerchant(req.user, req.params.id);
            res.status(200).json({ success: true, data });
        } catch (error) {
            res.status(error.statusCode || 500).json({ success: false, message: error.message });
        }
    },

    async list(req, res) {
        try {
            const result = await MerchantService.listMerchants(req.user, req.query);
            res.status(200).json({ success: true, ...result });
        } catch (error) {
            res.status(error.statusCode || 500).json({ success: false, message: error.message });
        }
    },

    async edit(req, res) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        try {
            const data = await MerchantService.editMerchant(req.user, req.params.id, req.body);
            res.status(200).json({ success: true, data });
        } catch (error) {
            res.status(error.statusCode || 500).json({ success: false, message: error.message });
        }
    },

    async deactivate(req, res) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        try {
            const result = await MerchantService.deactivateMerchant(req.user, req.params.id, req.body);
            res.status(200).json({ success: true, ...result });
        } catch (error) {
            res.status(error.statusCode || 500).json({ success: false, message: error.message });
        }
    },

    async reactivate(req, res) {
        try {
            const result = await MerchantService.reactivateMerchant(req.user, req.params.id);
            res.status(200).json({ success: true, ...result });
        } catch (error) {
            res.status(error.statusCode || 500).json({ success: false, message: error.message });
        }
    },

    async searchByMobile(req, res) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        try {
            const data = await MerchantService.searchByMobile(req.user, req.query.mobile);
            res.status(200).json({ success: true, data });
        } catch (error) {
            res.status(error.statusCode || 500).json({ success: false, message: error.message });
        }
    },

    async searchByPincode(req, res) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        try {
            const data = await MerchantService.searchByPincode(req.user, req.query.pincode);
            res.status(200).json({ success: true, data });
        } catch (error) {
            res.status(error.statusCode || 500).json({ success: false, message: error.message });
        }
    }
};

module.exports = MerchantController;
