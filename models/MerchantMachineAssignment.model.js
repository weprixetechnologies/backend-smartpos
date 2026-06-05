const db = require('../utils/db');

const MerchantMachineAssignment = {
    async create({ merchant_id, machine_id, assigned_by, notes }) {
        const query = `
            INSERT INTO merchant_machine_assignments (merchant_id, machine_id, assigned_by, notes)
            VALUES (?, ?, ?, ?)
        `;
        await db.query(query, [merchant_id, machine_id, assigned_by || null, notes || null]);
        return this.findActiveByMachine(machine_id);
    },

    async findActiveByMachine(machine_id) {
        const query = `
            SELECT mma.*, m.full_name AS merchant_name, m.merchant_code
            FROM merchant_machine_assignments mma
            JOIN merchants m ON m.id = mma.merchant_id
            WHERE mma.machine_id = ? AND mma.unassigned_at IS NULL
            LIMIT 1
        `;
        const [rows] = await db.query(query, [machine_id]);
        return rows[0] || null;
    },

    async findActiveByMerchant(merchant_id) {
        const query = `
            SELECT mma.*, mc.serial_number, mc.tid, mc.model, mc.brand, mc.status AS machine_status
            FROM merchant_machine_assignments mma
            JOIN machines mc ON mc.id = mma.machine_id
            WHERE mma.merchant_id = ? AND mma.unassigned_at IS NULL
            ORDER BY mma.assigned_at DESC
        `;
        const [rows] = await db.query(query, [merchant_id]);
        return rows;
    },

    async findHistoryByMerchant(merchant_id) {
        const query = `
            SELECT mma.*, mc.serial_number, mc.tid, mc.model
            FROM merchant_machine_assignments mma
            JOIN machines mc ON mc.id = mma.machine_id
            WHERE mma.merchant_id = ?
            ORDER BY mma.assigned_at DESC
        `;
        const [rows] = await db.query(query, [merchant_id]);
        return rows;
    },

    async checkActiveMachineAssignment(machine_id) {
        const query = `
            SELECT COUNT(*) AS count
            FROM merchant_machine_assignments
            WHERE machine_id = ? AND unassigned_at IS NULL
        `;
        const [rows] = await db.query(query, [machine_id]);
        return rows[0].count;
    },

    async unassign(machine_id, { unassigned_by }) {
        const query = `
            UPDATE merchant_machine_assignments
            SET unassigned_at = NOW(), unassigned_by = ?
            WHERE machine_id = ? AND unassigned_at IS NULL
        `;
        await db.query(query, [unassigned_by || null, machine_id]);
    }
};

module.exports = MerchantMachineAssignment;
