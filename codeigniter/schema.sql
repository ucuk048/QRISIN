-- Skema Database Multi-Tenant SaaS Payment Gateway untuk CodeIgniter (MySQL / MariaDB)

CREATE TABLE IF NOT EXISTS `merchants` (
  `id` VARCHAR(64) PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(64) NULL,
  `server_key` VARCHAR(191) NOT NULL UNIQUE,
  `client_key` VARCHAR(191) NOT NULL UNIQUE,
  `webhook_secret` VARCHAR(191) NOT NULL,
  `webhook_url` TEXT NULL,
  `provider` VARCHAR(64) DEFAULT 'platform',
  `custom_qris` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `qrispay_transactions` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `qris_id` VARCHAR(64) NOT NULL UNIQUE,
  `merchant_id` VARCHAR(64) NOT NULL DEFAULT 'mid_default',
  `order_id` VARCHAR(191) NOT NULL,
  `amount` BIGINT UNSIGNED NOT NULL,
  `unique_code` INT UNSIGNED NOT NULL,
  `total` BIGINT UNSIGNED NOT NULL,
  `mdr_fee` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `net_amount` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `status` ENUM('pending', 'paid', 'expired', 'cancelled') NOT NULL DEFAULT 'pending',
  `qris_string` TEXT NOT NULL,
  `payment_link` VARCHAR(500) NOT NULL,
  `customer_name` VARCHAR(191) NULL,
  `description` TEXT NULL,
  `paid_at` DATETIME NULL,
  `expires_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_merchant_id` (`merchant_id`),
  INDEX `idx_order_id` (`order_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_total` (`total`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
