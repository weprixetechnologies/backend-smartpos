const MachineService = require('../services/Machine.service');
const MachineCustodyModel = require('../models/MachineCustody.model');
const TidMappingModel = require('../models/TidMapping.model');

const addMachine = async (req, res, next) => {
    try {
        const result = await MachineService.addMachine(req.user, req.body);
        res.status(201).json({ success: true, data: result });
    } catch (err) { next(err); }
};

const editMachine = async (req, res, next) => {
    try {
        const result = await MachineService.editMachine(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
};

const decommission = async (req, res, next) => {
    try {
        const result = await MachineService.decommissionMachine(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, ...result });
    } catch (err) { next(err); }
};

const getMachine = async (req, res, next) => {
    try {
        const result = await MachineService.getMachine(req.user, req.params.id);
        res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
};

const listMachines = async (req, res, next) => {
    try {
        const result = await MachineService.listMachines(req.user, req.query);
        res.status(200).json({ success: true, ...result });
    } catch (err) { next(err); }
};

const mapTid = async (req, res, next) => {
    try {
        const result = await MachineService.mapTid(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, ...result });
    } catch (err) { next(err); }
};

const unmapTid = async (req, res, next) => {
    try {
        const result = await MachineService.unmapTid(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, ...result });
    } catch (err) { next(err); }
};

const transferBranch = async (req, res, next) => {
    try {
        const result = await MachineService.transferBranch(req.user, req.params.id, req.body);
        res.status(200).json({ success: true, ...result });
    } catch (err) { next(err); }
};

const getCustodyChain = async (req, res, next) => {
    try {
        const result = await MachineCustodyModel.findByMachine(req.params.id);
        res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
};

const getTidHistory = async (req, res, next) => {
    try {
        const result = await TidMappingModel.getHistory(req.params.id);
        res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
};

const getStats = async (req, res, next) => {
    try {
        const result = await MachineService.getStats(req.user);
        res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
};

module.exports = {
    addMachine, editMachine, decommission, getMachine, listMachines,
    mapTid, unmapTid, transferBranch, getCustodyChain, getTidHistory, getStats
};
