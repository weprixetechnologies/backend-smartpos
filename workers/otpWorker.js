const { Worker } = require('bullmq');
const { getRedisClient } = require('../config/redis');
const transporter = require('../config/mailer');

const startOtpWorker = async () => {
    const connection = await getRedisClient();

    const worker = new Worker('otp-email', async (job) => {
        const { to, subject, otp, purpose, ticket_number } = job.data;

        // ALWAYS log first — primary testing mechanism
        console.log(`[OTP Worker] purpose=${purpose} ticket=${ticket_number} otp=${otp} to=${to}`);

        try {
            await transporter.sendMail({
                from: process.env.SMTP_FROM || '"POS Platform" <noreply@pos-platform.com>',
                to,
                subject,
                html: `
                    <h2>Your OTP for ${purpose.replace(/_/g, ' ')}</h2>
                    <p>Ticket: <strong>${ticket_number}</strong></p>
                    <p>OTP: <strong style="font-size:24px;letter-spacing:4px">${otp}</strong></p>
                    <p>Valid for 10 minutes.</p>
                `,
            });
        } catch (err) {
            // Email failure must NOT fail the job — OTP is already in Redis + logged
            console.error('[OTP Worker] Email send failed (non-fatal):', err.message);
        }
    }, { connection });

    worker.on('completed', (job) => {
        console.log(`[OTP Worker] Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
        console.error(`[OTP Worker] Job ${job?.id} failed:`, err.message);
    });

    console.log('[OTP Worker] Started');
    return worker;
};

module.exports = { startOtpWorker };
