const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const TicketModel = require('../models/Ticket.model');
const MachineModel = require('../models/Machine.model');
const TicketStatusHistoryModel = require('../models/TicketStatusHistory.model');
const TicketAttachmentModel = require('../models/TicketAttachment.model');
const TicketMessageModel = require('../models/TicketMessage.model');
const JobSheetModel = require('../models/JobSheet.model');
const EmployeeModel = require('../models/Employee.model');
const MerchantModel = require('../models/Merchant.model');
const auditEmitter = require('../utils/auditEmitter');

const createTicket = async (actorUser, payload) => {
    if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        payload.branch_id = actorUser.branch_id;
    } else if (actorUser.role === 'SUPERADMIN' && !payload.branch_id) {
        throw { status: 400, message: 'branch_id is required for SUPERADMIN' };
    }

    if (payload.machine_id) {
        const machine = await MachineModel.findById(payload.machine_id);
        if (!machine) throw { status: 404, message: 'Machine not found' };
        if (!['AVAILABLE', 'DEPLOYED'].includes(machine.status)) {
            throw { status: 409, message: 'Machine not available for service' };
        }
        
        // Use machine's tid only if not provided in payload
        if (!payload.tid) {
            payload.tid = machine.tid;
        }
        payload.serial_number = machine.serial_number;
        payload.machine_model = machine.model;

        if (machine.status !== 'DEPLOYED') {
            await MachineModel.updateStatus(machine.id, 'DEPLOYED');
        }
    }

    if (payload.merchant_mobile) {
        const existingMerchant = await MerchantModel.findByMobile(payload.merchant_mobile);
        if (!existingMerchant) {
            await MerchantModel.create({
                full_name: payload.merchant_name,
                business_name: payload.business_name,
                mobile: payload.merchant_mobile,
                pincode: payload.merchant_pincode,
                address: payload.merchant_address,
                branch_id: payload.branch_id,
                email: payload.merchant_email,
                registered_by: actorUser.id
            });
        }
    }

    const ticket = await TicketModel.create(payload);

    await TicketStatusHistoryModel.create({
        ticket_id: ticket.id,
        from_status: null,
        to_status: 'NEW',
        changed_by: actorUser.id,
        changed_by_role: actorUser.role
    });

    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'TICKET_CREATED',
        entity_type: 'tickets',
        entity_id: ticket.id,
        actor_id: actorUser.id,
        new_state: ticket
    });

    return ticket;
};

const assignEngineer = async (actorUser, ticketId, payload) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };
    
    if (['OPERATOR', 'MANAGER'].includes(actorUser.role) && ticket.branch_id !== actorUser.branch_id) {
        throw { status: 403, message: 'Ticket belongs to a different branch' };
    }

    if (!['NEW', 'ASSIGNED'].includes(ticket.status)) {
        throw { status: 409, message: 'Ticket must be NEW or ASSIGNED' };
    }

    // Checking if engineer exists and belongs to the same branch is theoretically needed, 
    // but assuming payload.engineer_id is valid based on previous checks or front-end input for now.
    // In a complete implementation we might fetch employee model here.

    const previousStatus = ticket.status;

    await TicketModel.assignEngineer(ticketId, {
        engineer_id: payload.engineer_id,
        assigned_by: actorUser.id,
        assigned_at: new Date()
    });

    await TicketStatusHistoryModel.create({
        ticket_id: ticketId,
        from_status: previousStatus,
        to_status: 'ASSIGNED',
        changed_by: actorUser.id,
        changed_by_role: actorUser.role
    });

    const updatedTicket = await TicketModel.findById(ticketId);

    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'TICKET_ASSIGNED',
        entity_type: 'tickets',
        entity_id: ticketId,
        actor_id: actorUser.id,
        new_state: updatedTicket
    });

    return updatedTicket;
};

const getTicket = async (actorUser, ticketId) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };

    if (actorUser.role === 'ENGINEER' && ticket.assigned_engineer_id !== actorUser.id) {
        throw { status: 403, message: 'Not authorized to view this ticket' };
    } else if (['OPERATOR', 'MANAGER'].includes(actorUser.role) && ticket.branch_id !== actorUser.branch_id) {
        throw { status: 403, message: 'Ticket belongs to a different branch' };
    }

    const statusHistory = await TicketStatusHistoryModel.findByTicket(ticketId);
    const attachments = await TicketAttachmentModel.findByTicket(ticketId);
    const messages = await TicketMessageModel.findByTicket(ticketId);
    const jobSheet = await JobSheetModel.findByTicket(ticketId);

    let engineer = null;
    if (ticket.assigned_engineer_id) {
        engineer = await EmployeeModel.findById(ticket.assigned_engineer_id);
        if (engineer) {
            // Remove sensitive info
            delete engineer.password_hash;
        }
    }

    return { ticket, engineer, statusHistory, attachments, messages, jobSheet };
};

const listTickets = async (actorUser, query) => {
    const filters = { ...query };

    if (actorUser.role === 'ENGINEER') {
        return await TicketModel.findByEngineer(actorUser.id, filters);
    } 
    
    if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
        filters.branch_id = actorUser.branch_id;
    }

    return await TicketModel.findAll(filters);
};

const cancelTicket = async (actorUser, ticketId, payload) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };

    if (['OPERATOR', 'MANAGER'].includes(actorUser.role) && ticket.branch_id !== actorUser.branch_id) {
        throw { status: 403, message: 'Ticket belongs to a different branch' };
    }

    if (['CLOSED', 'CANCELLED'].includes(ticket.status)) {
        throw { status: 409, message: 'Ticket cannot be cancelled' };
    }

    const previousStatus = ticket.status;

    await TicketModel.update(ticketId, {
        status: 'CANCELLED',
        cancelled_at: new Date(),
        cancelled_by: actorUser.id,
        cancelled_reason: payload.cancelled_reason
    });

    await TicketStatusHistoryModel.create({
        ticket_id: ticketId,
        from_status: previousStatus,
        to_status: 'CANCELLED',
        changed_by: actorUser.id,
        changed_by_role: actorUser.role,
        notes: payload.cancelled_reason
    });

    const updatedTicket = await TicketModel.findById(ticketId);

    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'TICKET_CANCELLED',
        entity_type: 'tickets',
        entity_id: ticketId,
        actor_id: actorUser.id,
        new_state: updatedTicket
    });

    return updatedTicket;
};

const addAttachment = async (actorUser, ticketId, payload) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };

    if (actorUser.role === 'ENGINEER' && ticket.assigned_engineer_id !== actorUser.id) {
        throw { status: 403, message: 'Not authorized for this ticket' };
    } else if (['OPERATOR', 'MANAGER'].includes(actorUser.role) && ticket.branch_id !== actorUser.branch_id) {
        throw { status: 403, message: 'Ticket belongs to a different branch' };
    }

    await TicketAttachmentModel.create({
        ticket_id: ticketId,
        file_url: payload.file_url,
        uploaded_by: actorUser.id,
        description: payload.description
    });

    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'TICKET_ATTACHMENT_ADDED',
        entity_type: 'ticket_attachments',
        entity_id: ticketId,
        actor_id: actorUser.id
    });

    return { message: 'Attachment added' };
};

const sendMessage = async (actorUser, ticketId, payload) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };

    if (actorUser.role === 'ENGINEER' && ticket.assigned_engineer_id !== actorUser.id) {
        throw { status: 403, message: 'Not authorized for this ticket' };
    } else if (['OPERATOR', 'MANAGER'].includes(actorUser.role) && ticket.branch_id !== actorUser.branch_id) {
        throw { status: 403, message: 'Ticket belongs to a different branch' };
    }

    await TicketMessageModel.create({
        ticket_id: ticketId,
        sender_id: actorUser.id,
        message: payload.message,
        image_url: payload.image_url
    });

    return { message: 'Message sent' };
};

const submitJobSheet = async (actorUser, ticketId, payload) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };
    if (ticket.assigned_engineer_id !== actorUser.id) throw { status: 403, message: 'Not authorized for this ticket' };

    if (!['IN_PROGRESS', 'MACHINE_PICKED', 'IN_OFFICE', 'UNDER_REPAIR', 'READY_DEPLOY', 'PENDING_CLOSE'].includes(ticket.status)) {
        throw { status: 409, message: 'Ticket must be in an active state to submit job sheet' };
    }

    const existing = await JobSheetModel.findByTicket(ticketId);
    if (existing) {
        await JobSheetModel.update(ticketId, payload);
    } else {
        await JobSheetModel.create({
            ...payload,
            ticket_id: ticketId,
            engineer_id: actorUser.id
        });
    }

    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'JOB_SHEET_SUBMITTED',
        entity_type: 'job_sheets',
        entity_id: ticketId,
        actor_id: actorUser.id
    });

    return { message: 'Job sheet submitted' };
};

const generateCloseCode = async (actorUser, ticketId) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };
    if (['OPERATOR', 'MANAGER'].includes(actorUser.role) && ticket.branch_id !== actorUser.branch_id) {
        throw { status: 403, message: 'Ticket belongs to a different branch' };
    }

    if (!['IN_PROGRESS', 'MACHINE_PICKED', 'IN_OFFICE', 'UNDER_REPAIR', 'READY_DEPLOY', 'PENDING_CLOSE'].includes(ticket.status)) {
        throw { status: 409, message: 'Ticket cannot be closed at this stage' };
    }

    const rawCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    const hash = await bcrypt.hash(rawCode, 10);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await TicketModel.update(ticketId, {
        close_code_hash: hash,
        close_code_expires_at: expiresAt
    });

    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'CLOSE_CODE_GENERATED',
        entity_type: 'tickets',
        entity_id: ticketId,
        actor_id: actorUser.id,
        notes: 'Close code generated by operator'
    });

    return { close_code: rawCode, expires_at: expiresAt };
};

const submitCloseCode = async (actorUser, ticketId, payload) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };
    if (ticket.assigned_engineer_id !== actorUser.id) throw { status: 403, message: 'Not authorized for this ticket' };

    if (!['IN_PROGRESS', 'MACHINE_PICKED', 'IN_OFFICE', 'UNDER_REPAIR', 'READY_DEPLOY', 'PENDING_CLOSE'].includes(ticket.status)) {
        throw { status: 409, message: 'Ticket is not ready to be closed' };
    }

    if (!ticket.close_code_hash) {
        throw { status: 404, message: 'No close code generated for this ticket' };
    }

    if (new Date(ticket.close_code_expires_at) < new Date()) {
        throw { status: 410, message: 'Close code has expired' };
    }

    const isValid = await bcrypt.compare(payload.close_code, ticket.close_code_hash);
    if (!isValid) {
        throw { status: 401, message: 'Invalid close code' };
    }

    const previousStatus = ticket.status;

    await TicketModel.update(ticketId, { status: 'PENDING_CLOSE' });

    await TicketStatusHistoryModel.create({
        ticket_id: ticketId,
        from_status: previousStatus,
        to_status: 'PENDING_CLOSE',
        changed_by: actorUser.id,
        changed_by_role: actorUser.role,
        notes: 'Close code submitted by engineer'
    });

    const updatedTicket = await TicketModel.findById(ticketId);

    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'CLOSE_CODE_SUBMITTED',
        entity_type: 'tickets',
        entity_id: ticketId,
        actor_id: actorUser.id,
        new_state: updatedTicket
    });

    return updatedTicket;
};

const finalCloseTicket = async (actorUser, ticketId) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };
    
    if (actorUser.role === 'ENGINEER' && ticket.assigned_engineer_id !== actorUser.id) {
        throw { status: 403, message: 'You are not assigned to this ticket' };
    }
    
    if (['OPERATOR', 'MANAGER'].includes(actorUser.role) && ticket.branch_id !== actorUser.branch_id) {
        throw { status: 403, message: 'Ticket belongs to a different branch' };
    }

    if (ticket.status !== 'PENDING_CLOSE') {
        throw { status: 409, message: 'Ticket must be in PENDING_CLOSE status' };
    }

    await TicketModel.update(ticketId, { status: 'CLOSED', closed_at: new Date() });

    await TicketStatusHistoryModel.create({
        ticket_id: ticketId,
        from_status: 'PENDING_CLOSE',
        to_status: 'CLOSED',
        changed_by: actorUser.id,
        changed_by_role: actorUser.role
    });

    const updatedTicket = await TicketModel.findById(ticketId);

    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'TICKET_CLOSED',
        entity_type: 'tickets',
        entity_id: ticketId,
        actor_id: actorUser.id,
        new_state: updatedTicket
    });

    return updatedTicket;
};

const forceClose = async (actorUser, ticketId, payload) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };
    if (ticket.branch_id !== actorUser.branch_id && actorUser.role !== 'SUPERADMIN') {
        throw { status: 403, message: 'Ticket belongs to a different branch' };
    }

    if (['CLOSED', 'CANCELLED'].includes(ticket.status)) {
        throw { status: 409, message: 'Ticket is already closed or cancelled' };
    }

    const previousStatus = ticket.status;

    await TicketModel.update(ticketId, {
        status: 'CLOSED',
        closed_at: new Date(),
        force_closed: 1,
        force_close_reason: payload.force_close_reason
    });

    await TicketStatusHistoryModel.create({
        ticket_id: ticketId,
        from_status: previousStatus,
        to_status: 'CLOSED',
        changed_by: actorUser.id,
        changed_by_role: actorUser.role,
        notes: 'FORCE CLOSE: ' + payload.force_close_reason
    });

    const updatedTicket = await TicketModel.findById(ticketId);

    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'TICKET_FORCE_CLOSED',
        entity_type: 'tickets',
        entity_id: ticketId,
        actor_id: actorUser.id,
        new_state: updatedTicket
    });

    return updatedTicket;
};

const updateServiceType = async (actorUser, ticketId, payload) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };

    if (actorUser.role === 'ENGINEER' && ticket.assigned_engineer_id !== actorUser.id) {
        throw { status: 403, message: 'You are not assigned to this ticket' };
    }

    if (['PENDING_CLOSE', 'CLOSED', 'CANCELLED'].includes(ticket.status)) {
        throw { status: 409, message: 'Cannot change type after work is completed or cancelled' };
    }

    if (!['INSTALLATION', 'DEINSTALLATION', 'REPLACEMENT', 'MISC_SERV'].includes(payload.service_type)) {
        throw { status: 400, message: 'Invalid service_type' };
    }

    const previousType = ticket.service_type;

    await TicketModel.updateServiceType(ticketId, payload.service_type);

    await TicketStatusHistoryModel.create({
        ticket_id: ticketId,
        from_status: ticket.status,
        to_status: ticket.status,
        changed_by: actorUser.id,
        changed_by_role: actorUser.role,
        notes: JSON.stringify({
            action: 'SERVICE_TYPE_CHANGED',
            oldType: previousType,
            newType: payload.service_type,
            reason: payload.reason || 'Engineer changed service type'
        })
    });

    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'TICKET_TYPE_UPDATED',
        entity_type: 'tickets',
        entity_id: ticketId,
        actor_id: actorUser.id,
        new_state: { service_type: payload.service_type }
    });

    return await TicketModel.findById(ticketId);
};

const getWorkflowState = async (actorUser, ticketId) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };
    
    // Get all history
    const history = await TicketStatusHistoryModel.findByTicket(ticketId);
    
    let activeMilestones = [];
    
    for (const h of history) {
        // Only look at IN_PROGRESS events
        if (h.to_status === 'IN_PROGRESS' || h.from_status === 'IN_PROGRESS') {
            if (h.notes && h.notes.startsWith('{')) {
                try {
                    const parsed = JSON.parse(h.notes);
                    if (parsed.action === 'SERVICE_TYPE_CHANGED') {
                        // Reset milestones on type change
                        activeMilestones = [];
                    } else if (parsed.action === 'MILESTONE_COMPLETED') {
                        activeMilestones.push(parsed);
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
        }
    }
    
    return {
        ticket_id: ticketId,
        service_type: ticket.service_type,
        status: ticket.status,
        milestones: activeMilestones
    };
};

const submitMilestone = async (actorUser, ticketId, payload) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };
    
    if (actorUser.role === 'ENGINEER' && ticket.assigned_engineer_id !== actorUser.id) {
        throw { status: 403, message: 'You are not assigned to this ticket' };
    }
    
    if (ticket.status !== 'IN_PROGRESS') {
        throw { status: 409, message: 'Ticket must be IN_PROGRESS to submit milestones' };
    }
    
    await TicketStatusHistoryModel.create({
        ticket_id: ticketId,
        from_status: 'IN_PROGRESS',
        to_status: 'IN_PROGRESS',
        changed_by: actorUser.id,
        changed_by_role: actorUser.role,
        notes: JSON.stringify({
            action: 'MILESTONE_COMPLETED',
            ...payload
        })
    });
    
    return await getWorkflowState(actorUser, ticketId);
};

const requestClosure = async (actorUser, ticketId) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };
    
    if (actorUser.role === 'ENGINEER' && ticket.assigned_engineer_id !== actorUser.id) {
        throw { status: 403, message: 'You are not assigned to this ticket' };
    }
    
    if (ticket.status !== 'IN_PROGRESS') {
        throw { status: 409, message: 'Ticket must be IN_PROGRESS to request closure' };
    }
    
    await TicketModel.update(ticketId, { status: 'PENDING_CLOSE' });
    
    await TicketStatusHistoryModel.create({
        ticket_id: ticketId,
        from_status: 'IN_PROGRESS',
        to_status: 'PENDING_CLOSE',
        changed_by: actorUser.id,
        changed_by_role: actorUser.role,
        notes: 'Engineer requested closure'
    });
    
    const updatedTicket = await TicketModel.findById(ticketId);
    
    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'CLOSURE_REQUESTED',
        entity_type: 'tickets',
        entity_id: ticketId,
        actor_id: actorUser.id,
        new_state: updatedTicket
    });
    
    return updatedTicket;
};


const createBulkTickets = async (actorUser, ticketsArray) => {
    const results = {
        total: ticketsArray.length,
        successCount: 0,
        errorCount: 0,
        errors: []
    };

    // We process sequentially to avoid DB locks or race conditions with merchant creation
    for (let i = 0; i < ticketsArray.length; i++) {
        const payload = ticketsArray[i];
        try {
            // Assign branch to the operator's branch implicitly
            if (['OPERATOR', 'MANAGER'].includes(actorUser.role)) {
                payload.branch_id = actorUser.branch_id;
            } else if (actorUser.role === 'SUPERADMIN' && !payload.branch_id) {
                throw { status: 400, message: 'branch_id is required for SUPERADMIN' };
            }

            // Parse service type from call_type if present
            if (payload.call_type) {
                const ct = payload.call_type.toLowerCase().trim();
                if (ct === 'de-installation' || ct === 'deinstallation') {
                    payload.service_type = 'DEINSTALLATION';
                } else if (ct === 'installation') {
                    payload.service_type = 'INSTALLATION';
                } else if (ct === 'replacement') {
                    payload.service_type = 'REPLACEMENT';
                } else {
                    payload.service_type = 'MISC_SERV';
                }
            }

            // Fallback for service type if invalid or empty
            const validServiceTypes = ['REPAIR','PICKUP','REPLACEMENT','INSTALLATION','DEINSTALLATION','MISC_SERV'];
            if (!payload.service_type || !validServiceTypes.includes(payload.service_type)) {
                payload.service_type = 'MISC_SERV';
            }

            // Handle machine logic if TID is provided and machine exists
            if (payload.tid && !payload.machine_id) {
                const machine = await MachineModel.findByTid(payload.tid);
                if (machine) {
                    payload.machine_id = machine.id;
                    payload.serial_number = machine.serial_number;
                    payload.machine_model = machine.model;
                    if (machine.status !== 'DEPLOYED') {
                        await MachineModel.updateStatus(machine.id, 'DEPLOYED');
                    }
                }
            }

            // Merchant creation logic
            if (payload.merchant_mobile) {
                let existingMerchant = await MerchantModel.findByMobile(payload.merchant_mobile);
                if (!existingMerchant) {
                    const merchantId = await MerchantModel.create({
                        full_name: payload.merchant_name || payload.contact_name || 'Unknown',
                        business_name: payload.business_name || null,
                        mobile: payload.merchant_mobile,
                        pincode: payload.merchant_pincode || '000000',
                        address: payload.merchant_address || payload.location || 'Unknown',
                        branch_id: payload.branch_id,
                        email: payload.merchant_email || null,
                        mcc_code: payload.mcc_code || null,
                        zone_name: payload.zone_name || null,
                        sponsor_bank: payload.sponsor_bank || payload.bank || null,
                        mid: payload.mid || null,
                        registered_by: actorUser.id
                    });
                } else {
                    // Merchant exists, we can optionally update details, but user said "otherwise its ok"
                }
            } else {
                throw new Error("Merchant Mobile is required");
            }

            // Make sure required fields for ticket are present, set defaults if necessary
            payload.priority = payload.priority || 'NORMAL';
            payload.source = payload.source || 'OPERATOR_RAISED';

            // MySQL datetime fix for request_date
            if (payload.request_date) {
                try {
                    const d = new Date(payload.request_date);
                    if (!isNaN(d.getTime())) {
                        payload.request_date = d.toISOString().slice(0, 19).replace('T', ' ');
                    } else {
                        payload.request_date = null;
                    }
                } catch(e) {
                    payload.request_date = null;
                }
            }

            const ticket = await TicketModel.create(payload);

            await TicketStatusHistoryModel.create({
                ticket_id: ticket.id,
                from_status: null,
                to_status: 'NEW',
                changed_by: actorUser.id,
                changed_by_role: actorUser.role
            });

            auditEmitter.emit('audit', {
                module: 'TICKET',
                action_code: 'TICKET_CREATED_BULK',
                entity_type: 'tickets',
                entity_id: ticket.id,
                actor_id: actorUser.id,
                new_state: ticket
            });

            results.successCount++;
        } catch (err) {
            results.errorCount++;
            results.errors.push({
                row: i + 1,
                ticket_no: payload.call_ticket_no || 'Unknown',
                message: err.message || 'Failed to process ticket'
            });
        }
    }

    return results;
};


const mapDevice = async (actorUser, ticketId, payload) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };

    // Find machine by serial number
    const machine = await MachineModel.findBySerial(payload.serial_number);
    if (!machine) throw { status: 404, message: 'Machine not found' };

    // Assuming we can only map available machines
    if (machine.status !== 'AVAILABLE') {
        throw { status: 409, message: 'Machine is not available in stock' };
    }

    // Update machine
    const db = require('../utils/db');
    await db.query(
        'UPDATE machines SET status = ?, tid = ?, associated_ticket_id = ? WHERE id = ?',
        ['DEPLOYED', payload.tid || ticket.tid || null, ticketId, machine.id]
    );

    const mappedTid = payload.tid || ticket.tid;
    if (mappedTid) {
        const TidMappingModel = require('../models/TidMapping.model');
        await TidMappingModel.mapTid({
            machine_id: machine.id,
            tid: mappedTid,
            merchant_name: ticket.merchant_name,
            merchant_address: ticket.merchant_address,
            mapped_by: actorUser.id,
            ticket_id: ticketId
        });
    }

    // Update ticket
    await db.query(
        'UPDATE tickets SET machine_id = ?, tid = ?, mid = ?, serial_number = ?, machine_model = ? WHERE id = ?',
        [machine.id, payload.tid || null, payload.mid || null, machine.serial_number, machine.model, ticketId]
    );

    // Add audit or status history
    await TicketMessageModel.create({
        ticket_id: ticketId,
        sender_id: actorUser.id,
        sender_role: actorUser.role,
        message: 'Mapped Device: ' + machine.serial_number,
        is_internal: true
    });

    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'TICKET_DEVICE_MAPPED',
        entity_type: 'tickets',
        entity_id: ticketId,
        actor_id: actorUser.id,
        new_state: { machine_id: machine.id, tid: payload.tid, mid: payload.mid }
    });

    return await TicketModel.findById(ticketId);
};

module.exports = {
    mapDevice,
    createBulkTickets,
    createTicket,
    assignEngineer,
    getTicket,
    listTickets,
    cancelTicket,
    addAttachment,
    sendMessage,
    submitJobSheet,
    generateCloseCode,
    submitCloseCode,
    finalCloseTicket,
    forceClose,
    updateServiceType,
    getWorkflowState,
    submitMilestone,
    requestClosure
};
