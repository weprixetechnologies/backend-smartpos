require('dotenv').config({ path: __dirname + '/../.env' });
const crypto = require('crypto');
const db = require('../utils/db');

async function generateTicketNumber() {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const prefix = `TKT-${dateStr}`;

    const [rows] = await db.query(
        `SELECT ticket_number FROM tickets WHERE ticket_number LIKE ? ORDER BY ticket_number DESC LIMIT 1`,
        [`${prefix}-%`]
    );

    let nextSequence = 1;
    if (rows.length > 0) {
        const lastSequence = parseInt(rows[0].ticket_number.split('-')[2]);
        nextSequence = lastSequence + 1;
    }

    return `${prefix}-${nextSequence.toString().padStart(4, '0')}`;
}

async function seed() {
    try {
        console.log('Seeding dummy tickets...');

        // 1. Get a branch
        const [branches] = await db.query('SELECT id FROM branches LIMIT 1');
        if (branches.length === 0) {
            console.error('No branches found. Please seed branches first.');
            process.exit(1);
        }
        const branchId = branches[0].id;

        // 2. Get some engineers and a manager/operator
        const [engineers] = await db.query('SELECT id, full_name, role FROM employees WHERE role = "ENGINEER" LIMIT 3');
        const [creators] = await db.query('SELECT id, full_name, role FROM employees WHERE role IN ("MANAGER", "SUPERADMIN", "OPERATOR") LIMIT 1');

        const creatorId = creators.length > 0 ? creators[0].id : null;
        let creatorRole = creators.length > 0 ? creators[0].role : null;
        if (creatorRole === 'SUPERADMIN') creatorRole = 'SUPERADMIN';

        const dummyData = [
            {
                merchant_name: 'Cafe Coffee Day',
                merchant_mobile: '9876543210',
                merchant_address: '123 MG Road, Bangalore',
                merchant_pincode: '560001',
                machine_serial_number: 'SN-1200304',
                machine_model: 'Verifone VX520',
                service_type: 'INSTALLATION',
                priority: 'NORMAL',
                status: 'NEW',
                complaint_description: 'New installation required for CCD MG Road outlet.',
                sla_hours: 48
            },
            {
                merchant_name: 'Star Supermarket',
                merchant_mobile: '9876543211',
                merchant_address: '45 Koramangala, Bangalore',
                merchant_pincode: '560034',
                machine_serial_number: 'SN-9988221',
                machine_model: 'Ingenico Move 2500',
                service_type: 'REPAIR',
                priority: 'CRITICAL',
                status: 'ASSIGNED',
                complaint_description: 'Machine is not turning on. Completely dead. Urgent repair needed.',
                sla_hours: 4,
                engineer: engineers.length > 0 ? engineers[0] : null
            },
            {
                merchant_name: 'Fashion Hub',
                merchant_mobile: '9876543212',
                merchant_address: 'Commercial Street, Bangalore',
                merchant_pincode: '560001',
                machine_serial_number: 'SN-334455',
                machine_model: 'Pax A920',
                service_type: 'MISC_SERV',
                priority: 'NORMAL',
                status: 'IN_PROGRESS',
                complaint_description: 'Routine maintenance and paper roll delivery.',
                sla_hours: 72,
                engineer: engineers.length > 1 ? engineers[1] : (engineers[0] || null)
            },
            {
                merchant_name: 'Tech Haven',
                merchant_mobile: '9876543213',
                merchant_address: 'Indiranagar, Bangalore',
                merchant_pincode: '560038',
                machine_serial_number: 'SN-112233',
                machine_model: 'Verifone VX520',
                service_type: 'PICKUP',
                priority: 'NORMAL',
                status: 'PENDING_CLOSE',
                complaint_description: 'Merchant closed business, retrieving the POS terminal.',
                sla_hours: 48,
                engineer: engineers.length > 0 ? engineers[0] : null
            },
            {
                merchant_name: 'Bakers Point',
                merchant_mobile: '9876543214',
                merchant_address: 'Jayanagar, Bangalore',
                merchant_pincode: '560041',
                machine_serial_number: 'SN-667788',
                machine_model: 'Ingenico Move 2500',
                service_type: 'REPAIR',
                priority: 'URGENT',
                status: 'CLOSED',
                complaint_description: 'Network connection issue, SIM card replacement required.',
                sla_hours: 24,
                engineer: engineers.length > 1 ? engineers[1] : (engineers[0] || null)
            }
        ];

        for (const data of dummyData) {
            const ticketId = crypto.randomUUID();
            const ticketNumber = await generateTicketNumber();
            const now = new Date();
            const slaDueAt = new Date(now.getTime() + data.sla_hours * 60 * 60 * 1000);

            let assignedEngineerId = null;
            if (data.engineer) {
                assignedEngineerId = data.engineer.id;
            }

            // Insert Ticket
            await db.query(
                `INSERT INTO tickets (
                    id, ticket_number, merchant_name, merchant_mobile, merchant_address, merchant_pincode,
                    branch_id, serial_number, machine_model, service_type, priority, status,
                    complaint_description, assigned_engineer_id, sla_due_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                [
                    ticketId, ticketNumber, data.merchant_name, data.merchant_mobile, data.merchant_address, data.merchant_pincode,
                    branchId, data.machine_serial_number, data.machine_model, data.service_type, data.priority, data.status,
                    data.complaint_description, assignedEngineerId, slaDueAt
                ]
            );

            // Insert initial status history (NEW)
            await db.query(
                `INSERT INTO ticket_status_history (id, ticket_id, from_status, to_status, changed_by, changed_by_role, notes, occurred_at)
                 VALUES (UUID(), ?, NULL, 'NEW', ?, ?, 'Ticket created', NOW())`,
                [ticketId, creatorId, creatorRole]
            );

            // If it has progressed past NEW, insert more history to make it look realistic
            if (data.status !== 'NEW' && data.engineer) {
                await db.query(
                    `INSERT INTO ticket_status_history (id, ticket_id, from_status, to_status, changed_by, changed_by_role, notes, occurred_at)
                     VALUES (UUID(), ?, 'NEW', 'ASSIGNED', ?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
                    [ticketId, creatorId, creatorRole, `Assigned to ${data.engineer.full_name}`]
                );
            }

            if (data.status === 'IN_PROGRESS' || data.status === 'PENDING_CLOSE' || data.status === 'CLOSED') {
                await db.query(
                    `INSERT INTO ticket_status_history (id, ticket_id, from_status, to_status, changed_by, changed_by_role, notes, occurred_at)
                     VALUES (UUID(), ?, 'ASSIGNED', 'EN_ROUTE', ?, 'ENGINEER', 'Engineer marked en-route', DATE_ADD(NOW(), INTERVAL 20 MINUTE))`,
                    [ticketId, assignedEngineerId]
                );
                await db.query(
                    `INSERT INTO ticket_status_history (id, ticket_id, from_status, to_status, changed_by, changed_by_role, notes, occurred_at)
                     VALUES (UUID(), ?, 'EN_ROUTE', 'ARRIVED_PENDING', ?, 'ENGINEER', 'Engineer arrived at location', DATE_ADD(NOW(), INTERVAL 45 MINUTE))`,
                    [ticketId, assignedEngineerId]
                );
                await db.query(
                    `INSERT INTO ticket_status_history (id, ticket_id, from_status, to_status, changed_by, changed_by_role, notes, occurred_at)
                     VALUES (UUID(), ?, 'ARRIVED_PENDING', 'IN_PROGRESS', ?, 'ENGINEER', 'OTP validated, work started', DATE_ADD(NOW(), INTERVAL 50 MINUTE))`,
                    [ticketId, assignedEngineerId]
                );
            }

            if (data.status === 'PENDING_CLOSE' || data.status === 'CLOSED') {
                // Add job sheet
                await db.query(
                    `INSERT INTO job_sheets (id, ticket_id, engineer_id, work_done, time_on_site_minutes, merchant_signoff_name, created_at)
                      VALUES (UUID(), ?, ?, 'Resolved the issue as per requirements.', 45, 'Store Manager', DATE_ADD(NOW(), INTERVAL 95 MINUTE))`,
                    [ticketId, assignedEngineerId]
                );

                await db.query(
                    `INSERT INTO ticket_status_history (id, ticket_id, from_status, to_status, changed_by, changed_by_role, notes, occurred_at)
                      VALUES (UUID(), ?, 'IN_PROGRESS', 'PENDING_CLOSE', ?, 'ENGINEER', 'Job completed, awaiting final closure', DATE_ADD(NOW(), INTERVAL 100 MINUTE))`,
                    [ticketId, assignedEngineerId]
                );
            }

            if (data.status === 'CLOSED') {
                await db.query(
                    `INSERT INTO ticket_status_history (id, ticket_id, from_status, to_status, changed_by, changed_by_role, notes, occurred_at)
                     VALUES (UUID(), ?, 'PENDING_CLOSE', 'CLOSED', ?, ?, 'Ticket successfully closed', DATE_ADD(NOW(), INTERVAL 120 MINUTE))`,
                    [ticketId, creatorId, creatorRole]
                );
            }

            console.log(`Created ticket: ${ticketNumber} (${data.status})`);
        }

        console.log('Seeding completed successfully!');
    } catch (error) {
        console.error('Error seeding tickets:', error);
    } finally {
        process.exit();
    }
}

seed();
