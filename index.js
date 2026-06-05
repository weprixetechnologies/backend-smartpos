require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const logger = require('./utils/logger');
const { init: initAuditLogger } = require('./services/AuditLogger.service');
const actionLogRoutes = require('./routes/actionLog.routes');
const authRoutes = require('./routes/auth.routes');
const employeeRoutes = require('./routes/employee.routes');
const shiftRoutes = require('./routes/shift.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const leaveRoutes = require('./routes/leave.routes');
const holidayRoutes = require('./routes/holiday.routes');
const branchRoutes = require('./routes/branch.routes');
const ticketRoutes = require('./routes/ticket.routes');
const ticketStatusRoutes = require('./routes/ticketStatus.routes');
const ticketOtpRoutes = require('./routes/ticketOtp.routes');
const machineRoutes = require('./routes/machine.routes');
const machineDispatchRoutes = require('./routes/machineDispatch.routes');
const consignmentRoutes = require('./routes/consignment.routes');
const stockItemRoutes = require('./routes/stockItem.routes');
const stockIssuanceRoutes = require('./routes/stockIssuance.routes');
const merchantRoutes = require('./routes/merchant.routes');
const merchantMachineRoutes = require('./routes/merchantMachine.routes');
const { startOtpWorker } = require('./workers/otpWorker');
const app = express();
const PORT = process.env.PORT || 3000;

// Cookie parser — must come before CORS and routes
app.use(cookieParser());

// CORS middleware
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, content-type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle preflight options request
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Built-in middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger for development
app.use((req, res, next) => {
    logger.info(`Incoming Request`, { method: req.method, url: req.url, ip: req.ip });
    next();
});

// Initialize audit logger once on boot
initAuditLogger();
startOtpWorker();

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Audit log routes
app.use('/api/action-logs', actionLogRoutes);

// Auth & Employee routes
app.use('/api/branches', branchRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/tickets', ticketStatusRoutes);
app.use('/api/tickets', ticketOtpRoutes);

// Asset Management & Stock routes
app.use('/api/machines', machineRoutes);
app.use('/api/machines', machineDispatchRoutes);
app.use('/api/consignments', consignmentRoutes);
app.use('/api/stock-items', stockItemRoutes);
app.use('/api/stock-issuances', stockIssuanceRoutes);
app.use('/api/merchants', merchantRoutes);
app.use('/api/merchants', merchantMachineRoutes);

// Example API route
app.get('/api', (req, res) => {
    res.json({ message: 'POS Merchant backend is running' });
});

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({ error: 'Not Found' });
});

// Global error handler
app.use((err, req, res, next) => {
    logger.error(`Express Error: ${err.message}`, err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error',
    });
});

// Process-level unhandled exception/rejection loggers
process.on('uncaughtException', (err) => {
    logger.error(`Uncaught Exception: ${err.message}`, err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

app.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT}`);
});
