const TicketModel = require('../models/Ticket.model');
const TicketStatusHistoryModel = require('../models/TicketStatusHistory.model');
const MachineCustodyModel = require('../models/MachineCustody.model');
const MachineModel = require('../models/Machine.model');
const TidMappingModel = require('../models/TidMapping.model');
const TicketOtpService = require('./TicketOtp.service');
const auditEmitter = require('../utils/auditEmitter');

const markEnRoute = async (actorUser, ticketId) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };
    if (ticket.assigned_engineer_id !== actorUser.id) throw { status: 403, message: 'Not authorized for this ticket' };
    if (ticket.status !== 'ASSIGNED') throw { status: 409, message: 'Ticket is not in ASSIGNED status' };

    await TicketModel.update(ticketId, { status: 'EN_ROUTE' });
    await TicketStatusHistoryModel.create({
        ticket_id: ticketId,
        from_status: 'ASSIGNED',
        to_status: 'EN_ROUTE',
        changed_by: actorUser.id,
        changed_by_role: actorUser.role
    });

    const updatedTicket = await TicketModel.findById(ticketId);
    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'TICKET_EN_ROUTE',
        entity_type: 'tickets',
        entity_id: ticketId,
        actor_id: actorUser.id,
        new_state: updatedTicket
    });

    return updatedTicket;
};

const markArrived = async (actorUser, ticketId) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };
    if (ticket.assigned_engineer_id !== actorUser.id) throw { status: 403, message: 'Not authorized for this ticket' };
    if (ticket.status !== 'EN_ROUTE') throw { status: 409, message: 'Ticket is not in EN_ROUTE status' };

    await TicketModel.update(ticketId, { status: 'ARRIVED_PENDING' });
    await TicketStatusHistoryModel.create({
        ticket_id: ticketId,
        from_status: 'EN_ROUTE',
        to_status: 'ARRIVED_PENDING',
        changed_by: actorUser.id,
        changed_by_role: actorUser.role
    });

    const updatedTicket = await TicketModel.findById(ticketId);
    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'TICKET_ARRIVED_PENDING',
        entity_type: 'tickets',
        entity_id: ticketId,
        actor_id: actorUser.id,
        new_state: updatedTicket
    });

    await TicketOtpService.sendArrivalOtp(updatedTicket);

    return { message: 'OTP sent to merchant', ticket: updatedTicket };
};

const markMachinePicked = async (actorUser, ticketId, payload) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };
    if (ticket.assigned_engineer_id !== actorUser.id) throw { status: 403, message: 'Not authorized for this ticket' };
    if (ticket.status !== 'IN_PROGRESS') throw { status: 409, message: 'Ticket is not in IN_PROGRESS status' };
    
    if (!['REPAIR', 'PICKUP', 'REPLACEMENT', 'DEINSTALLATION'].includes(ticket.service_type)) {
        throw { status: 400, message: 'This service type does not require machine pickup' };
    }

    await TicketModel.update(ticketId, { status: 'MACHINE_PICKED', machine_picked_at: new Date() });
    
    if (ticket.machine_id) {
        await MachineCustodyModel.create({
            machine_id: ticket.machine_id,
            transferred_by: actorUser.id,
            from_entity: 'MERCHANT_SITE',
            to_entity: 'IN_TRANSIT_TO_OFFICE',
            photo_url: payload.photo_url,
            ticket_id: ticketId,
            notes: payload.notes
        });

        if (ticket.service_type === 'DEINSTALLATION') {
            await TidMappingModel.unmapTid(ticket.machine_id, { unmapped_by: actorUser.id, ticket_id: ticketId });
        }
    }

    await TicketStatusHistoryModel.create({
        ticket_id: ticketId,
        from_status: 'IN_PROGRESS',
        to_status: 'MACHINE_PICKED',
        changed_by: actorUser.id,
        changed_by_role: actorUser.role
    });

    const updatedTicket = await TicketModel.findById(ticketId);
    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'MACHINE_PICKED',
        entity_type: 'tickets',
        entity_id: ticketId,
        actor_id: actorUser.id,
        new_state: updatedTicket
    });

    return updatedTicket;
};

const markInOffice = async (actorUser, ticketId, payload) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };
    if (['OPERATOR', 'MANAGER'].includes(actorUser.role) && ticket.branch_id !== actorUser.branch_id) {
        throw { status: 403, message: 'Ticket belongs to a different branch' };
    }
    if (ticket.status !== 'MACHINE_PICKED') throw { status: 409, message: 'Ticket is not in MACHINE_PICKED status' };

    await TicketModel.update(ticketId, { status: 'IN_OFFICE', in_office_at: new Date() });
    
    if (ticket.machine_id) {
        await MachineModel.updateStatus(ticket.machine_id, 'IN_OFFICE');
        
        await MachineCustodyModel.create({
            machine_id: ticket.machine_id,
            received_by: actorUser.id,
            from_entity: 'IN_TRANSIT',
            to_entity: 'OFFICE',
            photo_url: payload.photo_url,
            ticket_id: ticketId,
            notes: payload.notes
        });
    }

    await TicketStatusHistoryModel.create({
        ticket_id: ticketId,
        from_status: 'MACHINE_PICKED',
        to_status: 'IN_OFFICE',
        changed_by: actorUser.id,
        changed_by_role: actorUser.role
    });

    const updatedTicket = await TicketModel.findById(ticketId);
    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'MACHINE_IN_OFFICE',
        entity_type: 'tickets',
        entity_id: ticketId,
        actor_id: actorUser.id,
        new_state: updatedTicket
    });

    return updatedTicket;
};

const markUnderRepair = async (actorUser, ticketId) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };
    if (['OPERATOR', 'MANAGER'].includes(actorUser.role) && ticket.branch_id !== actorUser.branch_id) {
        throw { status: 403, message: 'Ticket belongs to a different branch' };
    }
    if (ticket.status !== 'IN_OFFICE') throw { status: 409, message: 'Ticket is not in IN_OFFICE status' };
    if (ticket.service_type !== 'REPAIR') throw { status: 400, message: 'Only REPAIR tickets can be marked as UNDER_REPAIR' };

    if (ticket.machine_id) {
        await MachineModel.updateStatus(ticket.machine_id, 'UNDER_REPAIR');
    }
    await TicketModel.update(ticketId, { status: 'UNDER_REPAIR' });

    await TicketStatusHistoryModel.create({
        ticket_id: ticketId,
        from_status: 'IN_OFFICE',
        to_status: 'UNDER_REPAIR',
        changed_by: actorUser.id,
        changed_by_role: actorUser.role
    });

    const updatedTicket = await TicketModel.findById(ticketId);
    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'TICKET_UNDER_REPAIR',
        entity_type: 'tickets',
        entity_id: ticketId,
        actor_id: actorUser.id,
        new_state: updatedTicket
    });

    return updatedTicket;
};

const markReadyDeploy = async (actorUser, ticketId) => {
    const ticket = await TicketModel.findById(ticketId);
    if (!ticket) throw { status: 404, message: 'Ticket not found' };
    if (['OPERATOR', 'MANAGER'].includes(actorUser.role) && ticket.branch_id !== actorUser.branch_id) {
        throw { status: 403, message: 'Ticket belongs to a different branch' };
    }
    if (!['UNDER_REPAIR', 'IN_OFFICE'].includes(ticket.status)) {
        throw { status: 409, message: 'Ticket is not in UNDER_REPAIR or IN_OFFICE status' };
    }

    if (ticket.machine_id) {
        await MachineModel.updateStatus(ticket.machine_id, 'AVAILABLE');
    }
    await TicketModel.update(ticketId, { status: 'READY_DEPLOY' });

    await TicketStatusHistoryModel.create({
        ticket_id: ticketId,
        from_status: ticket.status,
        to_status: 'READY_DEPLOY',
        changed_by: actorUser.id,
        changed_by_role: actorUser.role
    });

    const updatedTicket = await TicketModel.findById(ticketId);
    auditEmitter.emit('audit', {
        module: 'TICKET',
        action_code: 'TICKET_READY_DEPLOY',
        entity_type: 'tickets',
        entity_id: ticketId,
        actor_id: actorUser.id,
        new_state: updatedTicket
    });

    return updatedTicket;
};

module.exports = {
    markEnRoute,
    markArrived,
    markMachinePicked,
    markInOffice,
    markUnderRepair,
    markReadyDeploy
};
