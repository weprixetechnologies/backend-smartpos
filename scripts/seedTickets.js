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
        const [engineers] = await db.query('SELECT id, full_name, role FROM employees WHERE role = "ENGINEER" LIMIT 5');
        const [creators] = await db.query('SELECT id, full_name, role FROM employees WHERE role IN ("MANAGER", "SUPERADMIN", "OPERATOR") LIMIT 1');

        const creatorId = creators.length > 0 ? creators[0].id : null;
        let creatorRole = creators.length > 0 ? creators[0].role : null;
        if (creatorRole === 'SUPERADMIN') creatorRole = 'SUPERADMIN';

        const merchantNames = ['Cafe Coffee Day', 'Star Supermarket', 'Fashion Hub', 'Tech Haven', 'Bakers Point', 'Fresh Mart', 'Auto Parts Hub', 'Pizza Palace', 'City Bookstore', 'Daily Needs Groceries', 'Fitness First Gym', 'Green Pharmacy'];
        const machineModels = ['Verifone VX520', 'Ingenico Move 2500', 'Pax A920', 'Verifone e355', 'Ingenico iWL250', 'Pax S920'];
        const serviceTypes = ['INSTALLATION', 'REPAIR', 'REPLACEMENT', 'DE_INSTALLATION', 'PREVENTIVE_MAINTENANCE', 'PAPER_ROLL_DELIVERY', 'TRAINING', 'MISC_SERV', 'PICKUP'];
        const priorities = ['URGENT', 'CRITICAL', 'NORMAL'];
        const statuses = ['NEW', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED_PENDING', 'IN_PROGRESS', 'PENDING_CLOSE', 'CLOSED', 'CANCELLED'];

        const getRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
        const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
        
        const dummyData = [];
        
        // Generate 35 dynamic tickets
        for (let i = 0; i < 35; i++) {
            const status = getRandomElement(statuses);
            let engineer = null;
            if (status !== 'NEW' && status !== 'CANCELLED') {
                engineer = engineers.length > 0 ? getRandomElement(engineers) : null;
            }

            dummyData.push({
                merchant_name: getRandomElement(merchantNames) + ' ' + getRandomInt(1, 100),
                merchant_mobile: '98' + getRandomInt(10000000, 99999999).toString(),
                merchant_address: `${getRandomInt(1, 999)} Random Street, City Area`,
                merchant_pincode: '5600' + getRandomInt(10, 99).toString(),
                machine_serial_number: 'SN-' + getRandomInt(100000, 999999).toString(),
                machine_model: getRandomElement(machineModels),
                service_type: getRandomElement(serviceTypes),
                priority: getRandomElement(priorities),
                status: status,
                complaint_description: `Automatically generated complaint for ${status} status.`,
                sla_hours: getRandomElement([4, 24, 48, 72]),
                engineer: engineer
            });
        }

        // We will process them sequentially to correctly increment the ticket_number
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
            if (data.status !== 'NEW' && data.status !== 'CANCELLED' && data.engineer) {
                await db.query(
                    `INSERT INTO ticket_status_history (id, ticket_id, from_status, to_status, changed_by, changed_by_role, notes, occurred_at)
                     VALUES (UUID(), ?, 'NEW', 'ASSIGNED', ?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
                    [ticketId, creatorId, creatorRole, `Assigned to ${data.engineer.full_name}`]
                );
            }

            if (['EN_ROUTE', 'ARRIVED_PENDING', 'IN_PROGRESS', 'PENDING_CLOSE', 'CLOSED'].includes(data.status)) {
                await db.query(
                    `INSERT INTO ticket_status_history (id, ticket_id, from_status, to_status, changed_by, changed_by_role, notes, occurred_at)
                     VALUES (UUID(), ?, 'ASSIGNED', 'EN_ROUTE', ?, 'ENGINEER', 'Engineer marked en-route', DATE_ADD(NOW(), INTERVAL 20 MINUTE))`,
                    [ticketId, assignedEngineerId]
                );
            }
            
            if (['ARRIVED_PENDING', 'IN_PROGRESS', 'PENDING_CLOSE', 'CLOSED'].includes(data.status)) {
                await db.query(
                    `INSERT INTO ticket_status_history (id, ticket_id, from_status, to_status, changed_by, changed_by_role, notes, occurred_at)
                     VALUES (UUID(), ?, 'EN_ROUTE', 'ARRIVED_PENDING', ?, 'ENGINEER', 'Engineer arrived at location', DATE_ADD(NOW(), INTERVAL 45 MINUTE))`,
                    [ticketId, assignedEngineerId]
                );
            }

            if (['IN_PROGRESS', 'PENDING_CLOSE', 'CLOSED'].includes(data.status)) {
                await db.query(
                    `INSERT INTO ticket_status_history (id, ticket_id, from_status, to_status, changed_by, changed_by_role, notes, occurred_at)
                     VALUES (UUID(), ?, 'ARRIVED_PENDING', 'IN_PROGRESS', ?, 'ENGINEER', 'OTP validated, work started', DATE_ADD(NOW(), INTERVAL 50 MINUTE))`,
                    [ticketId, assignedEngineerId]
                );
            }

            if (['PENDING_CLOSE', 'CLOSED'].includes(data.status)) {
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
            
            if (data.status === 'CANCELLED') {
                await db.query(
                    `INSERT INTO ticket_status_history (id, ticket_id, from_status, to_status, changed_by, changed_by_role, notes, occurred_at)
                     VALUES (UUID(), ?, 'NEW', 'CANCELLED', ?, ?, 'Ticket cancelled', DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
                    [ticketId, creatorId, creatorRole]
                );
            }

            console.log(`Created ticket: ${ticketNumber} (${data.status})`);
        }

        console.log(`Seeding completed successfully! ${dummyData.length} tickets created.`);
    } catch (error) {
        console.error('Error seeding tickets:', error);
    } finally {
        process.exit();
    }
}

seed();
