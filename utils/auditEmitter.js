const EventEmitter = require('events');

const auditEmitter = new EventEmitter();
auditEmitter.setMaxListeners(100);

module.exports = auditEmitter;
