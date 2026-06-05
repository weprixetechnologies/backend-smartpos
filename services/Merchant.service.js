const Merchant = require('../models/Merchant.model');
const MerchantMachineAssignment = require('../models/MerchantMachineAssignment.model');
const db = require('../utils/db');
const auditEmitter = require('../utils/auditEmitter');
const { buildEntry } = require('./AuditLogger.service');
const safeMerchant = require('../utils/safeMerchant');

const MerchantService = {
    async registerMerchant(actorUser, payload) {
        const { full_name, business_name, mobile, pincode, address, email } = payload;
        
        let branch_id = actorUser.branch_id;
        if (actorUser.role === 'SUPER_ADMIN' || actorUser.role === 'SUPERADMIN') {
            if (!payload.branch_id) {
                throw Object.assign(new Error('branch_id is required for SUPER_ADMIN'), { statusCode: 400 });
            }
            branch_id = payload.branch_id;
        }

        // Mobile uniqueness
        const mobileCheck = await db.query('SELECT COUNT(*) AS count FROM merchants WHERE mobile = ?', [mobile]);
        if (mobileCheck[0][0].count > 0) {
            throw Object.assign(new Error('Mobile number already registered to a merchant'), { statusCode: 409 });
        }

        // Email uniqueness
        if (email) {
            const emailCheck = await db.query('SELECT COUNT(*) AS count FROM merchants WHERE email = ?', [email]);
            if (emailCheck[0][0].count > 0) {
                throw Object.assign(new Error('Email already registered to a merchant'), { statusCode: 409 });
            }
        }

        // Pincode validation
        if (!/^\d{6}$/.test(pincode)) {
            throw Object.assign(new Error('Pincode must be exactly 6 numeric characters'), { statusCode: 400 });
        }

        const merchant = await Merchant.create({
            full_name,
            business_name,
            mobile,
            pincode,
            address,
            branch_id,
            email,
            registered_by: actorUser.id
        });

        const safe = safeMerchant(merchant);

        auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
            module: 'MERCHANT',
            action_code: 'MERCHANT_REGISTERED',
            entity_type: 'merchants',
            entity_id: merchant.id,
            new_state: safe
        }));

        return safe;
    },

    async getMerchant(actorUser, merchantId) {
        const merchant = await Merchant.findById(merchantId);
        if (!merchant) {
            throw Object.assign(new Error('Merchant not found'), { statusCode: 404 });
        }

        if (actorUser.role === 'ENGINEER') {
            const ticketCheck = await db.query(`
                SELECT COUNT(*) AS count FROM tickets 
                WHERE assigned_engineer_id = ? 
                AND merchant_mobile = ? 
                AND status NOT IN ('CLOSED', 'CANCELLED')
            `, [actorUser.id, merchant.mobile]);

            if (ticketCheck[0][0].count === 0) {
                throw Object.assign(new Error('Access denied: You can only view merchants linked to your active tickets'), { statusCode: 403 });
            }
        } else if (actorUser.role === 'OPERATOR' || actorUser.role === 'MANAGER') {
            if (merchant.branch_id !== actorUser.branch_id) {
                throw Object.assign(new Error('Access denied: Merchant belongs to a different branch'), { statusCode: 403 });
            }
        }

        const active_machines = await MerchantMachineAssignment.findActiveByMerchant(merchantId);

        return {
            merchant: safeMerchant(merchant),
            active_machines
        };
    },

    async listMerchants(actorUser, query) {
        if (actorUser.role === 'ENGINEER') {
            throw Object.assign(new Error('Access denied'), { statusCode: 403 });
        }

        const filters = { ...query };
        if (actorUser.role === 'OPERATOR' || actorUser.role === 'MANAGER') {
            filters.branch_id = actorUser.branch_id;
        }

        const result = await Merchant.findAll(filters);
        result.merchants = result.merchants.map(safeMerchant);
        return result;
    },

    async editMerchant(actorUser, merchantId, payload) {
        const merchant = await Merchant.findById(merchantId);
        if (!merchant) {
            throw Object.assign(new Error('Merchant not found'), { statusCode: 404 });
        }

        if (actorUser.role === 'OPERATOR' || actorUser.role === 'MANAGER') {
            if (merchant.branch_id !== actorUser.branch_id) {
                throw Object.assign(new Error('Access denied: Merchant belongs to a different branch'), { statusCode: 403 });
            }
        }

        const { mobile, email } = payload;

        if (mobile && mobile !== merchant.mobile) {
            const mobileCheck = await db.query('SELECT COUNT(*) AS count FROM merchants WHERE mobile = ? AND id != ?', [mobile, merchantId]);
            if (mobileCheck[0][0].count > 0) {
                throw Object.assign(new Error('Mobile already registered to another merchant'), { statusCode: 409 });
            }
        }

        if (email && email !== merchant.email) {
            const emailCheck = await db.query('SELECT COUNT(*) AS count FROM merchants WHERE email = ? AND id != ?', [email, merchantId]);
            if (emailCheck[0][0].count > 0) {
                throw Object.assign(new Error('Email already registered to another merchant'), { statusCode: 409 });
            }
        }

        const previous_state = safeMerchant(merchant);
        
        // Clean payload to only allowed fields
        const allowedFields = ['full_name', 'business_name', 'mobile', 'pincode', 'address', 'email'];
        const cleanedFields = {};
        for (const key of allowedFields) {
            if (payload[key] !== undefined) {
                cleanedFields[key] = payload[key];
            }
        }

        if (Object.keys(cleanedFields).length === 0) {
            return safeMerchant(merchant);
        }

        const updated = await Merchant.update(merchantId, cleanedFields);
        const new_state = safeMerchant(updated);

        auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
            module: 'MERCHANT',
            action_code: 'MERCHANT_UPDATED',
            entity_type: 'merchants',
            entity_id: merchant.id,
            previous_state,
            new_state
        }));

        return new_state;
    },

    async deactivateMerchant(actorUser, merchantId, payload) {
        const merchant = await Merchant.findById(merchantId);
        if (!merchant) {
            throw Object.assign(new Error('Merchant not found'), { statusCode: 404 });
        }

        if (actorUser.role === 'MANAGER') {
            if (merchant.branch_id !== actorUser.branch_id) {
                throw Object.assign(new Error('Access denied'), { statusCode: 403 });
            }
        }

        if (merchant.status !== 'ACTIVE') {
            throw Object.assign(new Error('Merchant is already inactive'), { statusCode: 409 });
        }

        await Merchant.setStatus(merchantId, 'INACTIVE');

        auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
            module: 'MERCHANT',
            action_code: 'MERCHANT_DEACTIVATED',
            entity_type: 'merchants',
            entity_id: merchantId,
            previous_state: safeMerchant(merchant),
            notes: payload.reason
        }));

        return { message: 'Merchant deactivated successfully' };
    },

    async reactivateMerchant(actorUser, merchantId) {
        const merchant = await Merchant.findById(merchantId);
        if (!merchant) {
            throw Object.assign(new Error('Merchant not found'), { statusCode: 404 });
        }

        if (actorUser.role === 'MANAGER') {
            if (merchant.branch_id !== actorUser.branch_id) {
                throw Object.assign(new Error('Access denied'), { statusCode: 403 });
            }
        }

        if (merchant.status !== 'INACTIVE') {
            throw Object.assign(new Error('Merchant is already active'), { statusCode: 409 });
        }

        await Merchant.setStatus(merchantId, 'ACTIVE');

        auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
            module: 'MERCHANT',
            action_code: 'MERCHANT_REACTIVATED',
            entity_type: 'merchants',
            entity_id: merchantId,
            previous_state: safeMerchant(merchant)
        }));

        return { message: 'Merchant reactivated successfully' };
    },

    async searchByMobile(actorUser, mobile) {
        const merchant = await Merchant.findByMobile(mobile);
        if (!merchant) {
            throw Object.assign(new Error('No merchant found with this mobile number'), { statusCode: 404 });
        }

        if (actorUser.role === 'OPERATOR' || actorUser.role === 'MANAGER') {
            if (merchant.branch_id !== actorUser.branch_id) {
                throw Object.assign(new Error('Access denied'), { statusCode: 403 });
            }
        }

        const active_machines = await MerchantMachineAssignment.findActiveByMerchant(merchant.id);

        return {
            merchant: safeMerchant(merchant),
            active_machines
        };
    },

    async searchByPincode(actorUser, pincode) {
        let branch_id = actorUser.branch_id;
        if (actorUser.role === 'SUPER_ADMIN' || actorUser.role === 'SUPERADMIN') {
            branch_id = actorUser.branch_id || null; // SA can search any if desired, but findByPincode takes branch_id
        }

        let merchants = [];
        if (actorUser.role === 'SUPER_ADMIN' || actorUser.role === 'SUPERADMIN') {
            // SA searches across all branches if branch_id isn't provided
            // Re-use findAll for SA global search
            const result = await Merchant.findAll({ pincode, status: 'ACTIVE', limit: 100 });
            merchants = result.merchants; // It's already an array
        } else {
            merchants = await Merchant.findByPincode(pincode, branch_id);
        }
        
        return merchants.map(safeMerchant);
    }
};

module.exports = MerchantService;
