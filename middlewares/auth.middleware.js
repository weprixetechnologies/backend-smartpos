require('dotenv').config();

const jwt = require('jsonwebtoken');
const { ACCESS_COOKIE } = require('../controllers/Auth.controller');

/**
 * Reads the JWT from the HttpOnly cookie (name switches between dev/prod via __Host- prefix).
 * Falls back to Authorization: Bearer <token> for API clients (Postman, etc.).
 */
const verifyToken = (req, res, next) => {
    // 1. Prefer HttpOnly cookie (browser clients)
    let token = req.cookies?.[ACCESS_COOKIE];

    // 2. Fallback to Bearer header (API clients / Postman)
    if (!token) {
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }
    }

    if (!token) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    jwt.verify(token, process.env.JWT_ACCESS_SECRET, (err, decoded) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ success: false, message: 'Token expired' });
            }
            if (err.name === 'JsonWebTokenError') {
                return res.status(401).json({ success: false, message: 'Invalid token' });
            }
            return res.status(500).json({ success: false, message: 'Authentication failed' });
        }
        req.user = decoded;
        req.getBranchScope = () => req.user.role === 'SUPERADMIN' ? null : req.user.branch_id;
        next();
    });
};

module.exports = verifyToken;
