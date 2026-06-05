const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/Auth.controller');
const { validateLogin } = require('../validators/auth.validator');
const verifyToken = require('../middlewares/auth.middleware');

// Public routes
router.post('/login',          validateLogin,  AuthController.login);
router.get('/validate-me',                     AuthController.validateMe);
router.post('/refresh-token',                  AuthController.refreshToken);  // called by axios interceptor

// Protected routes (require valid access token)
router.post('/logout',                         AuthController.logout); // Must be able to clear expired/invalid cookies
router.post('/logout-all',     verifyToken,    AuthController.logoutAll);

module.exports = router;
