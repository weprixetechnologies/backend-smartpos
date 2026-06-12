const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const AuthService = require('../services/Auth.service');
const EmployeeModel = require('../models/Employee.model');
const RefreshTokenModel = require('../models/RefreshToken.model');

// ─── Cookie name constants ────────────────────────────────────────────────────
// __Host- prefix enforces: Secure + Path=/ + no Domain attribute
// This prevents subdomain injection attacks.
// __Host- REQUIRES HTTPS so we only use it in production.
// In development (HTTP localhost) we use plain names.
const IS_PROD = process.env.NODE_ENV === 'production';

const ACCESS_COOKIE = IS_PROD ? '__Host-accessToken' : 'accessToken';
const REFRESH_COOKIE = IS_PROD ? '__Host-refreshToken' : 'refreshToken';

// ─── Cookie option builders ───────────────────────────────────────────────────
function accessCookieOpts() {
    return {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: IS_PROD ? 'strict' : 'lax',
        path: '/',
        maxAge: 15 * 60 * 1000,          // 15 minutes
        // ⚠️  NO domain attribute — required for __Host- prefix in production
    };
}

function refreshCookieOpts() {
    const days = parseInt(process.env.JWT_REFRESH_EXPIRY_DAYS || '30', 10);
    return {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: IS_PROD ? 'strict' : 'lax',
        path: '/',
        maxAge: days * 24 * 60 * 60 * 1000,
        // ⚠️  NO domain attribute — required for __Host- prefix in production
    };
}

function clearCookieOpts() {
    return {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: IS_PROD ? 'strict' : 'lax',
        path: '/',
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function setAuthCookies(res, accessToken, refreshToken) {
    res.cookie(ACCESS_COOKIE, accessToken, accessCookieOpts());
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOpts());
}

function clearAuthCookies(res) {
    res.clearCookie(ACCESS_COOKIE, clearCookieOpts());
    res.clearCookie(REFRESH_COOKIE, clearCookieOpts());
}

// ─── Controllers ─────────────────────────────────────────────────────────────

async function login(req, res, next) {
    try {
        const { identifier, password } = req.body;
        const deviceInfo = req.headers['user-agent'] || 'unknown';
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';

        const result = await AuthService.login(identifier, password, deviceInfo, ipAddress);

        // Set tokens in HttpOnly cookies — never expose raw tokens to client JS
        setAuthCookies(res, result.accessToken, result.refreshToken);

        return res.json({
            success: true,
            data: { user: result.user }
        });
    } catch (err) {
        next(err);
    }
}

async function loginApp(req, res, next) {
    try {
        const { identifier, password } = req.body;
        const deviceInfo = req.headers['user-agent'] || 'unknown';
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';

        const result = await AuthService.login(identifier, password, deviceInfo, ipAddress);

        return res.json({
            success: true,
            data: {
                user: result.user,
                accessToken: result.accessToken,
                refreshToken: result.refreshToken
            }
        });
    } catch (err) {
        next(err);
    }
} 

// ─── GET /auth/validate-me ────────────────────────────────────────────────────
// Stateless — JWT decode only, zero DB queries.
// Called by AuthContext on every page mount/refresh.
async function validateMe(req, res) {
    try {
        const token = req.cookies?.[ACCESS_COOKIE];

        if (!token) {
            console.log(`[Auth/validate-me] No access token provided.`);
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        console.log(`[Auth/validate-me] Access token valid for user ID: ${decoded.id} (${decoded.role})`);

        return res.json({
            success: true,
            data: {
                user: {
                    id: decoded.id,
                    full_name: decoded.name,
                    email: decoded.email || null,
                    employee_code: decoded.employee_code || null,
                    role: decoded.role,
                    branch_id: decoded.branch_id,
                    branch_name: decoded.branch_name || null,
                    login_time: decoded.login_time || null,
                    isAuthenticated: true
                }
            }
        });
    } catch (err) {
        console.log(`[Auth/validate-me] Access token verification failed (${err.message}). Trying fallback refresh...`);
        // Fallback: If access token is invalid/expired, try to refresh
        try {
            const rawRefreshToken = req.cookies?.[REFRESH_COOKIE];
            if (!rawRefreshToken) {
                console.log(`[Auth/validate-me] No refresh token available for fallback.`);
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            const crypto = require('crypto');
            const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

            let tokenRow = null;
            const expiredAccessToken = req.cookies?.[ACCESS_COOKIE];
            if (expiredAccessToken) {
                const decoded = jwt.decode(expiredAccessToken);
                if (decoded?.id) {
                    tokenRow = await RefreshTokenModel.findValidToken(decoded.id, tokenHash);
                }
            }

            if (!tokenRow) {
                tokenRow = await RefreshTokenModel.findValidTokenByHash(tokenHash);
            }

            if (!tokenRow) {
                console.log(`[Auth/validate-me] Refresh token not found in DB or expired. Clearing cookies.`);
                clearAuthCookies(res);
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            const employee = await EmployeeModel.findById(tokenRow.employee_id);
            if (!employee || employee.status === 'INACTIVE') {
                console.log(`[Auth/validate-me] Employee ${tokenRow.employee_id} is inactive or not found. Revoking tokens.`);
                await RefreshTokenModel.revokeAllForEmployee(tokenRow.employee_id);
                clearAuthCookies(res);
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            const deviceInfo = req.headers['user-agent'] || 'unknown';
            const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';

            const result = await AuthService.refreshToken(
                rawRefreshToken,
                tokenRow.employee_id,
                deviceInfo,
                ipAddress
            );

            console.log(`[Auth/validate-me] Fallback refresh successful for employee ID: ${tokenRow.employee_id}. Issuing new cookies.`);
            setAuthCookies(res, result.accessToken, result.refreshToken);

            return res.json({
                success: true,
                data: { user: result.user }
            });
        } catch (refreshErr) {
            console.log(`[Auth/validate-me] Fallback refresh encountered an error:`, refreshErr.message);
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
    }
}

// ─── POST /auth/refresh-token ─────────────────────────────────────────────────
// Called automatically by the axios interceptor when a 401 is received.
// Reads both cookies; decodes (NOT verifies) the access token to extract
// employee_id so we can rotate the refresh token safely.
// Falls back to hash-only lookup if the access token is missing/unreadable.
async function refreshToken(req, res, next) {
    try {
        const rawRefreshToken = req.cookies?.[REFRESH_COOKIE] || req.body.refreshToken;
        if (!rawRefreshToken) {
            return res.status(401).json({ success: false, message: 'No refresh token provided' });
        }

        // Hash the incoming raw refresh token for DB lookup
        const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

        // Try to decode (NOT verify — it may be expired) the access token
        // to get the employee_id for a more targeted lookup
        let tokenRow = null;
        const expiredAccessToken = req.cookies?.[ACCESS_COOKIE];

        if (expiredAccessToken) {
            const decoded = jwt.decode(expiredAccessToken);  // no expiry check
            if (decoded?.id) {
                tokenRow = await RefreshTokenModel.findValidToken(decoded.id, tokenHash);
            }
        }

        // Fallback: find by hash alone (SHA-256 is collision-safe)
        if (!tokenRow) {
            tokenRow = await RefreshTokenModel.findValidTokenByHash(tokenHash);
        }

        if (!tokenRow) {
            clearAuthCookies(res);
            return res.status(401).json({ success: false, message: 'Refresh token expired or revoked' });
        }

        // Validate employee still exists and is active
        const employee = await EmployeeModel.findById(tokenRow.employee_id);
        if (!employee || employee.status === 'INACTIVE') {
            await RefreshTokenModel.revokeAllForEmployee(tokenRow.employee_id);
            clearAuthCookies(res);
            return res.status(403).json({ success: false, message: 'Account is inactive' });
        }

        // Rotate — revoke old token, issue new pair via service
        const deviceInfo = req.headers['user-agent'] || 'unknown';
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';

        const result = await AuthService.refreshToken(
            rawRefreshToken,
            tokenRow.employee_id,
            deviceInfo,
            ipAddress
        );

        // Set fresh cookies
        setAuthCookies(res, result.accessToken, result.refreshToken);

        return res.json({ success: true, message: 'Token refreshed' });
    } catch (err) {
        next(err);
    }
}

// ─── POST /auth/refresh-token-app ─────────────────────────────────────────────
// Mobile variant — reads refreshToken from request body, returns new tokens
// in the JSON response instead of setting cookies.
async function refreshTokenApp(req, res, next) {
    try {
        const rawRefreshToken = req.body.refreshToken;
        if (!rawRefreshToken) {
            return res.status(401).json({ success: false, message: 'No refresh token provided' });
        }

        // Hash the incoming raw refresh token for DB lookup
        const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

        // Find the token row by hash
        const tokenRow = await RefreshTokenModel.findValidTokenByHash(tokenHash);

        if (!tokenRow) {
            return res.status(401).json({ success: false, message: 'Refresh token expired or revoked' });
        }

        // Validate employee still exists and is active
        const employee = await EmployeeModel.findById(tokenRow.employee_id);
        if (!employee || employee.status === 'INACTIVE') {
            await RefreshTokenModel.revokeAllForEmployee(tokenRow.employee_id);
            return res.status(403).json({ success: false, message: 'Account is inactive' });
        }

        // Rotate — revoke old token, issue new pair via service
        const deviceInfo = req.headers['user-agent'] || 'unknown';
        const ipAddress  = req.ip || req.headers['x-forwarded-for'] || 'unknown';

        const result = await AuthService.refreshToken(
            rawRefreshToken,
            tokenRow.employee_id,
            deviceInfo,
            ipAddress
        );

        return res.json({
            success: true,
            message: 'Token refreshed',
            data: {
                token: result.accessToken,
                refreshToken: result.refreshToken,
            }
        });
    } catch (err) {
        next(err);
    }
}

// ─── POST /auth/logout ────────────────────────────────────────────────────────
async function logout(req, res, next) {
    try {
        const rawRefreshToken = req.cookies?.[REFRESH_COOKIE];
        if (rawRefreshToken) {
            if (req.user?.id) {
                await AuthService.logout(rawRefreshToken, req.user.id);
            } else {
                const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
                const tokenRow = await RefreshTokenModel.findValidTokenByHash(tokenHash);
                if (tokenRow) {
                    await RefreshTokenModel.revokeToken(tokenRow.id);
                }
            }
        }
        clearAuthCookies(res);
        return res.json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
        next(err);
    }
}

// ─── POST /auth/logout-all ────────────────────────────────────────────────────
async function logoutAll(req, res, next) {
    try {
        await AuthService.logoutAll(req.user.id);
        clearAuthCookies(res);
        return res.json({ success: true, message: 'All sessions revoked' });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    login,
    loginApp,
    validateMe,
    refreshToken,
    refreshTokenApp,
    logout,
    logoutAll,
    // Export cookie name so middleware can read the right cookie
    ACCESS_COOKIE,
    REFRESH_COOKIE,
};
