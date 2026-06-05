const TicketService = require('../services/Ticket.service');
const EmployeeModel = require('../models/Employee.model');

const create = async (req, res) => {
    try {
        const ticket = await TicketService.createTicket(req.user, req.body);
        res.status(201).json({ success: true, data: ticket });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const assign = async (req, res) => {
    try {
        const ticket = await TicketService.assignEngineer(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, data: ticket });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const getOne = async (req, res) => {
    try {
        const ticketData = await TicketService.getTicket(req.user, req.params.id);
        res.status(200).json({ success: true, data: ticketData });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const list = async (req, res) => {
    try {
        const result = await TicketService.listTickets(req.user, req.query);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const cancel = async (req, res) => {
    try {
        const ticket = await TicketService.cancelTicket(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, data: ticket });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const addAttachment = async (req, res) => {
    try {
        const result = await TicketService.addAttachment(req.user, req.params.id, req.body);
        res.status(201).json({ success: true, ...result });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const sendMessage = async (req, res) => {
    try {
        const result = await TicketService.sendMessage(req.user, req.params.id, req.body);
        res.status(201).json({ success: true, ...result });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const submitJobSheet = async (req, res) => {
    try {
        const result = await TicketService.submitJobSheet(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const generateCloseCode = async (req, res) => {
    try {
        const result = await TicketService.generateCloseCode(req.user, req.params.id);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const submitCloseCode = async (req, res) => {
    try {
        const ticket = await TicketService.submitCloseCode(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, data: ticket });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const finalClose = async (req, res) => {
    try {
        const ticket = await TicketService.finalCloseTicket(req.user, req.params.id);
        res.status(200).json({ success: true, data: ticket });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const forceClose = async (req, res) => {
    try {
        const ticket = await TicketService.forceClose(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, data: ticket });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const updateServiceType = async (req, res) => {
    try {
        const ticket = await TicketService.updateServiceType(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, data: ticket });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const getWorkflowState = async (req, res) => {
    try {
        const state = await TicketService.getWorkflowState(req.user, req.params.id);
        res.status(200).json({ success: true, data: state });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const submitMilestone = async (req, res) => {
    try {
        const state = await TicketService.submitMilestone(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, data: state });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

const requestClosure = async (req, res) => {
    try {
        const ticket = await TicketService.requestClosure(req.user, req.params.id);
        res.status(200).json({ success: true, data: ticket });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};

module.exports = {
    create,
    assign,
    getOne,
    list,
    cancel,
    addAttachment,
    sendMessage,
    submitJobSheet,
    generateCloseCode,
    submitCloseCode,
    finalClose,
    forceClose,
    updateServiceType,
    getWorkflowState,
    submitMilestone,
    requestClosure
};
