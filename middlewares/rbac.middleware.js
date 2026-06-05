const logger = require('../utils/logger');

const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            logger.warn(`[RBAC] Access denied: No req.user found`, { path: req.originalUrl, requiredRoles: roles });
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        if (!roles.includes(req.user.role)) {
            logger.warn(`[RBAC] Access denied: Role mismatch`, { path: req.originalUrl, userRole: req.user.role, requiredRoles: roles });
            return res.status(403).json({ success: false, message: 'Access denied: Role mismatch' });
        }
        next();
    };
};

module.exports = requireRole;
