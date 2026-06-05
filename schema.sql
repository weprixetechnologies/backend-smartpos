-- ============================================================
-- MERCHANT POS SERVICING PLATFORM — FULL DATABASE SCHEMA
-- MariaDB 10.4+  |  InnoDB  |  UTF8MB4
-- ============================================================
--
-- MARIADB-SPECIFIC NOTES vs MySQL 8.0 version:
--
--   UUID defaults   : DEFAULT (UUID()) column expressions are NOT
--                     reliable across all MariaDB 10.x minor versions.
--                     UUIDs are generated in BEFORE INSERT triggers on
--                     every table instead — works on MariaDB 10.2+.
--
--   Sequences       : MariaDB has a native CREATE SEQUENCE statement
--                     (since 10.3). Used here instead of the counters
--                     table + stored-procedure approach.
--
--   JSON type       : Supported from 10.2 (stored as LONGTEXT internally
--                     with a JSON_VALID check constraint). Same syntax.
--
--   CHECK enforced  : MariaDB 10.2+ enforces CHECK constraints natively.
--                     No extra syntax needed.
--
--   SIGNAL          : Supported from 10.0+. Used for immutable audit log.
--
--   Events          : Same syntax as MySQL. Requires event_scheduler=ON
--                     in my.cnf (or SET GLOBAL event_scheduler=ON).
--
--   SQL_MODE        : MariaDB-compatible mode string used below.
--
--   DELIMITER       : Standard $$ delimiter blocks used throughout.
--
--   RLS             : Not natively supported — enforced at app layer.
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO';

CREATE DATABASE IF NOT EXISTS pos_platform
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE pos_platform;

-- ============================================================
-- NATIVE SEQUENCES  (MariaDB 10.3+)
-- Replaces MySQL counters table + next_seq() procedure.
-- Each sequence is used inside BEFORE INSERT triggers to build
-- prefixed human-readable codes.
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS seq_ticket      START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE IF NOT EXISTS seq_transit     START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE IF NOT EXISTS seq_employee    START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE IF NOT EXISTS seq_consignment START WITH 1 INCREMENT BY 1 NOCACHE;

-- ============================================================
-- MODULE: BRANCHES
-- ============================================================

CREATE TABLE branches (
    id              CHAR(36)     NOT NULL,
    branch_code     VARCHAR(20)  NOT NULL,
    branch_name     VARCHAR(150) NOT NULL,
    address         TEXT         NOT NULL,
    contact_person  VARCHAR(100) DEFAULT NULL,
    contact_mobile  VARCHAR(20)  DEFAULT NULL,
    contact_email   VARCHAR(150) DEFAULT NULL,
    status          ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_branch_code (branch_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_branches_before_insert
BEFORE INSERT ON branches
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN
        SET NEW.id = UUID();
    END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------

CREATE TABLE branch_pincode_coverage (
    id           CHAR(36)    NOT NULL,
    branch_id    CHAR(36)    NOT NULL,
    pincode_from VARCHAR(10) NOT NULL,
    pincode_to   VARCHAR(10) NOT NULL,
    created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_bpc_branch (branch_id),
    CONSTRAINT fk_bpc_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_bpc_before_insert
BEFORE INSERT ON branch_pincode_coverage
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;


-- ============================================================
-- MODULE: EMPLOYEES / USERS
-- ============================================================

CREATE TABLE employees (
    id              CHAR(36)     NOT NULL,
    employee_code   VARCHAR(30)  NOT NULL,
    full_name       VARCHAR(150) NOT NULL,
    mobile          VARCHAR(20)  NOT NULL,
    email           VARCHAR(150) DEFAULT NULL,
    password_hash   TEXT         NOT NULL,
    role            ENUM('SUPERADMIN','SUPERADMIN','MANAGER','DISPATCHER','ACCOUNTANT','HR','INVENTORY_MANAGER','CUSTOMER_SUPPORT','ENGINEER','OPERATOR') NOT NULL,
    branch_id       CHAR(36)     NOT NULL,
    base_salary     DECIMAL(12,2) DEFAULT NULL,
    date_of_joining DATE         DEFAULT NULL,
    profile_photo   TEXT         DEFAULT NULL,
    status          ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    last_login_at   DATETIME     DEFAULT NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_employee_code   (employee_code),
    UNIQUE KEY uq_employee_mobile (mobile),
    UNIQUE KEY uq_employee_email  (email),
    KEY idx_employees_branch (branch_id),
    KEY idx_employees_role   (role),
    CONSTRAINT fk_employees_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_employees_before_insert
BEFORE INSERT ON employees
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN
        SET NEW.id = UUID();
    END IF;
    IF NEW.employee_code IS NULL OR NEW.employee_code = '' THEN
        SET NEW.employee_code = CONCAT('EMP-', LPAD(NEXTVAL(seq_employee), 5, '0'));
    END IF;
END$$
DELIMITER ;


-- ============================================================
-- MODULE: PINCODE ZONES
-- ============================================================

CREATE TABLE zones (
    id         CHAR(36)     NOT NULL,
    branch_id  CHAR(36)     NOT NULL,
    zone_name  VARCHAR(100) NOT NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_zone_branch_name (branch_id, zone_name),
    CONSTRAINT fk_zones_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_zones_before_insert
BEFORE INSERT ON zones
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------

CREATE TABLE zone_pincode_ranges (
    id           CHAR(36)    NOT NULL,
    zone_id      CHAR(36)    NOT NULL,
    pincode_from VARCHAR(10) NOT NULL,
    pincode_to   VARCHAR(10) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_zpr_zone (zone_id),
    CONSTRAINT fk_zpr_zone FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_zpr_before_insert
BEFORE INSERT ON zone_pincode_ranges
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------

CREATE TABLE engineer_zone_assignments (
    id          CHAR(36) NOT NULL,
    engineer_id CHAR(36) NOT NULL,
    zone_id     CHAR(36) NOT NULL,
    priority    ENUM('PRIMARY','SECONDARY') NOT NULL DEFAULT 'PRIMARY',
    assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_eza_engineer_zone (engineer_id, zone_id),
    KEY idx_eza_zone (zone_id),
    CONSTRAINT fk_eza_engineer FOREIGN KEY (engineer_id) REFERENCES employees(id) ON DELETE CASCADE,
    CONSTRAINT fk_eza_zone     FOREIGN KEY (zone_id)     REFERENCES zones(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_eza_before_insert
BEFORE INSERT ON engineer_zone_assignments
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;


-- ============================================================
-- MODULE: AUTHENTICATION & SESSIONS
-- ============================================================

CREATE TABLE refresh_tokens (
    id          CHAR(36)    NOT NULL,
    employee_id CHAR(36)    NOT NULL,
    token_hash  TEXT        NOT NULL,
    device_info TEXT        DEFAULT NULL,
    ip_address  VARCHAR(45) DEFAULT NULL,
    expires_at  DATETIME    NOT NULL,
    revoked     TINYINT(1)  NOT NULL DEFAULT 0,
    created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_rt_employee  (employee_id),
    KEY idx_rt_expires   (expires_at),
    CONSTRAINT fk_rt_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_rt_before_insert
BEFORE INSERT ON refresh_tokens
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------

CREATE TABLE login_audit (
    id              CHAR(36)     NOT NULL,
    employee_id     CHAR(36)     DEFAULT NULL,
    email_or_mobile VARCHAR(150) DEFAULT NULL,
    success         TINYINT(1)   NOT NULL,
    ip_address      VARCHAR(45)  DEFAULT NULL,
    device_info     TEXT         DEFAULT NULL,
    branch_id       CHAR(36)     DEFAULT NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_la_employee (employee_id),
    KEY idx_la_created  (created_at),
    CONSTRAINT fk_la_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
    CONSTRAINT fk_la_branch   FOREIGN KEY (branch_id)   REFERENCES branches(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_la_before_insert
BEFORE INSERT ON login_audit
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------

CREATE TABLE otp_records (
    id           CHAR(36)     NOT NULL,
    purpose      ENUM('LOGIN','FORGOT_PASSWORD','MERCHANT_COMPLAINT_SUBMIT',
                      'ARRIVAL_CONFIRMATION','MERCHANT_SIGN_OFF') NOT NULL,
    recipient    VARCHAR(150) NOT NULL,
    otp_hash     TEXT         NOT NULL,
    attempts     TINYINT      NOT NULL DEFAULT 0,
    status       ENUM('PENDING','VALIDATED','EXPIRED','FAILED') NOT NULL DEFAULT 'PENDING',
    entity_id    CHAR(36)     DEFAULT NULL,
    expires_at   DATETIME     NOT NULL,
    validated_at DATETIME     DEFAULT NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_otp_recipient_status (recipient, status),
    KEY idx_otp_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_otp_before_insert
BEFORE INSERT ON otp_records
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;


-- ============================================================
-- MODULE: SHIFTS & ATTENDANCE
-- ============================================================

CREATE TABLE shifts (
    id         CHAR(36)     NOT NULL,
    branch_id  CHAR(36)     NOT NULL,
    shift_name VARCHAR(100) NOT NULL,
    shift_type ENUM('MORNING','EVENING','FULL_DAY','CUSTOM') NOT NULL,
    start_time TIME         NOT NULL,
    end_time   TIME         NOT NULL,
    is_active  TINYINT(1)   NOT NULL DEFAULT 1,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_shifts_branch (branch_id),
    CONSTRAINT fk_shifts_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_shifts_before_insert
BEFORE INSERT ON shifts
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------

CREATE TABLE employee_shifts (
    id             CHAR(36) NOT NULL,
    employee_id    CHAR(36) NOT NULL,
    shift_id       CHAR(36) NOT NULL,
    effective_from DATE     NOT NULL,
    effective_to   DATE     DEFAULT NULL,
    assigned_by    CHAR(36) DEFAULT NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_es_employee (employee_id),
    CONSTRAINT fk_es_employee    FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_es_shift       FOREIGN KEY (shift_id)    REFERENCES shifts(id),
    CONSTRAINT fk_es_assigned_by FOREIGN KEY (assigned_by) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_es_before_insert
BEFORE INSERT ON employee_shifts
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------

CREATE TABLE attendance (
    id               CHAR(36)      NOT NULL,
    employee_id      CHAR(36)      NOT NULL,
    attendance_date  DATE          NOT NULL,
    status           ENUM('PRESENT','ABSENT','HALF_DAY','ON_LEAVE') NOT NULL DEFAULT 'ABSENT',
    punch_in_at      DATETIME      DEFAULT NULL,
    punch_in_lat     DECIMAL(10,7) DEFAULT NULL,
    punch_in_lng     DECIMAL(10,7) DEFAULT NULL,
    punch_out_at     DATETIME      DEFAULT NULL,
    punch_out_lat    DECIMAL(10,7) DEFAULT NULL,
    punch_out_lng    DECIMAL(10,7) DEFAULT NULL,
    shift_id         CHAR(36)      DEFAULT NULL,
    overtime_minutes INT           NOT NULL DEFAULT 0,
    is_regularised   TINYINT(1)    NOT NULL DEFAULT 0,
    created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_attendance_emp_date (employee_id, attendance_date),
    KEY idx_attendance_date (attendance_date),
    CONSTRAINT fk_att_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_att_shift    FOREIGN KEY (shift_id)    REFERENCES shifts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_att_before_insert
BEFORE INSERT ON attendance
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------

CREATE TABLE attendance_regularisation (
    id            CHAR(36) NOT NULL,
    attendance_id CHAR(36) NOT NULL,
    employee_id   CHAR(36) NOT NULL,
    reason        TEXT     NOT NULL,
    status        ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
    reviewed_by   CHAR(36) DEFAULT NULL,
    reviewed_at   DATETIME DEFAULT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_ar_attendance (attendance_id),
    CONSTRAINT fk_ar_attendance FOREIGN KEY (attendance_id) REFERENCES attendance(id),
    CONSTRAINT fk_ar_employee   FOREIGN KEY (employee_id)   REFERENCES employees(id),
    CONSTRAINT fk_ar_reviewer   FOREIGN KEY (reviewed_by)   REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_ar_before_insert
BEFORE INSERT ON attendance_regularisation
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------

CREATE TABLE leave_requests (
    id          CHAR(36) NOT NULL,
    employee_id CHAR(36) NOT NULL,
    leave_type  ENUM('CASUAL','SICK','UNPAID') NOT NULL,
    from_date   DATE     NOT NULL,
    to_date     DATE     NOT NULL,
    reason      TEXT     DEFAULT NULL,
    status      ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
    reviewed_by CHAR(36) DEFAULT NULL,
    reviewed_at DATETIME DEFAULT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_lr_employee (employee_id),
    CONSTRAINT fk_lr_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_lr_reviewer FOREIGN KEY (reviewed_by) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_lr_before_insert
BEFORE INSERT ON leave_requests
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------

CREATE TABLE holidays (
    id           CHAR(36)     NOT NULL,
    branch_id    CHAR(36)     DEFAULT NULL,
    holiday_date DATE         NOT NULL,
    description  VARCHAR(200) DEFAULT NULL,
    created_by   CHAR(36)     DEFAULT NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_holidays_date (holiday_date),
    CONSTRAINT fk_holidays_branch     FOREIGN KEY (branch_id)  REFERENCES branches(id)  ON DELETE SET NULL,
    CONSTRAINT fk_holidays_created_by FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_holidays_before_insert
BEFORE INSERT ON holidays
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;


-- ============================================================
-- MODULE: MACHINES & TID REGISTRY
-- ============================================================

CREATE TABLE machines (
    id                CHAR(36)     NOT NULL,
    serial_number     VARCHAR(100) NOT NULL,
    tid               VARCHAR(50)  DEFAULT NULL,
    model             VARCHAR(100) DEFAULT NULL,
    brand             VARCHAR(100) DEFAULT NULL,
    branch_id         CHAR(36)     DEFAULT NULL,
    status            ENUM('AVAILABLE','DEPLOYED','IN_OFFICE','UNDER_REPAIR',
                           'IN_TRANSIT','DECOMMISSIONED') NOT NULL DEFAULT 'AVAILABLE',
    warranty_expiry   DATE         DEFAULT NULL,
    is_chronic_fault  TINYINT(1)   NOT NULL DEFAULT 0,
    decommissioned_at DATETIME     DEFAULT NULL,
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_machine_serial (serial_number),
    UNIQUE KEY uq_machine_tid    (tid),
    KEY idx_machines_status  (status),
    KEY idx_machines_branch  (branch_id),
    KEY idx_machines_chronic (is_chronic_fault),
    CONSTRAINT fk_machines_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_machines_before_insert
BEFORE INSERT ON machines
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------
-- TID mapping history
-- ticket_id FK deferred — added via ALTER after tickets table is created

CREATE TABLE tid_mapping_history (
    id               CHAR(36)     NOT NULL,
    machine_id       CHAR(36)     NOT NULL,
    tid              VARCHAR(50)  NOT NULL,
    merchant_name    VARCHAR(200) DEFAULT NULL,
    merchant_address TEXT         DEFAULT NULL,
    mapped_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    unmapped_at      DATETIME     DEFAULT NULL,
    mapped_by        CHAR(36)     DEFAULT NULL,
    unmapped_by      CHAR(36)     DEFAULT NULL,
    ticket_id        CHAR(36)     DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_tmh_machine (machine_id),
    KEY idx_tmh_ticket  (ticket_id),
    CONSTRAINT fk_tmh_machine     FOREIGN KEY (machine_id)  REFERENCES machines(id),
    CONSTRAINT fk_tmh_mapped_by   FOREIGN KEY (mapped_by)   REFERENCES employees(id) ON DELETE SET NULL,
    CONSTRAINT fk_tmh_unmapped_by FOREIGN KEY (unmapped_by) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_tmh_before_insert
BEFORE INSERT ON tid_mapping_history
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------
-- Chain of custody
-- ticket_id FK deferred — added via ALTER after tickets table is created

CREATE TABLE machine_custody_events (
    id             CHAR(36)     NOT NULL,
    machine_id     CHAR(36)     NOT NULL,
    transferred_by CHAR(36)     DEFAULT NULL,
    received_by    CHAR(36)     DEFAULT NULL,
    from_entity    VARCHAR(200) DEFAULT NULL,
    to_entity      VARCHAR(200) DEFAULT NULL,
    photo_url      TEXT         DEFAULT NULL,
    ticket_id      CHAR(36)     DEFAULT NULL,
    notes          TEXT         DEFAULT NULL,
    occurred_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_custody_machine (machine_id),
    KEY idx_custody_ticket  (ticket_id),
    CONSTRAINT fk_custody_machine     FOREIGN KEY (machine_id)    REFERENCES machines(id),
    CONSTRAINT fk_custody_transferred FOREIGN KEY (transferred_by) REFERENCES employees(id) ON DELETE SET NULL,
    CONSTRAINT fk_custody_received    FOREIGN KEY (received_by)   REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_custody_before_insert
BEFORE INSERT ON machine_custody_events
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;


-- ============================================================
-- MODULE: SERVICE TICKETS
-- ============================================================

CREATE TABLE tickets (
    id                            CHAR(36)     NOT NULL,
    ticket_number                 VARCHAR(30)  NOT NULL,
    service_type                  ENUM('REPAIR','PICKUP','REPLACEMENT','INSTALLATION',
                                       'DEINSTALLATION','MISC_SERV') NOT NULL,
    branch_id                     CHAR(36)     NOT NULL,
    status                        ENUM('NEW','ASSIGNED','EN_ROUTE','ARRIVED_PENDING',
                                       'IN_PROGRESS','MACHINE_PICKED','IN_OFFICE',
                                       'UNDER_REPAIR','READY_DEPLOY','PENDING_CLOSE',
                                       'CLOSED','CANCELLED') NOT NULL DEFAULT 'NEW',
    priority                      ENUM('NORMAL','URGENT','CRITICAL') NOT NULL DEFAULT 'NORMAL',
    source                        ENUM('CUSTOMER_PORTAL','OPERATOR_RAISED','BANK_TRIGGERED')
                                       NOT NULL DEFAULT 'CUSTOMER_PORTAL',
    -- Merchant
    merchant_name                 VARCHAR(200) NOT NULL,
    business_name                 VARCHAR(200) DEFAULT NULL,
    merchant_address              TEXT         NOT NULL,
    merchant_pincode              VARCHAR(10)  NOT NULL,
    merchant_mobile               VARCHAR(20)  NOT NULL,
    merchant_email                VARCHAR(150) DEFAULT NULL,
    -- Machine
    machine_id                    CHAR(36)     DEFAULT NULL,
    tid                           VARCHAR(50)  DEFAULT NULL,
    serial_number                 VARCHAR(100) DEFAULT NULL,
    machine_model                 VARCHAR(100) DEFAULT NULL,
    -- Complaint
    complaint_category            VARCHAR(100) DEFAULT NULL,
    complaint_description         TEXT         DEFAULT NULL,
    -- Assignment
    assigned_engineer_id          CHAR(36)     DEFAULT NULL,
    assigned_at                   DATETIME     DEFAULT NULL,
    assigned_by                   CHAR(36)     DEFAULT NULL,
    -- Timestamps
    arrived_at                    DATETIME     DEFAULT NULL,
    started_at                    DATETIME     DEFAULT NULL,
    machine_picked_at             DATETIME     DEFAULT NULL,
    in_office_at                  DATETIME     DEFAULT NULL,
    closed_at                     DATETIME     DEFAULT NULL,
    cancelled_at                  DATETIME     DEFAULT NULL,
    -- SLA
    sla_due_at                    DATETIME     DEFAULT NULL,
    sla_breached                  TINYINT(1)   NOT NULL DEFAULT 0,
    -- Close / Cancel
    close_code_hash               TEXT         DEFAULT NULL,
    close_code_expires_at         DATETIME     DEFAULT NULL,
    cancelled_reason              TEXT         DEFAULT NULL,
    cancelled_by                  CHAR(36)     DEFAULT NULL,
    force_closed                  TINYINT(1)   NOT NULL DEFAULT 0,
    force_close_reason            TEXT         DEFAULT NULL,
    -- Arrival OTP
    arrival_otp_fallback_used     TINYINT(1)   NOT NULL DEFAULT 0,
    arrival_fallback_operator     CHAR(36)     DEFAULT NULL,
    -- Merchant sign-off OTP
    merchant_signoff_otp_verified TINYINT(1)   NOT NULL DEFAULT 0,
    merchant_signoff_at           DATETIME     DEFAULT NULL,
    -- Transit (FK added after transits table)
    transit_id                    CHAR(36)     DEFAULT NULL,
    -- Feedback
    feedback_rating               TINYINT      DEFAULT NULL
                                      CHECK (feedback_rating IS NULL OR feedback_rating BETWEEN 1 AND 5),
    feedback_comment              TEXT         DEFAULT NULL,
    feedback_received_at          DATETIME     DEFAULT NULL,

    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_ticket_number   (ticket_number),
    KEY idx_tickets_branch        (branch_id),
    KEY idx_tickets_status        (status),
    KEY idx_tickets_engineer      (assigned_engineer_id),
    KEY idx_tickets_machine       (machine_id),
    KEY idx_tickets_pincode       (merchant_pincode),
    KEY idx_tickets_service_type  (service_type),
    KEY idx_tickets_priority      (priority),
    KEY idx_tickets_sla_breached  (sla_breached),
    KEY idx_tickets_closed_at     (closed_at),
    KEY idx_tickets_created       (created_at),

    CONSTRAINT fk_tickets_branch       FOREIGN KEY (branch_id)               REFERENCES branches(id),
    CONSTRAINT fk_tickets_machine      FOREIGN KEY (machine_id)              REFERENCES machines(id)  ON DELETE SET NULL,
    CONSTRAINT fk_tickets_engineer     FOREIGN KEY (assigned_engineer_id)    REFERENCES employees(id) ON DELETE SET NULL,
    CONSTRAINT fk_tickets_assigned_by  FOREIGN KEY (assigned_by)             REFERENCES employees(id) ON DELETE SET NULL,
    CONSTRAINT fk_tickets_cancelled_by FOREIGN KEY (cancelled_by)            REFERENCES employees(id) ON DELETE SET NULL,
    CONSTRAINT fk_tickets_fallback_op  FOREIGN KEY (arrival_fallback_operator) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Auto UUID + ticket_number + SLA due date
DELIMITER $$
CREATE TRIGGER trg_tickets_before_insert
BEFORE INSERT ON tickets
FOR EACH ROW
BEGIN
    DECLARE v_hours INT DEFAULT 24;

    -- UUID
    IF NEW.id IS NULL OR NEW.id = '' THEN
        SET NEW.id = UUID();
    END IF;

    -- Ticket number
    IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
        SET NEW.ticket_number = CONCAT('TKT-', YEAR(NOW()), '-',
                                       LPAD(NEXTVAL(seq_ticket), 5, '0'));
    END IF;

    -- SLA due date: branch-specific row first, global fallback second
    IF NEW.sla_due_at IS NULL THEN
        SELECT sla_hours INTO v_hours
        FROM sla_config
        WHERE (branch_id = NEW.branch_id OR branch_id IS NULL)
          AND service_type = NEW.service_type
          AND priority     = NEW.priority
        ORDER BY (branch_id IS NULL) ASC   -- branch-specific first
        LIMIT 1;

        IF v_hours IS NULL THEN
            SELECT CAST(config_value AS UNSIGNED) INTO v_hours
            FROM system_config
            WHERE branch_id IS NULL
              AND config_key = CASE NEW.priority
                                   WHEN 'NORMAL'   THEN 'SLA_NORMAL_HOURS'
                                   WHEN 'URGENT'   THEN 'SLA_URGENT_HOURS'
                                   WHEN 'CRITICAL' THEN 'SLA_CRITICAL_HOURS'
                               END
            LIMIT 1;
        END IF;

        SET NEW.sla_due_at = DATE_ADD(NOW(), INTERVAL COALESCE(v_hours, 24) HOUR);
    END IF;
END$$
DELIMITER ;

-- SLA breach flag on every update
DELIMITER $$
CREATE TRIGGER trg_tickets_before_update
BEFORE UPDATE ON tickets
FOR EACH ROW
BEGIN
    IF NEW.status NOT IN ('CLOSED','CANCELLED')
       AND NEW.sla_due_at IS NOT NULL
       AND NOW() > NEW.sla_due_at THEN
        SET NEW.sla_breached = 1;
    END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------

CREATE TABLE ticket_attachments (
    id          CHAR(36)     NOT NULL,
    ticket_id   CHAR(36)     NOT NULL,
    file_url    TEXT         NOT NULL,
    uploaded_by CHAR(36)     DEFAULT NULL,
    uploaded_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    description VARCHAR(200) DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_ta_ticket (ticket_id),
    CONSTRAINT fk_ta_ticket      FOREIGN KEY (ticket_id)   REFERENCES tickets(id)    ON DELETE CASCADE,
    CONSTRAINT fk_ta_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_ta_before_insert
BEFORE INSERT ON ticket_attachments
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------

CREATE TABLE ticket_status_history (
    id              CHAR(36) NOT NULL,
    ticket_id       CHAR(36) NOT NULL,
    from_status     ENUM('NEW','ASSIGNED','EN_ROUTE','ARRIVED_PENDING','IN_PROGRESS',
                         'MACHINE_PICKED','IN_OFFICE','UNDER_REPAIR','READY_DEPLOY',
                         'PENDING_CLOSE','CLOSED','CANCELLED') DEFAULT NULL,
    to_status       ENUM('NEW','ASSIGNED','EN_ROUTE','ARRIVED_PENDING','IN_PROGRESS',
                         'MACHINE_PICKED','IN_OFFICE','UNDER_REPAIR','READY_DEPLOY',
                         'PENDING_CLOSE','CLOSED','CANCELLED') NOT NULL,
    changed_by      CHAR(36)      DEFAULT NULL,
    changed_by_role ENUM('ENGINEER','OPERATOR','MANAGER','SUPERADMIN') DEFAULT NULL,
    latitude        DECIMAL(10,7) DEFAULT NULL,
    longitude       DECIMAL(10,7) DEFAULT NULL,
    notes           TEXT          DEFAULT NULL,
    occurred_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_tsh_ticket (ticket_id),
    CONSTRAINT fk_tsh_ticket     FOREIGN KEY (ticket_id)  REFERENCES tickets(id)    ON DELETE CASCADE,
    CONSTRAINT fk_tsh_changed_by FOREIGN KEY (changed_by) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_tsh_before_insert
BEFORE INSERT ON ticket_status_history
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------

CREATE TABLE ticket_messages (
    id        CHAR(36) NOT NULL,
    ticket_id CHAR(36) NOT NULL,
    sender_id CHAR(36) NOT NULL,
    message   TEXT     DEFAULT NULL,
    image_url TEXT     DEFAULT NULL,
    sent_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_tm_ticket (ticket_id),
    CONSTRAINT fk_tm_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id)    ON DELETE CASCADE,
    CONSTRAINT fk_tm_sender FOREIGN KEY (sender_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_tm_before_insert
BEFORE INSERT ON ticket_messages
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------

CREATE TABLE job_sheets (
    id                    CHAR(36)     NOT NULL,
    ticket_id             CHAR(36)     NOT NULL,
    work_done             TEXT         DEFAULT NULL,
    parts_replaced        TEXT         DEFAULT NULL,
    time_on_site_minutes  INT          DEFAULT NULL,
    merchant_signoff_name VARCHAR(150) DEFAULT NULL,
    engineer_id           CHAR(36)     DEFAULT NULL,
    pdf_url               TEXT         DEFAULT NULL,
    created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_js_ticket (ticket_id),
    CONSTRAINT fk_js_ticket   FOREIGN KEY (ticket_id)   REFERENCES tickets(id)    ON DELETE CASCADE,
    CONSTRAINT fk_js_engineer FOREIGN KEY (engineer_id) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_js_before_insert
BEFORE INSERT ON job_sheets
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- Deferred FKs now that tickets exists
ALTER TABLE tid_mapping_history
    ADD CONSTRAINT fk_tmh_ticket
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL;

ALTER TABLE machine_custody_events
    ADD CONSTRAINT fk_custody_ticket
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL;


-- ============================================================
-- MODULE: STOCK & INVENTORY
-- ============================================================

CREATE TABLE stock_items (
    id               CHAR(36)     NOT NULL,
    serial_number    VARCHAR(100) NOT NULL,
    machine_id       CHAR(36)     DEFAULT NULL,
    category         ENUM('POS_TERMINAL','SPARE_PART','ACCESSORY','CONSUMABLE') NOT NULL,
    item_name        VARCHAR(200) NOT NULL,
    brand            VARCHAR(100) DEFAULT NULL,
    model            VARCHAR(100) DEFAULT NULL,
    branch_id        CHAR(36)     NOT NULL,
    state            ENUM('AVAILABLE','RESERVED','IN_TRANSIT','DEPLOYED',
                          'IN_OFFICE_UNDER_REPAIR','IN_OFFICE_AWAITING_DISPATCH',
                          'DECOMMISSIONED') NOT NULL DEFAULT 'AVAILABLE',
    item_condition   ENUM('GOOD','DAMAGED','FAULTY') NOT NULL DEFAULT 'GOOD',
    consignment_id   CHAR(36)     DEFAULT NULL,
    notes            TEXT         DEFAULT NULL,
    decommissioned_at DATETIME    DEFAULT NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_stock_serial (serial_number),
    KEY idx_stock_branch   (branch_id),
    KEY idx_stock_state    (state),
    KEY idx_stock_category (category),
    CONSTRAINT fk_stock_branch  FOREIGN KEY (branch_id)  REFERENCES branches(id),
    CONSTRAINT fk_stock_machine FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_stock_before_insert
BEFORE INSERT ON stock_items
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------

CREATE TABLE consignments (
    id                 CHAR(36)     NOT NULL,
    consignment_ref    VARCHAR(100) NOT NULL,
    branch_id          CHAR(36)     NOT NULL,
    supplier_name      VARCHAR(200) DEFAULT NULL,
    dispatch_reference VARCHAR(200) DEFAULT NULL,
    relate_badge       VARCHAR(100) DEFAULT NULL,
    expected_count     INT          DEFAULT NULL,
    received_count     INT          NOT NULL DEFAULT 0,
    status             ENUM('EXPECTED','PARTIALLY_RECEIVED','RECEIVED','DISCREPANCY')
                            NOT NULL DEFAULT 'EXPECTED',
    expected_arrival   DATE         DEFAULT NULL,
    received_at        DATETIME     DEFAULT NULL,
    received_by        CHAR(36)     DEFAULT NULL,
    notes              TEXT         DEFAULT NULL,
    created_by         CHAR(36)     DEFAULT NULL,
    created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_consignment_ref (consignment_ref),
    KEY idx_consignment_branch (branch_id),
    CONSTRAINT fk_csgt_branch      FOREIGN KEY (branch_id)   REFERENCES branches(id),
    CONSTRAINT fk_csgt_received_by FOREIGN KEY (received_by) REFERENCES employees(id) ON DELETE SET NULL,
    CONSTRAINT fk_csgt_created_by  FOREIGN KEY (created_by)  REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_consignments_before_insert
BEFORE INSERT ON consignments
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN
        SET NEW.id = UUID();
    END IF;
    IF NEW.consignment_ref IS NULL OR NEW.consignment_ref = '' THEN
        SET NEW.consignment_ref = CONCAT('CSG-', YEAR(NOW()), '-',
                                         LPAD(NEXTVAL(seq_consignment), 5, '0'));
    END IF;
END$$
DELIMITER ;

-- Add consignment FK back onto stock_items
ALTER TABLE stock_items
    ADD CONSTRAINT fk_stock_consignment
    FOREIGN KEY (consignment_id) REFERENCES consignments(id) ON DELETE SET NULL;

-- -------------------------------------------------------

CREATE TABLE goods_receipt_items (
    id             CHAR(36) NOT NULL,
    consignment_id CHAR(36) NOT NULL,
    stock_item_id  CHAR(36) NOT NULL,
    received_by    CHAR(36) DEFAULT NULL,
    received_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    item_condition ENUM('GOOD','DAMAGED','FAULTY') NOT NULL DEFAULT 'GOOD',
    notes          TEXT     DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_gri_consignment (consignment_id),
    CONSTRAINT fk_gri_consignment FOREIGN KEY (consignment_id) REFERENCES consignments(id) ON DELETE CASCADE,
    CONSTRAINT fk_gri_stock_item  FOREIGN KEY (stock_item_id)  REFERENCES stock_items(id),
    CONSTRAINT fk_gri_received_by FOREIGN KEY (received_by)    REFERENCES employees(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_gri_before_insert
BEFORE INSERT ON goods_receipt_items
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------

CREATE TABLE consignment_discrepancies (
    id             CHAR(36) NOT NULL,
    consignment_id CHAR(36) NOT NULL,
    description    TEXT     NOT NULL,
    raised_by      CHAR(36) DEFAULT NULL,
    raised_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved       TINYINT(1) NOT NULL DEFAULT 0,
    resolved_at    DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_cd_consignment (consignment_id),
    CONSTRAINT fk_cd_consignment FOREIGN KEY (consignment_id) REFERENCES consignments(id),
    CONSTRAINT fk_cd_raised_by   FOREIGN KEY (raised_by)      REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_cd_before_insert
BEFORE INSERT ON consignment_discrepancies
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------

CREATE TABLE stock_issuances (
    id                 CHAR(36) NOT NULL,
    stock_item_id      CHAR(36) NOT NULL,
    engineer_id        CHAR(36) NOT NULL,
    ticket_id          CHAR(36) DEFAULT NULL,
    branch_id          CHAR(36) NOT NULL,
    issued_by          CHAR(36) DEFAULT NULL,
    issued_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    engineer_ack_at    DATETIME DEFAULT NULL,
    engineer_ack_photo TEXT     DEFAULT NULL,
    returned_at        DATETIME DEFAULT NULL,
    return_condition   ENUM('GOOD','DAMAGED','FAULTY') DEFAULT NULL,
    notes              TEXT     DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_si_engineer (engineer_id),
    KEY idx_si_ticket   (ticket_id),
    CONSTRAINT fk_si_stock_item FOREIGN KEY (stock_item_id) REFERENCES stock_items(id),
    CONSTRAINT fk_si_engineer   FOREIGN KEY (engineer_id)   REFERENCES employees(id),
    CONSTRAINT fk_si_ticket     FOREIGN KEY (ticket_id)     REFERENCES tickets(id)    ON DELETE SET NULL,
    CONSTRAINT fk_si_branch     FOREIGN KEY (branch_id)     REFERENCES branches(id),
    CONSTRAINT fk_si_issued_by  FOREIGN KEY (issued_by)     REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_si_before_insert
BEFORE INSERT ON stock_issuances
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------

CREATE TABLE stock_returns (
    id             CHAR(36) NOT NULL,
    stock_item_id  CHAR(36) NOT NULL,
    engineer_id    CHAR(36) NOT NULL,
    ticket_id      CHAR(36) DEFAULT NULL,
    branch_id      CHAR(36) NOT NULL,
    item_condition ENUM('GOOD','DAMAGED','FAULTY') NOT NULL DEFAULT 'GOOD',
    received_by    CHAR(36) DEFAULT NULL,
    photo_url      TEXT     DEFAULT NULL,
    returned_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes          TEXT     DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_sr_engineer (engineer_id),
    CONSTRAINT fk_sr_stock_item  FOREIGN KEY (stock_item_id) REFERENCES stock_items(id),
    CONSTRAINT fk_sr_engineer    FOREIGN KEY (engineer_id)   REFERENCES employees(id),
    CONSTRAINT fk_sr_ticket      FOREIGN KEY (ticket_id)     REFERENCES tickets(id)    ON DELETE SET NULL,
    CONSTRAINT fk_sr_branch      FOREIGN KEY (branch_id)     REFERENCES branches(id),
    CONSTRAINT fk_sr_received_by FOREIGN KEY (received_by)   REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_sr_before_insert
BEFORE INSERT ON stock_returns
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------

CREATE TABLE spare_parts (
    id                  CHAR(36)     NOT NULL,
    part_name           VARCHAR(200) NOT NULL,
    part_code           VARCHAR(100) DEFAULT NULL,
    category            ENUM('POS_TERMINAL','SPARE_PART','ACCESSORY','CONSUMABLE')
                             NOT NULL DEFAULT 'SPARE_PART',
    branch_id           CHAR(36)    NOT NULL,
    quantity            INT         NOT NULL DEFAULT 0,
    low_stock_threshold INT         NOT NULL DEFAULT 5,
    unit                VARCHAR(50) DEFAULT NULL,
    created_at          DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_spare_part_code (part_code),
    KEY idx_sp_branch (branch_id),
    CONSTRAINT fk_sp_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_sp_before_insert
BEFORE INSERT ON spare_parts
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------

CREATE TABLE spare_part_issuances (
    id                CHAR(36) NOT NULL,
    part_id           CHAR(36) NOT NULL,
    engineer_id       CHAR(36) NOT NULL,
    ticket_id         CHAR(36) DEFAULT NULL,
    quantity_issued   INT      NOT NULL,
    quantity_returned INT      NOT NULL DEFAULT 0,
    issued_by         CHAR(36) DEFAULT NULL,
    issued_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    job_sheet_id      CHAR(36) DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_spi_engineer (engineer_id),
    CONSTRAINT fk_spi_part      FOREIGN KEY (part_id)      REFERENCES spare_parts(id),
    CONSTRAINT fk_spi_engineer  FOREIGN KEY (engineer_id)  REFERENCES employees(id),
    CONSTRAINT fk_spi_ticket    FOREIGN KEY (ticket_id)    REFERENCES tickets(id)     ON DELETE SET NULL,
    CONSTRAINT fk_spi_issued_by FOREIGN KEY (issued_by)    REFERENCES employees(id)  ON DELETE SET NULL,
    CONSTRAINT fk_spi_job_sheet FOREIGN KEY (job_sheet_id) REFERENCES job_sheets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_spi_before_insert
BEFORE INSERT ON spare_part_issuances
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;


-- ============================================================
-- MODULE: TRANSIT MANAGEMENT
-- ============================================================

CREATE TABLE transits (
    id                 CHAR(36)     NOT NULL,
    transit_number     VARCHAR(30)  NOT NULL,
    transit_type       ENUM('INBOUND','INTER_BRANCH','FIELD_DISPATCH','FIELD_RETURN') NOT NULL,
    origin_entity      VARCHAR(200) NOT NULL,
    destination_entity VARCHAR(200) NOT NULL,
    transport_mode     ENUM('SELF_CARRY','COURIER','COMPANY_VEHICLE') NOT NULL DEFAULT 'SELF_CARRY',
    courier_name       VARCHAR(100) DEFAULT NULL,
    courier_tracking   VARCHAR(200) DEFAULT NULL,
    branch_id          CHAR(36)     NOT NULL,
    status             ENUM('PENDING','DISPATCHED','IN_TRANSIT','DELIVERED',
                            'PARTIALLY_DELIVERED','CANCELLED') NOT NULL DEFAULT 'PENDING',
    dispatched_at      DATETIME     DEFAULT NULL,
    dispatched_by      CHAR(36)     DEFAULT NULL,
    expected_arrival   DATE         DEFAULT NULL,
    received_at        DATETIME     DEFAULT NULL,
    received_by        CHAR(36)     DEFAULT NULL,
    dispatch_photo     TEXT         DEFAULT NULL,
    delivery_photo     TEXT         DEFAULT NULL,
    notes              TEXT         DEFAULT NULL,
    created_by         CHAR(36)     DEFAULT NULL,
    created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_transit_number (transit_number),
    KEY idx_transit_branch           (branch_id),
    KEY idx_transit_status           (status),
    KEY idx_transit_expected_arrival (expected_arrival),
    CONSTRAINT fk_transit_branch        FOREIGN KEY (branch_id)    REFERENCES branches(id),
    CONSTRAINT fk_transit_dispatched_by FOREIGN KEY (dispatched_by) REFERENCES employees(id) ON DELETE SET NULL,
    CONSTRAINT fk_transit_received_by   FOREIGN KEY (received_by)  REFERENCES employees(id) ON DELETE SET NULL,
    CONSTRAINT fk_transit_created_by    FOREIGN KEY (created_by)   REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_transits_before_insert
BEFORE INSERT ON transits
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN
        SET NEW.id = UUID();
    END IF;
    IF NEW.transit_number IS NULL OR NEW.transit_number = '' THEN
        SET NEW.transit_number = CONCAT('TRN-', YEAR(NOW()), '-',
                                        LPAD(NEXTVAL(seq_transit), 5, '0'));
    END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------

CREATE TABLE transit_items (
    id            CHAR(36)   NOT NULL,
    transit_id    CHAR(36)   NOT NULL,
    stock_item_id CHAR(36)   NOT NULL,
    delivered     TINYINT(1) NOT NULL DEFAULT 0,
    notes         TEXT       DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_ti_transit (transit_id),
    CONSTRAINT fk_ti_transit    FOREIGN KEY (transit_id)    REFERENCES transits(id)    ON DELETE CASCADE,
    CONSTRAINT fk_ti_stock_item FOREIGN KEY (stock_item_id) REFERENCES stock_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_ti_before_insert
BEFORE INSERT ON transit_items
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- -------------------------------------------------------

CREATE TABLE transit_ticket_links (
    id         CHAR(36) NOT NULL,
    transit_id CHAR(36) NOT NULL,
    ticket_id  CHAR(36) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_ttl (transit_id, ticket_id),
    CONSTRAINT fk_ttl_transit FOREIGN KEY (transit_id) REFERENCES transits(id)  ON DELETE CASCADE,
    CONSTRAINT fk_ttl_ticket  FOREIGN KEY (ticket_id)  REFERENCES tickets(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_ttl_before_insert
BEFORE INSERT ON transit_ticket_links
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- Now add transit FK onto tickets (transits table exists now)
ALTER TABLE tickets
    ADD CONSTRAINT fk_tickets_transit
    FOREIGN KEY (transit_id) REFERENCES transits(id) ON DELETE SET NULL;


-- ============================================================
-- MODULE: ACTION LOG  (APPEND-ONLY AUDIT)
-- BEFORE UPDATE / DELETE triggers raise an error via SIGNAL.
-- MariaDB 10.0+ supports SIGNAL SQLSTATE natively.
-- ============================================================

CREATE TABLE action_logs (
    id             CHAR(36)        NOT NULL,
    log_number     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    occurred_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actor_id       CHAR(36)        DEFAULT NULL,
    actor_name     VARCHAR(150)    DEFAULT NULL,
    actor_role     ENUM('SUPERADMIN','SUPERADMIN','MANAGER','DISPATCHER','ACCOUNTANT','HR','INVENTORY_MANAGER','CUSTOMER_SUPPORT','ENGINEER','OPERATOR') DEFAULT NULL,
    actor_ip       VARCHAR(45)     DEFAULT NULL,
    actor_device   TEXT            DEFAULT NULL,
    branch_id      CHAR(36)        DEFAULT NULL,
    module         ENUM('AUTH','TICKET','ARRIVAL_OTP','MACHINE',
                        'STOCK','TRANSIT','EMPLOYEE','BRANCH','ATTENDANCE') NOT NULL,
    action_code    VARCHAR(80)     NOT NULL,
    trigger_type   ENUM('USER','SYSTEM') NOT NULL DEFAULT 'USER',
    entity_type    VARCHAR(50)     DEFAULT NULL,
    entity_id      CHAR(36)        DEFAULT NULL,
    previous_state LONGTEXT        CHECK (previous_state IS NULL OR JSON_VALID(previous_state)),
    new_state      LONGTEXT        CHECK (new_state IS NULL OR JSON_VALID(new_state)),
    notes          TEXT            DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_log_number (log_number),
    KEY idx_log_occurred  (occurred_at),
    KEY idx_log_entity    (entity_type, entity_id),
    KEY idx_log_actor     (actor_id),
    KEY idx_log_branch    (branch_id),
    KEY idx_log_module    (module),
    KEY idx_log_action    (action_code),
    CONSTRAINT fk_log_actor  FOREIGN KEY (actor_id)  REFERENCES employees(id) ON DELETE SET NULL,
    CONSTRAINT fk_log_branch FOREIGN KEY (branch_id) REFERENCES branches(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_action_logs_before_insert
BEFORE INSERT ON action_logs
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- Immutability: block UPDATE
DELIMITER $$
CREATE TRIGGER trg_action_logs_no_update
BEFORE UPDATE ON action_logs
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'action_logs is append-only: UPDATE is not permitted.';
END$$
DELIMITER ;

-- Immutability: block DELETE
DELIMITER $$
CREATE TRIGGER trg_action_logs_no_delete
BEFORE DELETE ON action_logs
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'action_logs is append-only: DELETE is not permitted.';
END$$
DELIMITER ;


-- ============================================================
-- MODULE: NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
    id           CHAR(36)     NOT NULL,
    recipient_id CHAR(36)     NOT NULL,
    title        VARCHAR(200) NOT NULL,
    body         TEXT         NOT NULL,
    channel      ENUM('PUSH','IN_APP','SMS') NOT NULL,
    entity_type  VARCHAR(50)  DEFAULT NULL,
    entity_id    CHAR(36)     DEFAULT NULL,
    is_read      TINYINT(1)   NOT NULL DEFAULT 0,
    read_at      DATETIME     DEFAULT NULL,
    sent_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_notif_recipient_read (recipient_id, is_read),
    CONSTRAINT fk_notif_recipient FOREIGN KEY (recipient_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_notif_before_insert
BEFORE INSERT ON notifications
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;


-- ============================================================
-- SYSTEM CONFIGURATION
-- ============================================================

CREATE TABLE system_config (
    id           CHAR(36)     NOT NULL,
    branch_id    CHAR(36)     DEFAULT NULL,
    config_key   VARCHAR(150) NOT NULL,
    config_value TEXT         NOT NULL,
    description  TEXT         DEFAULT NULL,
    updated_by   CHAR(36)     DEFAULT NULL,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_config_branch_key (branch_id, config_key),
    CONSTRAINT fk_cfg_branch     FOREIGN KEY (branch_id)  REFERENCES branches(id)  ON DELETE CASCADE,
    CONSTRAINT fk_cfg_updated_by FOREIGN KEY (updated_by) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_cfg_before_insert
BEFORE INSERT ON system_config
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- Seed defaults
INSERT INTO system_config (id, branch_id, config_key, config_value, description) VALUES
(UUID(), NULL, 'SLA_NORMAL_HOURS',          '24',  'SLA window for NORMAL priority tickets (hours)'),
(UUID(), NULL, 'SLA_URGENT_HOURS',           '8',   'SLA window for URGENT priority tickets (hours)'),
(UUID(), NULL, 'SLA_CRITICAL_HOURS',         '4',   'SLA window for CRITICAL priority tickets (hours)'),
(UUID(), NULL, 'AUTO_ASSIGN_TIMEOUT_MIN',    '10',  'Minutes for engineer to accept before auto-reassign'),
(UUID(), NULL, 'ENGINEER_NOSHOW_MIN',        '30',  'Minutes from assign to EN_ROUTE before no-show alert'),
(UUID(), NULL, 'TICKET_ESCALATE_DAYS',       '3',   'Days unresolved before Manager escalation'),
(UUID(), NULL, 'ARRIVAL_OTP_EXPIRY_MIN',     '10',  'Arrival OTP validity window (minutes)'),
(UUID(), NULL, 'ARRIVAL_OTP_MAX_ATTEMPTS',   '3',   'Max failed attempts for arrival OTP before lockout'),
(UUID(), NULL, 'AUTH_OTP_EXPIRY_MIN',        '5',   'Auth/login OTP validity window (minutes)'),
(UUID(), NULL, 'CLOSE_CODE_EXPIRY_HOURS',    '24',  'Close code validity window (hours)'),
(UUID(), NULL, 'SESSION_PERSIST_DAYS',       '30',  'Engineer app session persistence (days)'),
(UUID(), NULL, 'LOW_STOCK_DEFAULT_THRESHOLD','5',   'Default low-stock alert threshold (units)');


-- ============================================================
-- SLA CONFIGURATION
-- ============================================================

CREATE TABLE sla_config (
    id           CHAR(36) NOT NULL,
    branch_id    CHAR(36) DEFAULT NULL,
    service_type ENUM('REPAIR','PICKUP','REPLACEMENT','INSTALLATION',
                      'DEINSTALLATION','MISC_SERV') NOT NULL,
    priority     ENUM('NORMAL','URGENT','CRITICAL') NOT NULL,
    sla_hours    INT      NOT NULL,
    updated_by   CHAR(36) DEFAULT NULL,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sla_branch_type_priority (branch_id, service_type, priority),
    CONSTRAINT fk_sla_branch     FOREIGN KEY (branch_id)  REFERENCES branches(id)  ON DELETE CASCADE,
    CONSTRAINT fk_sla_updated_by FOREIGN KEY (updated_by) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_sla_before_insert
BEFORE INSERT ON sla_config
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- MERCHANT MODULE
CREATE TABLE merchants (
    id              CHAR(36)     NOT NULL,
    merchant_code   VARCHAR(30)  NOT NULL,
    full_name       VARCHAR(200) NOT NULL,
    business_name   VARCHAR(200) DEFAULT NULL,
    mobile          VARCHAR(20)  NOT NULL,
    pincode         VARCHAR(10)  NOT NULL,
    address         TEXT         NOT NULL,
    branch_id       CHAR(36)     NOT NULL,
    status          ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    -- Forward-compatible for future merchant portal (not used in this build)
    email           VARCHAR(150) DEFAULT NULL,
    password_hash   TEXT         DEFAULT NULL,
    last_login_at   DATETIME     DEFAULT NULL,
    -- Metadata
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

-- UUID trigger
DELIMITER $$
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
END$$
DELIMITER ;
CREATE SEQUENCE IF NOT EXISTS seq_merchant START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE TABLE merchant_machine_assignments (
    id            CHAR(36)  NOT NULL,
    merchant_id   CHAR(36)  NOT NULL,
    machine_id    CHAR(36)  NOT NULL,
    assigned_by   CHAR(36)  DEFAULT NULL,
    assigned_at   DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    unassigned_by CHAR(36)  DEFAULT NULL,
    unassigned_at DATETIME  DEFAULT NULL,   -- NULL = currently active assignment
    notes         TEXT      DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_mma_merchant (merchant_id),
    KEY idx_mma_machine  (machine_id),
    CONSTRAINT fk_mma_merchant     FOREIGN KEY (merchant_id)   REFERENCES merchants(id) ON DELETE CASCADE,
    CONSTRAINT fk_mma_machine      FOREIGN KEY (machine_id)    REFERENCES machines(id),
    CONSTRAINT fk_mma_assigned_by  FOREIGN KEY (assigned_by)   REFERENCES employees(id) ON DELETE SET NULL,
    CONSTRAINT fk_mma_unassigned_by FOREIGN KEY (unassigned_by) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_mma_before_insert
BEFORE INSERT ON merchant_machine_assignments
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN SET NEW.id = UUID(); END IF;
END$$
DELIMITER ;

-- ============================================================
-- REPORTING VIEWS
-- ============================================================

CREATE OR REPLACE VIEW v_ticket_ageing AS
SELECT
    t.id,
    t.ticket_number,
    t.branch_id,
    t.service_type,
    t.status,
    t.priority,
    t.assigned_engineer_id,
    t.sla_due_at,
    t.sla_breached,
    TIMESTAMPDIFF(HOUR, t.created_at, NOW()) AS age_hours
FROM tickets t
WHERE t.status NOT IN ('CLOSED','CANCELLED')
ORDER BY age_hours DESC;

-- -------------------------------------------------------

CREATE OR REPLACE VIEW v_branch_stock_summary AS
SELECT
    b.id         AS branch_id,
    b.branch_name,
    si.category,
    si.state,
    COUNT(si.id) AS item_count
FROM branches b
LEFT JOIN stock_items si ON si.branch_id = b.id
GROUP BY b.id, b.branch_name, si.category, si.state;

-- -------------------------------------------------------

CREATE OR REPLACE VIEW v_overdue_transits AS
SELECT
    t.id,
    t.transit_number,
    t.transit_type,
    t.branch_id,
    t.status,
    t.expected_arrival,
    DATEDIFF(CURDATE(), t.expected_arrival) AS days_overdue
FROM transits t
WHERE t.status NOT IN ('DELIVERED','CANCELLED','PARTIALLY_DELIVERED')
  AND t.expected_arrival < CURDATE()
ORDER BY days_overdue DESC;

-- -------------------------------------------------------

CREATE OR REPLACE VIEW v_low_stock_alerts AS
SELECT
    sp.id,
    sp.part_name,
    sp.part_code,
    sp.branch_id,
    b.branch_name,
    sp.quantity,
    sp.low_stock_threshold
FROM spare_parts sp
JOIN branches b ON b.id = sp.branch_id
WHERE sp.quantity <= sp.low_stock_threshold;

-- -------------------------------------------------------

CREATE OR REPLACE VIEW v_engineer_availability AS
SELECT
    e.id            AS engineer_id,
    e.full_name,
    e.branch_id,
    e.status        AS employee_status,
    a.status        AS attendance_status,
    COUNT(t.id)     AS active_jobs
FROM employees e
LEFT JOIN attendance a
       ON a.employee_id = e.id AND a.attendance_date = CURDATE()
LEFT JOIN tickets t
       ON t.assigned_engineer_id = e.id
      AND t.status IN ('ASSIGNED','EN_ROUTE','ARRIVED_PENDING','IN_PROGRESS')
WHERE e.role = 'ENGINEER'
GROUP BY e.id, e.full_name, e.branch_id, e.status, a.status;


-- ============================================================
-- ENGINEER KPI
-- Computed at runtime by the backend application layer.
-- Use this query in your backend service:
--
-- SELECT
--     e.id                                              AS engineer_id,
--     e.full_name,
--     e.branch_id,
--     COUNT(CASE WHEN t.status = 'CLOSED' THEN 1 END)   AS total_closed,
--     COUNT(CASE WHEN t.status = 'CLOSED'
--                AND DATE_FORMAT(t.closed_at,'%Y-%m') = DATE_FORMAT(NOW(),'%Y-%m')
--           THEN 1 END)                                 AS closed_this_month,
--     ROUND(AVG(CASE WHEN t.status = 'CLOSED'
--               THEN TIMESTAMPDIFF(MINUTE, t.created_at, t.closed_at) / 60.0
--               END), 2)                                AS avg_resolution_hours,
--     COUNT(CASE WHEN t.sla_breached = 1 THEN 1 END)   AS sla_breach_count,
--     COUNT(CASE WHEN t.arrival_otp_fallback_used = 1
--           THEN 1 END)                                 AS fallback_otp_count,
--     ROUND(AVG(t.feedback_rating), 2)                  AS avg_csat
-- FROM employees e
-- LEFT JOIN tickets t ON t.assigned_engineer_id = e.id
-- WHERE e.role = 'ENGINEER'
-- GROUP BY e.id, e.full_name, e.branch_id;
-- ============================================================


-- ============================================================
-- RE-ENABLE FK CHECKS
-- ============================================================
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- END OF SCHEMA
-- ============================================================