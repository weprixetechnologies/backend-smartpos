require('dotenv').config();
const fs = require('fs');
const db = require('./utils/db');

async function applyMigration() {
    try {
        await db.query(`CREATE SEQUENCE IF NOT EXISTS seq_merchant START WITH 1 INCREMENT BY 1 NOCACHE;`);
        
        await db.query(`
        CREATE TABLE IF NOT EXISTS merchants (
            id              CHAR(36)     NOT NULL,
            merchant_code   VARCHAR(30)  NOT NULL,
            full_name       VARCHAR(200) NOT NULL,
            business_name   VARCHAR(200) DEFAULT NULL,
            mobile          VARCHAR(20)  NOT NULL,
            pincode         VARCHAR(10)  NOT NULL,
            address         TEXT         NOT NULL,
            branch_id       CHAR(36)     NOT NULL,
            status          ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
            email           VARCHAR(150) DEFAULT NULL,
            password_hash   TEXT         DEFAULT NULL,
            last_login_at   DATETIME     DEFAULT NULL,
            registered_by   CHAR(36)     DEFAULT NULL,
            created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_merchant_code   (merchant_code),
            UNIQUE KEY uq_merchant_mobile (mobile),
            KEY idx_merchant_branch  (branch_id),
            KEY idx_merchant_pincode (pincode),
            KEY idx_merchant_status  (status),
            CONSTRAINT fk_merchant_branch      FOREIGN KEY (branch_id)    REFERENCES branches(id),
            CONSTRAINT fk_merchant_registered  FOREIGN KEY (registered_by) REFERENCES employees(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await db.query('DROP TRIGGER IF EXISTS trg_merchants_before_insert;');
        await db.query(`
        CREATE TRIGGER trg_merchants_before_insert
        BEFORE INSERT ON merchants
        FOR EACH ROW
        BEGIN
            IF NEW.id IS NULL OR NEW.id = '' THEN
                SET NEW.id = UUID();
            END IF;
            IF NEW.merchant_code IS NULL OR NEW.merchant_code = '' THEN
                SET NEW.merchant_code = CONCAT('MRC-', LPAD(NEXTVAL(seq_merchant), 5, '0'));
            END IF;
        END;
        `);

        await db.query(`
        CREATE TABLE IF NOT EXISTS merchant_machine_assignments (
            id            CHAR(36)  NOT NULL,
            merchant_id   CHAR(36)  NOT NULL,
            machine_id    CHAR(36)  NOT NULL,
            assigned_by   CHAR(36)  DEFAULT NULL,
            assigned_at   DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
            unassigned_by CHAR(36)  DEFAULT NULL,
            unassigned_at DATETIME  DEFAULT NULL,
            notes         TEXT      DEFAULT NULL,
            PRIMARY KEY (id),
            KEY idx_mma_merchant (merchant_id),
            KEY idx_mma_machine  (machine_id),
            CONSTRAINT fk_mma_merchant     FOREIGN KEY (merchant_id)   REFERENCES merchants(id) ON DELETE CASCADE,
            CONSTRAINT fk_mma_machine      FOREIGN KEY (machine_id)    REFERENCES machines(id),
            CONSTRAINT fk_mma_assigned_by  FOREIGN KEY (assigned_by)   REFERENCES employees(id) ON DELETE SET NULL,
            CONSTRAINT fk_mma_unassigned_by FOREIGN KEY (unassigned_by) REFERENCES employees(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await db.query('DROP TRIGGER IF EXISTS trg_mma_before_insert;');
        await db.query(`
        CREATE TRIGGER trg_mma_before_insert
        BEFORE INSERT ON merchant_machine_assignments
        FOR EACH ROW
        BEGIN
            IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
        END;
        `);

        console.log("Migration applied successfully!");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        process.exit();
    }
}
applyMigration();
