-- Add new optional fields to tickets
ALTER TABLE tickets
ADD COLUMN mcc_code VARCHAR(50) DEFAULT NULL AFTER merchant_email,
ADD COLUMN zone_name VARCHAR(100) DEFAULT NULL AFTER mcc_code,
ADD COLUMN sponsor_bank VARCHAR(100) DEFAULT NULL AFTER zone_name,
ADD COLUMN mid VARCHAR(50) DEFAULT NULL AFTER sponsor_bank;

-- Add new optional fields to merchants
ALTER TABLE merchants
ADD COLUMN mcc_code VARCHAR(50) DEFAULT NULL AFTER status,
ADD COLUMN zone_name VARCHAR(100) DEFAULT NULL AFTER mcc_code,
ADD COLUMN sponsor_bank VARCHAR(100) DEFAULT NULL AFTER zone_name,
ADD COLUMN mid VARCHAR(50) DEFAULT NULL AFTER sponsor_bank;
