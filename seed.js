// scripts/seedSuperAdmin.js
// ─────────────────────────────────────────────────────────────
// Creates the first SUPERADMIN + a default branch if none exists.
// Run once: node scripts/seedSuperAdmin.js
// ─────────────────────────────────────────────────────────────

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./utils/db');

// ── Config — override via env or edit directly ────────────────
const SUPERADMIN = {
    full_name: process.env.SEED_SA_NAME || 'Super Admin',
    mobile: process.env.SEED_SA_MOBILE || '9000000000',
    email: process.env.SEED_SA_EMAIL || 'superadmin@pos-platform.com',
    password: process.env.SEED_SA_PASSWORD || 'Admin@1234',
};

const DEFAULT_BRANCH = {
    branch_code: process.env.SEED_BRANCH_CODE || 'HQ-001',
    branch_name: process.env.SEED_BRANCH_NAME || 'Head Office',
    address: process.env.SEED_BRANCH_ADDR || 'Head Office, India',
};
// ─────────────────────────────────────────────────────────────

const log = {
    info: (msg) => console.log(`[SEED]  ℹ  ${msg}`),
    success: (msg) => console.log(`[SEED]  ✅ ${msg}`),
    warn: (msg) => console.log(`[SEED]  ⚠  ${msg}`),
    error: (msg) => console.error(`[SEED]  ❌ ${msg}`),
};

// ─────────────────────────────────────────────────────────────

const run = async () => {
    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        // ── 1. Ensure a branch exists ─────────────────────────────
        const [[existingBranch]] = await conn.execute(
            `SELECT id, branch_name FROM branches WHERE branch_code = ? LIMIT 1`,
            [DEFAULT_BRANCH.branch_code]
        );

        let branchId;

        if (existingBranch) {
            branchId = existingBranch.id;
            log.warn(`Branch already exists: "${existingBranch.branch_name}" (${branchId})`);
        } else {
            await conn.execute(
                `INSERT INTO branches (branch_code, branch_name, address, status)
         VALUES (?, ?, ?, 'ACTIVE')`,
                [DEFAULT_BRANCH.branch_code, DEFAULT_BRANCH.branch_name, DEFAULT_BRANCH.address]
            );
            // Fetch back UUID set by DB trigger
            const [[newBranch]] = await conn.execute(
                `SELECT id FROM branches WHERE branch_code = ? LIMIT 1`,
                [DEFAULT_BRANCH.branch_code]
            );
            branchId = newBranch.id;
            log.success(`Branch created: "${DEFAULT_BRANCH.branch_name}" → ${branchId}`);
        }

        // ── 2. Check if SUPERADMIN already exists ────────────────
        const [[existingSA]] = await conn.execute(
            `SELECT id, email, mobile FROM employees
       WHERE (email = ? OR mobile = ?) AND role = 'SUPERADMIN'
       LIMIT 1`,
            [SUPERADMIN.email, SUPERADMIN.mobile]
        );

        if (existingSA) {
            log.warn(`SUPERADMIN already exists — id: ${existingSA.id}, email: ${existingSA.email}`);
            await conn.rollback();
            return;
        }

        // ── 3. Hash password ──────────────────────────────────────
        log.info('Hashing password...');
        const password_hash = await bcrypt.hash(SUPERADMIN.password, 12);

        // ── 4. Insert SUPERADMIN ─────────────────────────────────
        // Do NOT pass id or employee_code — DB trigger sets them
        await conn.execute(
            `INSERT INTO employees
         (full_name, mobile, email, password_hash, role, branch_id, status, date_of_joining)
       VALUES (?, ?, ?, ?, 'SUPERADMIN', ?, 'ACTIVE', CURDATE())`,
            [
                SUPERADMIN.full_name,
                SUPERADMIN.mobile,
                SUPERADMIN.email,
                password_hash,
                branchId,
            ]
        );

        // ── 5. Fetch back created employee ────────────────────────
        const [[created]] = await conn.execute(
            `SELECT id, employee_code, full_name, email, mobile, role, branch_id, status
       FROM employees WHERE mobile = ? LIMIT 1`,
            [SUPERADMIN.mobile]
        );

        await conn.commit();

        // ── 6. Summary ────────────────────────────────────────────
        log.success('SUPERADMIN seeded successfully');
        console.log('\n─────────────────────────────────────');
        console.log('  id            :', created.id);
        console.log('  employee_code :', created.employee_code);
        console.log('  full_name     :', created.full_name);
        console.log('  email         :', created.email);
        console.log('  mobile        :', created.mobile);
        console.log('  role          :', created.role);
        console.log('  branch_id     :', created.branch_id);
        console.log('  status        :', created.status);
        console.log('─────────────────────────────────────');
        console.log('  login with    :', SUPERADMIN.email, '/', SUPERADMIN.password);
        console.log('─────────────────────────────────────\n');
        log.warn('Change the default password immediately after first login.');

    } catch (err) {
        if (conn) await conn.rollback();
        log.error(`Seed failed: ${err.message}`);
        console.error(err);
        process.exit(1);
    } finally {
        if (conn) conn.release();
        process.exit(0);
    }
};

run();