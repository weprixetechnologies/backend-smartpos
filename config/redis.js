const Redis = require('ioredis');

let client = null;

const getRedisClient = async () => {
    if (client) return client;
    client = new Redis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        maxRetriesPerRequest: null
    });
    
    // Required by BullMQ: Redis client needs to have maxRetriesPerRequest: null
    return client;
};

module.exports = { getRedisClient };
