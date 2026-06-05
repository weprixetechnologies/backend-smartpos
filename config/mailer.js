const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER || 'dummy@ethereal.email',
        pass: process.env.SMTP_PASS || 'dummypassword',
    },
});

module.exports = transporter;
