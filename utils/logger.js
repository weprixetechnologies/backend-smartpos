const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', 'logs');

if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const errorLogStream = fs.createWriteStream(path.join(logDir, 'error.log'), { flags: 'a' });
const combinedLogStream = fs.createWriteStream(path.join(logDir, 'combined.log'), { flags: 'a' });

const formatMessage = (level, message, meta = {}) => {
    const timestamp = new Date().toISOString();
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
        if (meta instanceof Error) {
            metaStr = `\nStack: ${meta.stack}`;
        } else {
            metaStr = `\nMeta: ${JSON.stringify(meta)}`;
        }
    }
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}\n`;
};

const logger = {
    info: (message, meta) => {
        const logMsg = formatMessage('info', message, meta);
        console.log(logMsg.trim());
        combinedLogStream.write(logMsg);
    },
    error: (message, meta) => {
        const logMsg = formatMessage('error', message, meta);
        console.error(logMsg.trim());
        errorLogStream.write(logMsg);
        combinedLogStream.write(logMsg);
    },
    warn: (message, meta) => {
        const logMsg = formatMessage('warn', message, meta);
        console.warn(logMsg.trim());
        combinedLogStream.write(logMsg);
    }
};

module.exports = logger;
