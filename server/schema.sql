CREATE DATABASE IF NOT EXISTS stock_game
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE stock_game;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nickname VARCHAR(80) NOT NULL UNIQUE,
  cash_balance DECIMAL(15, 2) NOT NULL DEFAULT 100000000.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS holdings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  stock_code VARCHAR(20) NOT NULL,
  stock_name VARCHAR(120) NOT NULL,
  quantity INT NOT NULL,
  avg_price DECIMAL(15, 2) NOT NULL,
  UNIQUE KEY unique_user_stock (user_id, stock_code),
  CONSTRAINT fk_holdings_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  stock_code VARCHAR(20) NOT NULL,
  stock_name VARCHAR(120) NOT NULL,
  type ENUM('BUY', 'SELL') NOT NULL,
  quantity INT NOT NULL,
  price DECIMAL(15, 2) NOT NULL,
  total_amount DECIMAL(15, 2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_trades_user_created (user_id, created_at),
  CONSTRAINT fk_trades_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_prices (
  stock_code VARCHAR(20) PRIMARY KEY,
  stock_name VARCHAR(120) NOT NULL,
  sector VARCHAR(80) NOT NULL DEFAULT '기타',
  price DECIMAL(15, 2) NOT NULL,
  price_change DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  change_rate DECIMAL(10, 4) NOT NULL DEFAULT 0.0000,
  fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_price_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  stock_code VARCHAR(20) NOT NULL,
  stock_name VARCHAR(120) NOT NULL,
  sector VARCHAR(80) NOT NULL DEFAULT '기타',
  price DECIMAL(15, 2) NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_stock_history_code_time (stock_code, recorded_at)
);

CREATE TABLE IF NOT EXISTS asset_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  cash_balance DECIMAL(15, 2) NOT NULL,
  stock_value DECIMAL(15, 2) NOT NULL,
  total_asset DECIMAL(15, 2) NOT NULL,
  return_rate DECIMAL(10, 4) NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_asset_history_user_time (user_id, recorded_at),
  CONSTRAINT fk_asset_history_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS announcements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  content TEXT NOT NULL,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  is_important TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_announcements_visible_created (is_visible, is_important, created_at)
);
