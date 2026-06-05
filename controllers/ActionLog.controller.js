const ActionLogModel = require('../models/ActionLog.model');

function buildFilters(query) {
    return {
        actor_id: query.actor_id || undefined,
        branch_id: query.branch_id || undefined,
        module: query.module || undefined,
        action_code: query.action_code || undefined,
        entity_type: query.entity_type || undefined,
        entity_id: query.entity_id || undefined,
        trigger_type: query.trigger_type || undefined,
        from: query.from || undefined,
        to: query.to || undefined,
        page: query.page || undefined,
        limit: query.limit || undefined
    };
}

async function getAll(req, res) {
    try {
        const filters = buildFilters(req.query);
        const branchScope = req.getBranchScope();
        if (branchScope) {
            filters.branch_id = branchScope;
        }
        
        const { rows, total, page, limit } = await ActionLogModel.findAll(filters);

        res.json({
            success: true,
            logs: rows,
            total,
            page,
            limit
        });
    } catch (err) {
        console.error('ActionLogController.getAll error', err);
        res.status(500).json({ success: false, message: 'Failed to load action logs.' });
    }
}

async function getById(req, res) {
    try {
        const log = await ActionLogModel.findById(req.params.id);
        if (!log) {
            return res.status(404).json({ success: false, message: 'Action log not found.' });
        }

        res.json({ success: true, data: log });
    } catch (err) {
        console.error('ActionLogController.getById error', err);
        res.status(500).json({ success: false, message: 'Failed to fetch action log.' });
    }
}

async function getByLogNumber(req, res) {
    try {
        const log = await ActionLogModel.findByLogNumber(req.params.log_number);
        if (!log) {
            return res.status(404).json({ success: false, message: 'Action log not found.' });
        }

        res.json({ success: true, data: log });
    } catch (err) {
        console.error('ActionLogController.getByLogNumber error', err);
        res.status(500).json({ success: false, message: 'Failed to fetch action log.' });
    }
}

module.exports = {
    getAll,
    getById,
    getByLogNumber
};
