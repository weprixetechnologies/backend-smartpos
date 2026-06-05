const fs = require('fs');
const path = require('path');

const modelsDir = path.join(__dirname, '../models');

const files = {
  'Machine.model.js': `const db = require('../config/db');

const create = async ({ serial_number, tid, model, brand, branch_id, warranty_expiry }) => {
    const query = \`INSERT INTO machines (serial_number, tid, model, brand, branch_id, warranty_expiry, status, is_chronic_fault)
                    VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE', 0)\`;
    await db.query(query, [serial_number, tid || null, model || null, brand || null, branch_id || null, warranty_expiry || null]);
    const [rows] = await db.query('SELECT * FROM machines WHERE serial_number = ? LIMIT 1', [serial_number]);
    return rows[0];
};

const findById = async (id) => {
    const [rows] = await db.query('SELECT * FROM machines WHERE id = ? LIMIT 1', [id]);
    return rows[0];
};

const findBySerial = async (serial_number) => {
    const [rows] = await db.query('SELECT * FROM machines WHERE serial_number = ? LIMIT 1', [serial_number]);
    return rows[0];
};

const findByTid = async (tid) => {
    const [rows] = await db.query('SELECT * FROM machines WHERE tid = ? LIMIT 1', [tid]);
    return rows[0];
};

const findAll = async ({ branch_id, status, is_chronic_fault, search, page = 1, limit = 20 }) => {
    let baseQuery = 'FROM machines WHERE 1=1';
    const params = [];
    if (branch_id) { baseQuery += ' AND branch_id = ?'; params.push(branch_id); }
    if (status) { baseQuery += ' AND status = ?'; params.push(status); }
    if (is_chronic_fault !== undefined) { baseQuery += ' AND is_chronic_fault = ?'; params.push(is_chronic_fault); }
    if (search) {
        baseQuery += ' AND (serial_number LIKE ? OR tid LIKE ? OR model LIKE ? OR brand LIKE ?)';
        const like = \`%\${search}%\`;
        params.push(like, like, like, like);
    }
    
    const [countRows] = await db.query(\`SELECT COUNT(*) as total \${baseQuery}\`, params);
    const total = countRows[0].total;
    
    const offset = (page - 1) * limit;
    const query = \`SELECT * \${baseQuery} ORDER BY created_at DESC LIMIT ? OFFSET ?\`;
    const [machines] = await db.query(query, [...params, Number(limit), Number(offset)]);
    
    return { machines, total, page: Number(page), limit: Number(limit) };
};

const update = async (id, fields) => {
    const allowed = ['serial_number', 'tid', 'model', 'brand', 'branch_id', 'warranty_expiry', 'is_chronic_fault', 'status'];
    const setClauses = [];
    const values = [];
    for (const key of allowed) {
        if (fields[key] !== undefined) {
            setClauses.push(\`\${key} = ?\`);
            values.push(fields[key]);
        }
    }
    if (setClauses.length === 0) return;
    setClauses.push('updated_at = NOW()');
    values.push(id);
    
    await db.query(\`UPDATE machines SET \${setClauses.join(', ')} WHERE id = ?\`, values);
};

const decommission = async (id) => {
    await db.query(\`UPDATE machines SET status = 'DECOMMISSIONED', decommissioned_at = NOW(), updated_at = NOW() WHERE id = ?\`, [id]);
};

const updateStatus = async (id, status) => {
    await db.query(\`UPDATE machines SET status = ?, updated_at = NOW() WHERE id = ?\`, [status, id]);
};

module.exports = { create, findById, findBySerial, findByTid, findAll, update, decommission, updateStatus };
`,

  'TidMapping.model.js': `const db = require('../config/db');

const mapTid = async ({ machine_id, tid, merchant_name, merchant_address, mapped_by, ticket_id }) => {
    const query = \`INSERT INTO tid_mapping_history (machine_id, tid, merchant_name, merchant_address, mapped_by, ticket_id)
                    VALUES (?, ?, ?, ?, ?, ?)\`;
    await db.query(query, [machine_id, tid, merchant_name || null, merchant_address || null, mapped_by || null, ticket_id || null]);
    const [rows] = await db.query('SELECT * FROM tid_mapping_history WHERE machine_id = ? AND unmapped_at IS NULL LIMIT 1', [machine_id]);
    return rows[0];
};

const unmapTid = async (machine_id, { unmapped_by, ticket_id }) => {
    const query = \`UPDATE tid_mapping_history SET unmapped_at = NOW(), unmapped_by = ?, ticket_id = COALESCE(?, ticket_id) 
                    WHERE machine_id = ? AND unmapped_at IS NULL\`;
    await db.query(query, [unmapped_by || null, ticket_id || null, machine_id]);
};

const getCurrentMapping = async (machine_id) => {
    const [rows] = await db.query('SELECT * FROM tid_mapping_history WHERE machine_id = ? AND unmapped_at IS NULL LIMIT 1', [machine_id]);
    return rows[0] || null;
};

const getHistory = async (machine_id) => {
    const [rows] = await db.query('SELECT * FROM tid_mapping_history WHERE machine_id = ? ORDER BY mapped_at DESC', [machine_id]);
    return rows;
};

const findByTid = async (tid) => {
    const [rows] = await db.query('SELECT * FROM tid_mapping_history WHERE tid = ? ORDER BY mapped_at DESC', [tid]);
    return rows;
};

module.exports = { mapTid, unmapTid, getCurrentMapping, getHistory, findByTid };
`,

  'MachineCustody.model.js': `const db = require('../config/db');

const create = async ({ machine_id, transferred_by, received_by, from_entity, to_entity, photo_url, ticket_id, notes }) => {
    const query = \`INSERT INTO machine_custody_events (machine_id, transferred_by, received_by, from_entity, to_entity, photo_url, ticket_id, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)\`;
    await db.query(query, [machine_id, transferred_by || null, received_by || null, from_entity || null, to_entity || null, photo_url || null, ticket_id || null, notes || null]);
};

const findByMachine = async (machine_id) => {
    const query = \`SELECT mce.*, e1.full_name AS transferred_by_name, e2.full_name AS received_by_name
                    FROM machine_custody_events mce
                    LEFT JOIN employees e1 ON e1.id = mce.transferred_by
                    LEFT JOIN employees e2 ON e2.id = mce.received_by
                    WHERE mce.machine_id = ?
                    ORDER BY mce.occurred_at DESC\`;
    const [rows] = await db.query(query, [machine_id]);
    return rows;
};

const findByTicket = async (ticket_id) => {
    const [rows] = await db.query('SELECT * FROM machine_custody_events WHERE ticket_id = ? ORDER BY occurred_at ASC', [ticket_id]);
    return rows;
};

module.exports = { create, findByMachine, findByTicket };
`,

  'StockItem.model.js': `const db = require('../config/db');

const create = async ({ serial_number, machine_id, category, item_name, brand, model, branch_id, item_condition, consignment_id, notes }) => {
    const query = \`INSERT INTO stock_items (serial_number, machine_id, category, item_name, brand, model, branch_id, state, item_condition, consignment_id, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', ?, ?, ?)\`;
    await db.query(query, [serial_number, machine_id || null, category, item_name, brand || null, model || null, branch_id, item_condition || 'GOOD', consignment_id || null, notes || null]);
    const [rows] = await db.query('SELECT * FROM stock_items WHERE serial_number = ? LIMIT 1', [serial_number]);
    return rows[0];
};

const findById = async (id) => {
    const [rows] = await db.query('SELECT * FROM stock_items WHERE id = ? LIMIT 1', [id]);
    return rows[0];
};

const findBySerial = async (serial_number) => {
    const [rows] = await db.query('SELECT * FROM stock_items WHERE serial_number = ? LIMIT 1', [serial_number]);
    return rows[0];
};

const findAll = async ({ branch_id, category, state, item_condition, consignment_id, search, page = 1, limit = 20 }) => {
    let baseQuery = 'FROM stock_items WHERE 1=1';
    const params = [];
    if (branch_id) { baseQuery += ' AND branch_id = ?'; params.push(branch_id); }
    if (category) { baseQuery += ' AND category = ?'; params.push(category); }
    if (state) { baseQuery += ' AND state = ?'; params.push(state); }
    if (item_condition) { baseQuery += ' AND item_condition = ?'; params.push(item_condition); }
    if (consignment_id) { baseQuery += ' AND consignment_id = ?'; params.push(consignment_id); }
    if (search) {
        baseQuery += ' AND (serial_number LIKE ? OR item_name LIKE ?)';
        const like = \`%\${search}%\`;
        params.push(like, like);
    }
    
    const [countRows] = await db.query(\`SELECT COUNT(*) as total \${baseQuery}\`, params);
    const total = countRows[0].total;
    
    const offset = (page - 1) * limit;
    const query = \`SELECT * \${baseQuery} ORDER BY created_at DESC LIMIT ? OFFSET ?\`;
    const [items] = await db.query(query, [...params, Number(limit), Number(offset)]);
    
    return { items, total, page: Number(page), limit: Number(limit) };
};

const updateState = async (id, state) => {
    await db.query('UPDATE stock_items SET state = ?, updated_at = NOW() WHERE id = ?', [state, id]);
};

const update = async (id, fields) => {
    const allowed = ['item_name', 'brand', 'model', 'item_condition', 'notes', 'machine_id', 'state'];
    const setClauses = [];
    const values = [];
    for (const key of allowed) {
        if (fields[key] !== undefined) {
            setClauses.push(\`\${key} = ?\`);
            values.push(fields[key]);
        }
    }
    if (setClauses.length === 0) return;
    setClauses.push('updated_at = NOW()');
    values.push(id);
    await db.query(\`UPDATE stock_items SET \${setClauses.join(', ')} WHERE id = ?\`, values);
};

const decommission = async (id) => {
    await db.query(\`UPDATE stock_items SET state = 'DECOMMISSIONED', decommissioned_at = NOW(), updated_at = NOW() WHERE id = ?\`, [id]);
};

module.exports = { create, findById, findBySerial, findAll, updateState, update, decommission };
`,

  'Consignment.model.js': `const db = require('../config/db');

const create = async ({ branch_id, supplier_name, dispatch_reference, expected_count, expected_arrival, notes, created_by }) => {
    const query = \`INSERT INTO consignments (branch_id, supplier_name, dispatch_reference, expected_count, status, received_count, expected_arrival, notes, created_by)
                    VALUES (?, ?, ?, ?, 'EXPECTED', 0, ?, ?, ?)\`;
    await db.query(query, [branch_id, supplier_name || null, dispatch_reference || null, expected_count || null, expected_arrival || null, notes || null, created_by || null]);
    const [rows] = await db.query('SELECT * FROM consignments WHERE created_by = ? ORDER BY created_at DESC LIMIT 1', [created_by]);
    return rows[0];
};

const findById = async (id) => {
    const [rows] = await db.query('SELECT * FROM consignments WHERE id = ? LIMIT 1', [id]);
    return rows[0];
};

const findAll = async ({ branch_id, status, from_date, to_date, supplier_name, page = 1, limit = 20 }) => {
    let baseQuery = 'FROM consignments WHERE 1=1';
    const params = [];
    if (branch_id) { baseQuery += ' AND branch_id = ?'; params.push(branch_id); }
    if (status) { baseQuery += ' AND status = ?'; params.push(status); }
    if (from_date) { baseQuery += ' AND created_at >= ?'; params.push(from_date); }
    if (to_date) { baseQuery += ' AND created_at <= ?'; params.push(to_date); }
    if (supplier_name) {
        baseQuery += ' AND supplier_name LIKE ?';
        params.push(\`%\${supplier_name}%\`);
    }
    
    const [countRows] = await db.query(\`SELECT COUNT(*) as total \${baseQuery}\`, params);
    const total = countRows[0].total;
    
    const offset = (page - 1) * limit;
    const query = \`SELECT * \${baseQuery} ORDER BY created_at DESC LIMIT ? OFFSET ?\`;
    const [consignments] = await db.query(query, [...params, Number(limit), Number(offset)]);
    
    return { consignments, total, page: Number(page), limit: Number(limit) };
};

const incrementReceivedCount = async (id) => {
    await db.query('UPDATE consignments SET received_count = received_count + 1, updated_at = NOW() WHERE id = ?', [id]);
};

const updateStatus = async (id, status) => {
    await db.query('UPDATE consignments SET status = ?, updated_at = NOW() WHERE id = ?', [status, id]);
};

const markReceived = async (id, received_by) => {
    await db.query(\`UPDATE consignments SET status = 'RECEIVED', received_at = NOW(), received_by = ?, updated_at = NOW() WHERE id = ?\`, [received_by, id]);
};

module.exports = { create, findById, findAll, incrementReceivedCount, updateStatus, markReceived };
`,

  'GoodsReceipt.model.js': `const db = require('../config/db');

const create = async ({ consignment_id, stock_item_id, received_by, item_condition, notes }) => {
    const query = \`INSERT INTO goods_receipt_items (consignment_id, stock_item_id, received_by, item_condition, notes)
                    VALUES (?, ?, ?, ?, ?)\`;
    await db.query(query, [consignment_id, stock_item_id, received_by || null, item_condition || 'GOOD', notes || null]);
};

const findByConsignment = async (consignment_id) => {
    const query = \`SELECT gri.*, si.serial_number, si.item_name, si.category
                    FROM goods_receipt_items gri
                    JOIN stock_items si ON si.id = gri.stock_item_id
                    WHERE gri.consignment_id = ?
                    ORDER BY gri.received_at DESC\`;
    const [rows] = await db.query(query, [consignment_id]);
    return rows;
};

module.exports = { create, findByConsignment };
`,

  'ConsignmentDiscrepancy.model.js': `const db = require('../config/db');

const create = async ({ consignment_id, description, raised_by }) => {
    const query = \`INSERT INTO consignment_discrepancies (consignment_id, description, raised_by)
                    VALUES (?, ?, ?)\`;
    await db.query(query, [consignment_id, description, raised_by || null]);
};

const findByConsignment = async (consignment_id) => {
    const [rows] = await db.query('SELECT * FROM consignment_discrepancies WHERE consignment_id = ? ORDER BY raised_at DESC', [consignment_id]);
    return rows;
};

const resolve = async (id) => {
    await db.query('UPDATE consignment_discrepancies SET resolved = 1, resolved_at = NOW() WHERE id = ?', [id]);
};

module.exports = { create, findByConsignment, resolve };
`,

  'StockIssuance.model.js': `const db = require('../config/db');

const create = async ({ stock_item_id, engineer_id, ticket_id, branch_id, issued_by, notes }) => {
    const query = \`INSERT INTO stock_issuances (stock_item_id, engineer_id, ticket_id, branch_id, issued_by, notes)
                    VALUES (?, ?, ?, ?, ?, ?)\`;
    await db.query(query, [stock_item_id, engineer_id, ticket_id || null, branch_id, issued_by || null, notes || null]);
};

const findById = async (id) => {
    const query = \`SELECT si_iss.*, si.serial_number, si.item_name, si.category,
                          e.full_name AS engineer_name, e.employee_code
                   FROM stock_issuances si_iss
                   JOIN stock_items si ON si.id = si_iss.stock_item_id
                   JOIN employees e ON e.id = si_iss.engineer_id
                   WHERE si_iss.id = ? LIMIT 1\`;
    const [rows] = await db.query(query, [id]);
    return rows[0];
};

const findByEngineer = async (engineer_id) => {
    const query = \`SELECT si_iss.*, si.serial_number, si.item_name, si.category
                   FROM stock_issuances si_iss
                   JOIN stock_items si ON si.id = si_iss.stock_item_id
                   WHERE si_iss.engineer_id = ? AND si_iss.returned_at IS NULL
                   ORDER BY si_iss.issued_at DESC\`;
    const [rows] = await db.query(query, [engineer_id]);
    return rows;
};

const findByBranch = async (branch_id, { returned, from_date, to_date }) => {
    let baseQuery = \`SELECT si_iss.*, si.serial_number, si.item_name, si.category, e.full_name AS engineer_name 
                     FROM stock_issuances si_iss
                     JOIN stock_items si ON si.id = si_iss.stock_item_id
                     JOIN employees e ON e.id = si_iss.engineer_id
                     WHERE si_iss.branch_id = ?\`;
    const params = [branch_id];
    
    if (returned === 'true') {
        baseQuery += ' AND si_iss.returned_at IS NOT NULL';
    } else if (returned === 'false') {
        baseQuery += ' AND si_iss.returned_at IS NULL';
    }
    
    if (from_date) {
        baseQuery += ' AND si_iss.issued_at >= ?';
        params.push(from_date);
    }
    if (to_date) {
        baseQuery += ' AND si_iss.issued_at <= ?';
        params.push(to_date);
    }
    
    baseQuery += ' ORDER BY si_iss.issued_at DESC';
    const [rows] = await db.query(baseQuery, params);
    return rows;
};

const acknowledge = async (id, { engineer_ack_photo }) => {
    await db.query('UPDATE stock_issuances SET engineer_ack_at = NOW(), engineer_ack_photo = ? WHERE id = ?', [engineer_ack_photo || null, id]);
};

const markReturned = async (id, { return_condition, returned_at }) => {
    await db.query('UPDATE stock_issuances SET returned_at = ?, return_condition = ? WHERE id = ?', [returned_at, return_condition, id]);
};

module.exports = { create, findById, findByEngineer, findByBranch, acknowledge, markReturned };
`,

  'StockReturn.model.js': `const db = require('../config/db');

const create = async ({ stock_item_id, engineer_id, ticket_id, branch_id, item_condition, received_by, photo_url, notes }) => {
    const query = \`INSERT INTO stock_returns (stock_item_id, engineer_id, ticket_id, branch_id, item_condition, received_by, photo_url, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)\`;
    await db.query(query, [stock_item_id, engineer_id, ticket_id || null, branch_id, item_condition || 'GOOD', received_by || null, photo_url || null, notes || null]);
};

const findByBranch = async (branch_id, { from_date, to_date, engineer_id }) => {
    let baseQuery = \`SELECT sr.*, si.serial_number, si.item_name, e.full_name AS engineer_name
                     FROM stock_returns sr
                     JOIN stock_items si ON si.id = sr.stock_item_id
                     JOIN employees e ON e.id = sr.engineer_id
                     WHERE sr.branch_id = ?\`;
    const params = [branch_id];
    
    if (engineer_id) {
        baseQuery += ' AND sr.engineer_id = ?';
        params.push(engineer_id);
    }
    if (from_date) {
        baseQuery += ' AND sr.returned_at >= ?';
        params.push(from_date);
    }
    if (to_date) {
        baseQuery += ' AND sr.returned_at <= ?';
        params.push(to_date);
    }
    
    baseQuery += ' ORDER BY sr.returned_at DESC';
    const [rows] = await db.query(baseQuery, params);
    return rows;
};

module.exports = { create, findByBranch };
`,

  'SparePart.model.js': `const db = require('../config/db');

const create = async ({ part_name, part_code, category, branch_id, quantity, low_stock_threshold, unit }) => {
    const query = \`INSERT INTO spare_parts (part_name, part_code, category, branch_id, quantity, low_stock_threshold, unit, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())\`;
    await db.query(query, [part_name, part_code || null, category || 'SPARE_PART', branch_id, quantity || 0, low_stock_threshold || 5, unit || null]);
    const [rows] = await db.query('SELECT * FROM spare_parts WHERE branch_id = ? AND part_name = ? ORDER BY created_at DESC LIMIT 1', [branch_id, part_name]);
    return rows[0];
};

const findById = async (id) => {
    const [rows] = await db.query('SELECT * FROM spare_parts WHERE id = ? LIMIT 1', [id]);
    return rows[0];
};

const findAll = async ({ branch_id, category, low_stock_only }) => {
    let baseQuery = 'SELECT * FROM spare_parts WHERE 1=1';
    const params = [];
    if (branch_id) { baseQuery += ' AND branch_id = ?'; params.push(branch_id); }
    if (category) { baseQuery += ' AND category = ?'; params.push(category); }
    if (low_stock_only) { baseQuery += ' AND quantity <= low_stock_threshold'; }
    
    baseQuery += ' ORDER BY part_name ASC';
    const [rows] = await db.query(baseQuery, params);
    return rows;
};

const update = async (id, fields) => {
    const allowed = ['part_name', 'part_code', 'category', 'low_stock_threshold', 'unit'];
    const setClauses = [];
    const values = [];
    for (const key of allowed) {
        if (fields[key] !== undefined) {
            setClauses.push(\`\${key} = ?\`);
            values.push(fields[key]);
        }
    }
    if (setClauses.length === 0) return;
    setClauses.push('updated_at = NOW()');
    values.push(id);
    await db.query(\`UPDATE spare_parts SET \${setClauses.join(', ')} WHERE id = ?\`, values);
};

const adjustQuantity = async (id, delta) => {
    await db.query('UPDATE spare_parts SET quantity = quantity + ?, updated_at = NOW() WHERE id = ?', [delta, id]);
};

module.exports = { create, findById, findAll, update, adjustQuantity };
`,

  'SparePartIssuance.model.js': `const db = require('../config/db');

const create = async ({ part_id, engineer_id, ticket_id, quantity_issued, issued_by, job_sheet_id }) => {
    const query = \`INSERT INTO spare_part_issuances (part_id, engineer_id, ticket_id, quantity_issued, quantity_returned, issued_by, job_sheet_id)
                    VALUES (?, ?, ?, ?, 0, ?, ?)\`;
    await db.query(query, [part_id, engineer_id, ticket_id || null, quantity_issued, issued_by || null, job_sheet_id || null]);
};

const findByEngineer = async (engineer_id) => {
    const query = \`SELECT spi.*, sp.part_name, sp.part_code, sp.unit
                   FROM spare_part_issuances spi
                   JOIN spare_parts sp ON sp.id = spi.part_id
                   WHERE spi.engineer_id = ?
                   ORDER BY spi.issued_at DESC\`;
    const [rows] = await db.query(query, [engineer_id]);
    return rows;
};

const findByTicket = async (ticket_id) => {
    const query = \`SELECT spi.*, sp.part_name, sp.unit
                   FROM spare_part_issuances spi
                   JOIN spare_parts sp ON sp.id = spi.part_id
                   WHERE spi.ticket_id = ?\`;
    const [rows] = await db.query(query, [ticket_id]);
    return rows;
};

const recordReturn = async (id, quantity_returned) => {
    await db.query('UPDATE spare_part_issuances SET quantity_returned = quantity_returned + ? WHERE id = ?', [quantity_returned, id]);
};

module.exports = { create, findByEngineer, findByTicket, recordReturn };
`
};

for (const [filename, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(modelsDir, filename), content);
}

console.log('Models created successfully.');
