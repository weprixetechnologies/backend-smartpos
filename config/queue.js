const { Queue } = require('bullmq');
const { getRedisClient } = require('./redis');

let otpQueue = null;

const getOtpQueue = async () => {
    if (otpQueue) return otpQueue;
    const connection = await getRedisClient();
    otpQueue = new Queue('otp-email', { connection });
    return otpQueue;
};

module.exports = { getOtpQueue };
