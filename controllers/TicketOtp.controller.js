const TicketOtpService = require('../services/TicketOtp.service');

const validateArrivalOtp = async (req, res) => {
    try {
        const ticket = await TicketOtpService.validateArrivalOtp(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, data: ticket });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const requestFallback = async (req, res) => {
    try {
        const result = await TicketOtpService.requestFallbackCode(req.user, req.params.id);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const generateFallback = async (req, res) => {
    try {
        const result = await TicketOtpService.generateFallbackCode(req.user, req.params.id);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const validateFallback = async (req, res) => {
    try {
        const ticket = await TicketOtpService.validateFallbackCode(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, data: ticket });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const sendSignoffOtp = async (req, res) => {
    try {
        const result = await TicketOtpService.sendMerchantSignoffOtp(req.user, req.params.id);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const validateSignoffOtp = async (req, res) => {
    try {
        const ticket = await TicketOtpService.validateMerchantSignoffOtp(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, data: ticket });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

module.exports = {
    validateArrivalOtp,
    requestFallback,
    generateFallback,
    validateFallback,
    sendSignoffOtp,
    validateSignoffOtp
};
