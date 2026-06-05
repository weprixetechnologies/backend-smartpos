const db = require('../utils/db');

const create = async ({ consignment_id, stock_item_id, received_by, item_condition, notes }) => {
    const query = `INSERT INTO goods_receipt_items (consignment_id, stock_item_id, received_by, item_condition, notes)
                    VALUES (?, ?, ?, ?, ?)`;
    await db.query(query, [consignment_id, stock_item_id, received_by || null, item_condition || 'GOOD', notes || null]);
};

const findByConsignment = async (consignment_id) => {
    const query = `SELECT gri.*, si.serial_number, si.item_name, si.category
                    FROM goods_receipt_items gri
                    JOIN stock_items si ON si.id = gri.stock_item_id
                    WHERE gri.consignment_id = ?
                    ORDER BY gri.received_at DESC`;
    const [rows] = await db.query(query, [consignment_id]);
    return rows;
};

module.exports = { create, findByConsignment };
