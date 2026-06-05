const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getRedisClient } = require('../config/redis');
const { getOtpQueue } = require('../config/queue');
const OtpRecordModel = require('../models/OtpRecord.model');
const TicketModel = require('../models/Ticket.model');
const TicketStatusHistoryModel = require('../models/TicketStatusHistory.model');
const auditEmitter = require('../utils/auditEmitter');

const KEY_MAP = {
    ARRIVAL: (id) => `otp:arrival:${id}`,
    FALLBACK: (id) => `otp:fallback:${id}`,
    SIGNOFF: (id) => `otp:signoff:${id}`,
    FALLBACK_REQ: (id) => `otp:fallback:request:${id}`
};

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const sendArrivalOtp = async (ticket) => {
    const otp = generateOtp();
    const redis = await getRedisClient();
    const key = KEY_MAP.ARRIVAL(ticket.id);

    await redis.setex(key, 600, JSON.stringify({ otp, attempts: 0 }));

    const otp_hash = await bcrypt.hash(otp, 10);
    
    await OtpRecordModel.create({
        purpose: 'ARRIVAL_CONFIRMATION',
        recipient: ticket.merchant_mobile,
        otp_hash,
        entity_id: ticket.id,
        expires_at: new Date(Date.now() + 600 * 1000)
    });

    const otpQueue = await getOtpQueue();
    await otpQueue.add('send-otp', {
        to: ticket.merchant_email || ticket.merchant_mobile,
        subject: 'Engineer Arrival Confirmation OTP',
        otp,
        purpose: 'ARRIVAL_CONFIRMATION',
        ticket_number: ticket.ticket_number
    });

    console.log(`[OTP] ARRIVAL OTP for ticket ${ticket.ticket_number} : ${otp}`);
};

const validateArrivalOtp = async (actorUser, ticketId, payload) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };
    if (ticket.assigned_engineer_id !== actorUser.id) throw { status: 403, message: 'Not authorized for this ticket' };
    if (ticket.status !== 'ARRIVED_PENDING') throw { status: 409, message: 'Ticket is not in ARRIVED_PENDING status' };

    const redis = await getRedisClient();
    const key = KEY_MAP.ARRIVAL(ticketId);
    const dataStr = await redis.get(key);

    if (!dataStr) {
        throw { status: 410, message: 'OTP has expired. Request a new one.' };
    }

    const data = JSON.parse(dataStr);
    const storedOtp = data.otp;
    const attempts = data.attempts;
    const otpRecord = await OtpRecordModel.findLatestPending(ticketId, 'ARRIVAL_CONFIRMATION');

    if (attempts >= 3) {
        await redis.del(key);
        if (otpRecord) {
            await OtpRecordModel.updateStatus(otpRecord.id, { status: 'FAILED' });
        }
        throw { status: 429, message: 'Maximum OTP attempts exceeded. Contact operator for fallback code.' };
    }

    if (payload.otp !== storedOtp) {
        const remainingTTL = await redis.ttl(key);
        await redis.setex(key, remainingTTL > 0 ? remainingTTL : 1, JSON.stringify({ otp: storedOtp, attempts: attempts + 1 }));
        if (otpRecord) {
            await OtpRecordModel.updateStatus(otpRecord.id, { attempts: attempts + 1 });
        }
        throw { status: 401, message: `Invalid OTP. ${3 - (attempts + 1)} attempts remaining.` };
    }

    await redis.del(key);
    if (otpRecord) {
        await OtpRecordModel.updateStatus(otpRecord.id, { status: 'VALIDATED', validated_at: new Date() });
    }

    await TicketModel.update(ticketId, { status: 'IN_PROGRESS', started_at: new Date(), arrived_at: new Date() });
    await TicketStatusHistoryModel.create({
        ticket_id: ticketId,
        from_status: 'ARRIVED_PENDING',
        to_status: 'IN_PROGRESS',
        changed_by: actorUser.id,
        changed_by_role: actorUser.role,
        notes: 'Arrival OTP validated'
    });

    const updatedTicket = await TicketModel.findById(ticketId);
    
    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'ARRIVAL_OTP_VALIDATED',
        entity_type: 'tickets',
        entity_id: ticketId,
        actor_id: actorUser.id,
        new_state: updatedTicket
    });

    return updatedTicket;
};

const requestFallbackCode = async (actorUser, ticketId) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };
    if (ticket.assigned_engineer_id !== actorUser.id) throw { status: 403, message: 'Not authorized for this ticket' };
    if (ticket.status !== 'ARRIVED_PENDING') throw { status: 409, message: 'Ticket is not in ARRIVED_PENDING status' };

    const redis = await getRedisClient();
    const key = KEY_MAP.FALLBACK_REQ(ticketId);
    
    await redis.setex(key, 600, JSON.stringify({
        engineer_id: actorUser.id,
        engineer_name: actorUser.name,
        ticket_id: ticketId,
        requested_at: new Date()
    }));

    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'FALLBACK_OTP_REQUESTED',
        entity_type: 'tickets',
        entity_id: ticketId,
        actor_id: actorUser.id
    });

    return { message: 'Fallback code request sent to operator' };
};

const generateFallbackCode = async (actorUser, ticketId) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };
    
    if (['OPERATOR', 'MANAGER'].includes(actorUser.role) && ticket.branch_id !== actorUser.branch_id) {
        throw { status: 403, message: 'Ticket belongs to a different branch' };
    }
    
    if (ticket.status !== 'ARRIVED_PENDING') throw { status: 409, message: 'Ticket is not in ARRIVED_PENDING status' };

    const fallbackCode = generateOtp();
    const redis = await getRedisClient();
    const key = KEY_MAP.FALLBACK(ticketId);
    
    await redis.setex(key, 600, JSON.stringify({ otp: fallbackCode, generated_by: actorUser.id }));

    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'FALLBACK_CODE_GENERATED',
        entity_type: 'tickets',
        entity_id: ticketId,
        actor_id: actorUser.id,
        notes: `Fallback code generated by ${actorUser.name}`
    });

    return { fallback_code: fallbackCode };
};

const validateFallbackCode = async (actorUser, ticketId, payload) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };
    if (ticket.assigned_engineer_id !== actorUser.id) throw { status: 403, message: 'Not authorized for this ticket' };
    if (ticket.status !== 'ARRIVED_PENDING') throw { status: 409, message: 'Ticket is not in ARRIVED_PENDING status' };

    const redis = await getRedisClient();
    const key = KEY_MAP.FALLBACK(ticketId);
    const dataStr = await redis.get(key);

    if (!dataStr) {
        throw { status: 410, message: 'Fallback code expired or not generated' };
    }

    const { otp, generated_by } = JSON.parse(dataStr);

    if (payload.fallback_code !== otp) {
        throw { status: 401, message: 'Invalid fallback code' };
    }

    await redis.del(key);
    await redis.del(KEY_MAP.FALLBACK_REQ(ticketId));

    await TicketModel.update(ticketId, {
        status: 'IN_PROGRESS',
        started_at: new Date(),
        arrived_at: new Date(),
        arrival_otp_fallback_used: 1,
        arrival_fallback_operator: generated_by
    });

    await TicketStatusHistoryModel.create({
        ticket_id: ticketId,
        from_status: 'ARRIVED_PENDING',
        to_status: 'IN_PROGRESS',
        changed_by: actorUser.id,
        changed_by_role: actorUser.role,
        notes: 'Operator fallback code used'
    });

    const updatedTicket = await TicketModel.findById(ticketId);

    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'FALLBACK_OTP_VALIDATED',
        entity_type: 'tickets',
        entity_id: ticketId,
        actor_id: actorUser.id,
        notes: `Fallback used. Operator: ${generated_by}`,
        new_state: updatedTicket
    });

    return updatedTicket;
};

const sendMerchantSignoffOtp = async (actorUser, ticketId) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };
    if (ticket.assigned_engineer_id !== actorUser.id) throw { status: 403, message: 'Not authorized for this ticket' };
    if (ticket.status !== 'IN_PROGRESS') throw { status: 409, message: 'Ticket is not in IN_PROGRESS status' };
    if (!['MISC_SERV', 'INSTALLATION'].includes(ticket.service_type)) {
        throw { status: 400, message: 'Service type does not require merchant sign-off OTP at this stage' };
    }

    const otp = generateOtp();
    const redis = await getRedisClient();
    const key = KEY_MAP.SIGNOFF(ticketId);

    await redis.setex(key, 600, JSON.stringify({ otp, attempts: 0 }));

    const otp_hash = await bcrypt.hash(otp, 10);
    
    await OtpRecordModel.create({
        purpose: 'MERCHANT_SIGN_OFF',
        recipient: ticket.merchant_mobile,
        otp_hash,
        entity_id: ticket.id,
        expires_at: new Date(Date.now() + 600 * 1000)
    });

    const otpQueue = await getOtpQueue();
    await otpQueue.add('send-otp', {
        to: ticket.merchant_email || ticket.merchant_mobile,
        subject: 'Service Completion Confirmation OTP',
        otp,
        purpose: 'MERCHANT_SIGN_OFF',
        ticket_number: ticket.ticket_number
    });

    console.log(`[OTP] SIGNOFF OTP for ticket ${ticket.ticket_number} : ${otp}`);
    return { message: 'Sign-off OTP sent to merchant' };
};

const validateMerchantSignoffOtp = async (actorUser, ticketId, payload) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };
    if (ticket.assigned_engineer_id !== actorUser.id) throw { status: 403, message: 'Not authorized for this ticket' };
    if (ticket.status !== 'IN_PROGRESS') throw { status: 409, message: 'Ticket is not in IN_PROGRESS status' };
    if (!['MISC_SERV', 'INSTALLATION'].includes(ticket.service_type)) {
        throw { status: 400, message: 'Service type does not require merchant sign-off OTP at this stage' };
    }

    const redis = await getRedisClient();
    const key = KEY_MAP.SIGNOFF(ticketId);
    const dataStr = await redis.get(key);

    if (!dataStr) {
        throw { status: 410, message: 'Sign-off OTP expired' };
    }

    const data = JSON.parse(dataStr);
    const storedOtp = data.otp;
    const attempts = data.attempts;
    const otpRecord = await OtpRecordModel.findLatestPending(ticketId, 'MERCHANT_SIGN_OFF');

    if (attempts >= 3) {
        await redis.del(key);
        if (otpRecord) {
            await OtpRecordModel.updateStatus(otpRecord.id, { status: 'FAILED' });
        }
        throw { status: 429, message: 'Maximum OTP attempts exceeded.' };
    }

    if (payload.otp !== storedOtp) {
        const remainingTTL = await redis.ttl(key);
        await redis.setex(key, remainingTTL > 0 ? remainingTTL : 1, JSON.stringify({ otp: storedOtp, attempts: attempts + 1 }));
        if (otpRecord) {
            await OtpRecordModel.updateStatus(otpRecord.id, { attempts: attempts + 1 });
        }
        throw { status: 401, message: `Invalid OTP. ${3 - (attempts + 1)} attempts remaining.` };
    }

    await redis.del(key);
    if (otpRecord) {
        await OtpRecordModel.updateStatus(otpRecord.id, { status: 'VALIDATED', validated_at: new Date() });
    }

    await TicketModel.update(ticketId, { 
        merchant_signoff_otp_verified: 1, 
        merchant_signoff_at: new Date(), 
        status: 'PENDING_CLOSE' 
    });

    await TicketStatusHistoryModel.create({
        ticket_id: ticketId,
        from_status: 'IN_PROGRESS',
        to_status: 'PENDING_CLOSE',
        changed_by: actorUser.id,
        changed_by_role: actorUser.role,
        notes: 'Merchant sign-off OTP validated'
    });

    const updatedTicket = await TicketModel.findById(ticketId);

    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'MERCHANT_SIGNOFF_OTP_VALIDATED',
        entity_type: 'tickets',
        entity_id: ticketId,
        actor_id: actorUser.id,
        new_state: updatedTicket
    });

    return updatedTicket;
};

module.exports = {
    sendArrivalOtp,
    validateArrivalOtp,
    requestFallbackCode,
    generateFallbackCode,
    validateFallbackCode,
    sendMerchantSignoffOtp,
    validateMerchantSignoffOtp
};
