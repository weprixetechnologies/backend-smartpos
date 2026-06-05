const ConsignmentService = require('../services/Consignment.service');

const create = async (req, res, next) => {
    try {
        const result = await ConsignmentService.createConsignment(req.user, req.body);
        res.status(201).json({ success: true, data: result });
    } catch (err) { next(err); }
};

const receiveItem = async (req, res, next) => {
    try {
        const result = await ConsignmentService.receiveConsignmentItem(req.user, req.params.id, req.body);
        res.status(201).json({ success: true, data: result });
    } catch (err) { next(err); }
};

const raiseDiscrepancy = async (req, res, next) => {
    try {
        const result = await ConsignmentService.raiseDiscrepancy(req.user, req.params.id, req.body);
        res.status(201).json({ success: true, ...result });
    } catch (err) { next(err); }
};

const resolveDiscrepancy = async (req, res, next) => {
    try {
        const result = await ConsignmentService.resolveDiscrepancy(req.user, req.params.discrepancyId);
        res.status(200).json({ success: true, ...result });
    } catch (err) { next(err); }
};

const getOne = async (req, res, next) => {
    try {
        const result = await ConsignmentService.getConsignment(req.user, req.params.id);
        res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
};

const list = async (req, res, next) => {
    try {
        const result = await ConsignmentService.listConsignments(req.user, req.query);
        res.status(200).json({ success: true, ...result });
    } catch (err) { next(err); }
};

const updateActualCount = async (req, res, next) => {
    try {
        const result = await ConsignmentService.updateActualCount(req.user, req.params.id, req.body.received_count);
        res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
};

const markArrived = async (req, res, next) => {
    try {
        const result = await ConsignmentService.markArrived(req.user, req.params.id);
        res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
};

module.exports = {
    create, receiveItem, raiseDiscrepancy, resolveDiscrepancy, getOne, list, updateActualCount, markArrived
};
