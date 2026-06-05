const db = require('../utils/db');

async function migrate() {
    console.log("Starting database migration...");
    try {
        console.log("Applying strict ENUMs to role and status in employees...");
        // Expand role ENUMs to support new roles and update SUPERADMIN
        await db.query(`ALTER TABLE employees MODIFY COLUMN role VARCHAR(50) NOT NULL`);
        await db.query(`UPDATE employees SET role = 'SUPERADMIN' WHERE role = 'SUPERADMIN'`);
        await db.query(`ALTER TABLE employees MODIFY COLUMN role ENUM('SUPERADMIN', 'MANAGER', 'DISPATCHER', 'ACCOUNTANT', 'HR', 'INVENTORY_MANAGER', 'CUSTOMER_SUPPORT', 'ENGINEER', 'OPERATOR') NOT NULL`);

        await db.query(`ALTER TABLE employees MODIFY COLUMN status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE'`);
        await db.query(`ALTER TABLE employees MODIFY COLUMN status ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE'`);

        console.log("Applying strict ENUM to actor_role in action_logs...");
        await db.query(`ALTER TABLE action_logs MODIFY COLUMN actor_role VARCHAR(50) DEFAULT NULL`);
        await db.query(`ALTER TABLE action_logs MODIFY COLUMN actor_role ENUM('SUPERADMIN', 'SUPERADMIN', 'MANAGER', 'DISPATCHER', 'ACCOUNTANT', 'HR', 'INVENTORY_MANAGER', 'CUSTOMER_SUPPORT', 'ENGINEER', 'OPERATOR') DEFAULT NULL`);
        console.log("Migration completed successfully!");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
}

migrate();
