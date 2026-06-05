const BranchService = require('../services/Branch.service');

async function list(req, res) {
    try {
        const filters = {
            search: req.query.search,
            status: req.query.status,
            sort_by: req.query.sort_by,
            sort_dir: req.query.sort_dir,
            page: req.query.page,
            limit: req.query.limit
        };

        const result = await BranchService.getAll(filters);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('BranchController.list error', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

async function get(req, res) {
    try {
        const branch = await BranchService.getById(req.params.id);
        if (!branch) {
            return res.status(404).json({ success: false, error: 'Branch not found' });
        }
        res.json({ success: true, ...branch });
    } catch (err) {
        console.error('BranchController.get error', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

async function getDependencies(req, res) {
    try {
        const deps = await BranchService.getDependencies(req.params.id);
        if (!deps) {
            return res.status(404).json({ success: false, error: 'Branch not found' });
        }
        res.json({ success: true, ...deps });
    } catch (err) {
        console.error('BranchController.getDependencies error', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

async function create(req, res) {
    try {
        const branchId = await BranchService.create(req.body, req.user);
        const branch = await BranchService.getById(branchId);
        res.status(201).json({ success: true, ...branch });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, error: err.message, field: err.field });
        }
        console.error('BranchController.create error', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

async function update(req, res) {
    try {
        // Remove branch_code if maliciously provided
        if (req.body.branch_code) {
            delete req.body.branch_code;
        }

        const branchId = await BranchService.update(req.params.id, req.body, req.user);
        const branch = await BranchService.getById(branchId);
        res.json({ success: true, ...branch });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, error: err.message });
        }
        console.error('BranchController.update error', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

async function updateStatus(req, res) {
    try {
        const result = await BranchService.updateStatus(req.params.id, req.body.status, req.user);
        res.json({ success: true, ...result });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, error: err.message });
        }
        console.error('BranchController.updateStatus error', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

async function remove(req, res) {
    try {
        const branchCode = await BranchService.remove(req.params.id, req.user);
        res.json({ success: true, message: 'Branch deleted', branch_code: branchCode });
    } catch (err) {
        if (err.status) {
            const resp = { success: false, error: err.message };
            if (err.dependencies) resp.dependencies = err.dependencies;
            return res.status(err.status).json(resp);
        }
        console.error('BranchController.remove error', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

module.exports = {
    list,
    get,
    getDependencies,
    create,
    update,
    updateStatus,
    remove
};
