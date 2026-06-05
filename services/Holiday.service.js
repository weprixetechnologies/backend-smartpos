const HolidayModel = require('../models/Holiday.model');
const auditEmitter = require('../utils/auditEmitter');
const { buildEntry } = require('./AuditLogger.service');
const db = require('../utils/db');

const HolidayService = {
    async createHoliday(actorUser, payload) {
        if (actorUser.role !== 'SUPERADMIN') {
            const err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }

        const { branch_id, holiday_date, description } = payload;

        const conn = await db.getConnection();
        try {
            let query = `SELECT COUNT(*) AS count FROM holidays WHERE holiday_date = ? AND `;
            const params = [holiday_date];

            if (branch_id) {
                query += `branch_id = ?`;
                params.push(branch_id);
            } else {
                query += `branch_id IS NULL`;
            }

            const [rows] = await conn.execute(query, params);
            if (rows[0].count > 0) {
                const err = new Error('Holiday already exists for this date');
                err.status = 409;
                throw err;
            }
        } finally {
            conn.release();
        }

        const holiday = await HolidayModel.create({
            branch_id,
            holiday_date,
            description,
            created_by: actorUser.id
        });

        auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
            module: 'ATTENDANCE',
            action_code: 'HOLIDAY_CREATED',
            entity_type: 'holidays',
            entity_id: holiday.id
        }));

        return holiday;
    },

    async listHolidays(actorUser, query) {
        let branch_id = query.branch_id;
        if (actorUser.role !== 'SUPERADMIN') {
            branch_id = actorUser.branch_id;
        }

        return await HolidayModel.findAll({
            branch_id: branch_id || null,
            year: query.year || null
        });
    },

    async deleteHoliday(actorUser, holidayId) {
        if (actorUser.role !== 'SUPERADMIN') {
            const err = new Error('Forbidden');
            err.status = 403;
            throw err;
        }

        const success = await HolidayModel.delete(holidayId);
        if (!success) {
            const err = new Error('Holiday not found');
            err.status = 404;
            throw err;
        }

        auditEmitter.emit('audit', buildEntry({ user: actorUser }, {
            module: 'ATTENDANCE',
            action_code: 'HOLIDAY_DELETED',
            entity_type: 'holidays',
            entity_id: holidayId
        }));

        return { success: true };
    }
};

module.exports = HolidayService;
