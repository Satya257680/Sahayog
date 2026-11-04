-- Sahayog database schema (MySQL 8+ / MariaDB 10.5+)
-- Safe to run repeatedly: every statement uses IF NOT EXISTS.
-- Run with:  npm run migrate   (from the server folder)

CREATE TABLE IF NOT EXISTS users (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  email           VARCHAR(190) NOT NULL,
  password_hash   VARCHAR(255) NULL,                -- NULL for Google/Facebook-only accounts
  email_verified  TINYINT(1)   NOT NULL DEFAULT 0,
  token_version   BIGINT UNSIGNED NOT NULL DEFAULT 0,  -- bumped on password reset / logout-everywhere
  phone           VARCHAR(30)  NULL,
  city            VARCHAR(100) NULL,
  state           VARCHAR(100) NULL,
  last_login_at   DATETIME     NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sign-ups waiting for email OTP verification. A real user row is only created after the OTP is verified.
CREATE TABLE IF NOT EXISTS pending_registrations (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email          VARCHAR(190) NOT NULL,
  name           VARCHAR(100) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  otp_hash       CHAR(64)     NOT NULL,             -- HMAC-SHA256 of the OTP, never the OTP itself
  otp_expires_at DATETIME     NOT NULL,
  attempts       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  send_count     TINYINT UNSIGNED NOT NULL DEFAULT 1,
  window_started_at DATETIME  NOT NULL,
  last_sent_at   DATETIME     NOT NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pending_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Forgot-password challenges (one active challenge per user).
CREATE TABLE IF NOT EXISTS password_resets (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id            BIGINT UNSIGNED NOT NULL,
  otp_hash           CHAR(64)     NOT NULL,
  otp_expires_at     DATETIME     NOT NULL,
  attempts           TINYINT UNSIGNED NOT NULL DEFAULT 0,
  send_count         TINYINT UNSIGNED NOT NULL DEFAULT 1,
  window_started_at  DATETIME     NOT NULL,
  last_sent_at       DATETIME     NOT NULL,
  reset_token_hash   CHAR(64)     NULL,             -- issued after OTP is verified, single use
  reset_token_expires_at DATETIME NULL,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reset_user (user_id),
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Google / Facebook identities linked to a user.
CREATE TABLE IF NOT EXISTS oauth_identities (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id           BIGINT UNSIGNED NOT NULL,
  provider          ENUM('google','facebook') NOT NULL,
  provider_user_id  VARCHAR(191) NOT NULL,
  email             VARCHAR(190) NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_identity (provider, provider_user_id),
  KEY idx_oauth_user (user_id),
  CONSTRAINT fk_oauth_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Security-relevant events (never contains passwords or OTPs).
CREATE TABLE IF NOT EXISTS auth_events (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NULL,
  email       VARCHAR(190) NULL,
  event       VARCHAR(50)  NOT NULL,
  ip          VARCHAR(64)  NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_auth_events_user (user_id),
  KEY idx_auth_events_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS listings (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id          BIGINT UNSIGNED NOT NULL,
  type             ENUM('give','need') NOT NULL,
  title            VARCHAR(120) NOT NULL,
  category         ENUM('books','clothes','food','medicine','blood','other') NOT NULL,
  description      TEXT NOT NULL,
  condition_label  VARCHAR(40)  NOT NULL DEFAULT 'Good',
  quantity         VARCHAR(80)  NOT NULL DEFAULT '1',
  location         VARCHAR(180) NOT NULL,
  image_url        VARCHAR(1000) NULL,
  status           ENUM('active','completed','removed') NOT NULL DEFAULT 'active',
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_listings_status_created (status, created_at),
  KEY idx_listings_user (user_id),
  KEY idx_listings_category (category),
  CONSTRAINT fk_listings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS saved_listings (
  user_id     BIGINT UNSIGNED NOT NULL,
  listing_id  BIGINT UNSIGNED NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, listing_id),
  KEY idx_saved_listing (listing_id),
  CONSTRAINT fk_saved_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_saved_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversations (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  listing_id       BIGINT UNSIGNED NOT NULL,
  participant_one  BIGINT UNSIGNED NOT NULL,   -- always the smaller user id
  participant_two  BIGINT UNSIGNED NOT NULL,   -- always the larger user id
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_conversation (listing_id, participant_one, participant_two),
  KEY idx_conv_p1 (participant_one),
  KEY idx_conv_p2 (participant_two),
  CONSTRAINT fk_conv_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
  CONSTRAINT fk_conv_p1 FOREIGN KEY (participant_one) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_conv_p2 FOREIGN KEY (participant_two) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  conversation_id  BIGINT UNSIGNED NOT NULL,
  sender_id        BIGINT UNSIGNED NOT NULL,
  body             TEXT NOT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_messages_conv (conversation_id, created_at),
  CONSTRAINT fk_msg_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
