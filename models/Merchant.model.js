const db = require('../utils/db');

const Merchant = {
    async create({ full_name, business_name, mobile, pincode, address, branch_id, email, registered_by }) {
        const query = `
            INSERT INTO merchants (full_name, business_name, mobile, pincode, address, branch_id, email, registered_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [full_name, business_name || null, mobile, pincode, address, branch_id, email || null, registered_by || null];
        
        const [result] = await db.query(query, values);
        return this.findByMobile(mobile); // ID and code are auto-generated
    },

    async findById(id) {
        const query = `SELECT * FROM merchants WHERE id = ? LIMIT 1`;
        const [rows] = await db.query(query, [id]);
        return rows[0];
    },

    async findByMobile(mobile) {
        const query = `SELECT * FROM merchants WHERE mobile = ? LIMIT 1`;
        const [rows] = await db.query(query, [mobile]);
        return rows[0];
    },

    async findAll({ branch_id, status = 'ACTIVE', pincode, search, page = 1, limit = 20 }) {
        const offset = (page - 1) * limit;
        const conditions = [];
        const params = [];

        if (branch_id) {
            conditions.push('branch_id = ?');
            params.push(branch_id);
        }
        if (status) {
            conditions.push('status = ?');
            params.push(status);
        }
        if (pincode) {
            conditions.push('pincode = ?');
            params.push(pincode);
        }
        if (search) {
            conditions.push('(full_name LIKE ? OR business_name LIKE ? OR mobile LIKE ?)');
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        const dataQuery = `
            SELECT * FROM merchants 
            ${whereClause} 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        `;
        const countQuery = `
            SELECT COUNT(*) AS total FROM merchants 
            ${whereClause}
        `;

        const [rows] = await db.query(dataQuery, [...params, Number(limit), Number(offset)]);
        const [countRows] = await db.query(countQuery, params);

        return {
            merchants: rows,
            total: countRows[0].total,
            page: Number(page),
            limit: Number(limit)
        };
    },

    async update(id, fields) {
        // Allowed fields
        const allowedFields = ['full_name', 'business_name', 'mobile', 'pincode', 'address', 'email'];
        const updates = [];
        const params = [];

        for (const key of Object.keys(fields)) {
            if (allowedFields.includes(key)) {
                updates.push(`${key} = ?`);
                params.push(fields[key]);
            }
        }

        if (updates.length === 0) return this.findById(id);

        params.push(id);
        const query = `UPDATE merchants SET ${updates.join(', ')} WHERE id = ?`;
        await db.query(query, params);
        
        return this.findById(id);
    },

    async setStatus(id, status) {
        const query = `UPDATE merchants SET status = ? WHERE id = ?`;
        await db.query(query, [status, id]);
        return this.findById(id);
    },

    async findByPincode(pincode, branch_id) {
        const query = `
            SELECT * FROM merchants 
            WHERE pincode = ? AND branch_id = ? AND status = 'ACTIVE' 
            ORDER BY full_name ASC
        `;
        const [rows] = await db.query(query, [pincode, branch_id]);
        return rows;
    }
};

module.exports = Merchant;
