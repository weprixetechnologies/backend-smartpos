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
    console.log('List Machines - Actor:', req.user, 'Query:', req.query);
    try {
        const result = await MachineService.listMachines(req.user, req.query);
        console.log('List Machines - Result:', result);
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
        const historyRows = await TidMappingModel.getHistory(req.params.id);
        const formattedEvents = [];
        for (const row of historyRows) {
            if (row.unmapped_at) {
                formattedEvents.push({
                    id: row.id + '_unmap',
                    action: 'UNMAPPED',
                    tid: row.tid,
                    merchant_name: row.merchant_name,
                    performed_by: row.unmapped_by_name || 'System',
                    created_at: row.unmapped_at
                });
            }
            formattedEvents.push({
                id: row.id + '_map',
                action: 'MAPPED',
                tid: row.tid,
                merchant_name: row.merchant_name,
                performed_by: row.mapped_by_name || 'System',
                created_at: row.mapped_at
            });
        }
        
        formattedEvents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        res.status(200).json({ success: true, data: formattedEvents });
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
