-- F-Gateway Database Schema
-- Database: Neon PostgreSQL
-- Version: 1.0
-- Last Updated: 2026-01-28

-- ============================================================================
-- System Tables (システムテーブル)
-- ============================================================================

-- システム設定テーブル
CREATE TABLE system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key VARCHAR(50) UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE system_settings IS 'システム設定（Asanaトークン等）';
COMMENT ON COLUMN system_settings.setting_key IS '設定キー（asana_api_token等）';
COMMENT ON COLUMN system_settings.setting_value IS '設定値（暗号化して保存）';

-- ============================================================================
-- Master Tables (マスタテーブル)
-- ============================================================================

-- クライアントマスタ
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code VARCHAR(3) UNIQUE NOT NULL,
  client_name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE clients IS 'クライアントマスタ';
COMMENT ON COLUMN clients.client_code IS 'クライアントコード（DAQ, MNG等）';

CREATE INDEX idx_clients_code ON clients(client_code);
CREATE INDEX idx_clients_active ON clients(is_active);

-- ユーザーマスタ
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  google_email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'client')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE users IS 'ユーザーマスタ';
COMMENT ON COLUMN users.client_id IS 'クライアントID（Adminの場合はnull）';
COMMENT ON COLUMN users.role IS 'ロール（admin / client）';

CREATE INDEX idx_users_client_id ON users(client_id);
CREATE INDEX idx_users_email ON users(google_email);
CREATE INDEX idx_users_role ON users(role);

-- クライアント別Google Drive設定
CREATE TABLE client_google_drives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  drive_type VARCHAR(30) NOT NULL CHECK (drive_type IN ('shipping_plan', 'shipping_result', 'receiving_plan', 'receiving_result', 'item_master')),
  google_account VARCHAR(255) NOT NULL,
  folder_id VARCHAR(100) NOT NULL,
  folder_name VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(client_id, drive_type)
);

COMMENT ON TABLE client_google_drives IS 'クライアント別Google Drive設定';
COMMENT ON COLUMN client_google_drives.drive_type IS '用途（shipping_plan, shipping_result, receiving_plan, receiving_result, item_master）';

CREATE INDEX idx_client_google_drives_client_id ON client_google_drives(client_id);
CREATE INDEX idx_client_google_drives_type ON client_google_drives(drive_type);

-- クライアント別Asana設定
CREATE TABLE client_asana_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  asana_project_url VARCHAR(500) NOT NULL,
  asana_project_gid VARCHAR(50) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(client_id)
);

COMMENT ON TABLE client_asana_settings IS 'クライアント別Asana通知先設定';

CREATE INDEX idx_client_asana_client_id ON client_asana_settings(client_id);

-- CSVマッピング設定
CREATE TABLE csv_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  csv_type VARCHAR(30) NOT NULL CHECK (csv_type IN ('shipping_plan', 'receiving_plan', 'item_master')),
  mapping_name VARCHAR(100) NOT NULL,
  client_columns JSONB NOT NULL,
  mapping_config JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE csv_mappings IS 'CSVマッピング設定';
COMMENT ON COLUMN csv_mappings.client_columns IS 'クライアントCSV列定義（配列）';
COMMENT ON COLUMN csv_mappings.mapping_config IS 'マッピング設定（JSON）';

CREATE INDEX idx_csv_mappings_client_id ON csv_mappings(client_id);
CREATE INDEX idx_csv_mappings_csv_type ON csv_mappings(csv_type);

-- ============================================================================
-- Transaction Tables (トランザクションテーブル)
-- ============================================================================

-- CSV提出ログ
CREATE TABLE csv_upload_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  csv_type VARCHAR(30) NOT NULL CHECK (csv_type IN ('shipping_plan', 'receiving_plan', 'item_master')),
  google_drive_id UUID REFERENCES client_google_drives(id),
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  upload_time TIMESTAMP NOT NULL,
  validation_status VARCHAR(20) NOT NULL CHECK (validation_status IN ('valid', 'invalid')),
  validation_errors JSONB,
  processed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(client_id, work_date, csv_type)
);

COMMENT ON TABLE csv_upload_logs IS 'CSV提出ログ（1日1CSV方式）';
COMMENT ON COLUMN csv_upload_logs.work_date IS '作業日（1日1レコード）';

CREATE INDEX idx_csv_upload_logs_client_id ON csv_upload_logs(client_id);
CREATE INDEX idx_csv_upload_logs_work_date ON csv_upload_logs(work_date);
CREATE INDEX idx_csv_upload_logs_validation_status ON csv_upload_logs(validation_status);

-- CSV変換ログ
CREATE TABLE csv_conversion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_log_id UUID NOT NULL REFERENCES csv_upload_logs(id) ON DELETE CASCADE,
  mapping_id UUID NOT NULL REFERENCES csv_mappings(id),
  detected_encoding VARCHAR(20),
  detected_line_ending VARCHAR(10),
  detected_delimiter VARCHAR(5),
  conversion_status VARCHAR(20) NOT NULL CHECK (conversion_status IN ('success', 'error')),
  conversion_errors JSONB,
  converted_file_path VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE csv_conversion_logs IS 'CSV変換ログ';

CREATE INDEX idx_csv_conversion_logs_upload_log_id ON csv_conversion_logs(upload_log_id);
CREATE INDEX idx_csv_conversion_logs_mapping_id ON csv_conversion_logs(mapping_id);

-- ファイル転送ログ
CREATE TABLE file_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_log_id UUID NOT NULL REFERENCES csv_upload_logs(id) ON DELETE CASCADE,
  source_path VARCHAR(500) NOT NULL,
  dest_path VARCHAR(500) NOT NULL,
  renamed_name VARCHAR(255) NOT NULL,
  transfer_status VARCHAR(20) NOT NULL CHECK (transfer_status IN ('success', 'error')),
  transferred_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE file_transfers IS 'ファイル転送ログ';

CREATE INDEX idx_file_transfers_upload_log_id ON file_transfers(upload_log_id);

-- 実績返却ログ
CREATE TABLE result_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  result_type VARCHAR(30) NOT NULL CHECK (result_type IN ('shipping_result', 'receiving_result')),
  result_file_name VARCHAR(255) NOT NULL,
  record_count INTEGER NOT NULL,
  return_status VARCHAR(20) NOT NULL CHECK (return_status IN ('success', 'error')),
  returned_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE result_returns IS '実績返却ログ';

CREATE INDEX idx_result_returns_client_id ON result_returns(client_id);

-- Asana通知ログ
CREATE TABLE asana_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  asana_task_gid VARCHAR(50),
  asana_response JSONB,
  sent_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE asana_notifications IS 'Asana通知ログ';

CREATE INDEX idx_asana_notifications_client_id ON asana_notifications(client_id);
CREATE INDEX idx_asana_notifications_type ON asana_notifications(notification_type);

-- ============================================================================
-- Item Master Tables (商品マスタテーブル)
-- ============================================================================

-- 商品マスタ項目定義
CREATE TABLE item_master_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_name VARCHAR(50) UNIQUE NOT NULL,
  field_type VARCHAR(20) NOT NULL CHECK (field_type IN ('string', 'integer', 'decimal', 'date')),
  is_required BOOLEAN NOT NULL DEFAULT false,
  default_value TEXT,
  validation_rule JSONB,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE item_master_definitions IS '商品マスタ項目定義（社内標準）';

CREATE INDEX idx_item_master_definitions_order ON item_master_definitions(display_order);

-- クライアント別項目マッピング
CREATE TABLE client_item_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  client_column_name VARCHAR(100) NOT NULL,
  standard_field_name VARCHAR(50) NOT NULL REFERENCES item_master_definitions(field_name),
  transform_rule JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE client_item_mappings IS 'クライアント別項目マッピング';

CREATE INDEX idx_client_item_mappings_client_id ON client_item_mappings(client_id);

-- 商品マスタインポートログ
CREATE TABLE item_import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  import_type VARCHAR(20) NOT NULL CHECK (import_type IN ('manual', 'auto_url')),
  source_type VARCHAR(50) NOT NULL,
  source_url VARCHAR(500),
  file_name VARCHAR(255),
  file_size BIGINT,
  total_rows INTEGER NOT NULL,
  success_rows INTEGER NOT NULL,
  error_rows INTEGER NOT NULL,
  import_status VARCHAR(20) NOT NULL CHECK (import_status IN ('success', 'partial', 'failed')),
  error_details JSONB,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE item_import_logs IS '商品マスタインポートログ';

CREATE INDEX idx_item_import_logs_client_id ON item_import_logs(client_id);
CREATE INDEX idx_item_import_logs_status ON item_import_logs(import_status);

-- クライアント商品マスタ
CREATE TABLE client_item_masters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  import_log_id UUID REFERENCES item_import_logs(id),
  item_code VARCHAR(100) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  jan_code VARCHAR(13),
  internal_item_code VARCHAR(100),
  raw_data JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(client_id, item_code)
);

COMMENT ON TABLE client_item_masters IS 'クライアント商品マスタ';
COMMENT ON COLUMN client_item_masters.raw_data IS '元のCSVデータ（全列を保持）';

CREATE INDEX idx_client_item_masters_client_id ON client_item_masters(client_id);
CREATE INDEX idx_client_item_masters_item_code ON client_item_masters(item_code);
CREATE INDEX idx_client_item_masters_jan_code ON client_item_masters(jan_code);

-- 商品マスタ自動取得設定
CREATE TABLE client_item_sync_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sync_enabled BOOLEAN NOT NULL DEFAULT false,
  source_url VARCHAR(500) NOT NULL,
  auth_type VARCHAR(20) CHECK (auth_type IN ('none', 'basic', 'bearer', 'api_key')),
  auth_credentials TEXT,
  sync_schedule VARCHAR(50) NOT NULL,
  sync_time TIME NOT NULL,
  last_sync_at TIMESTAMP,
  next_sync_at TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(client_id)
);

COMMENT ON TABLE client_item_sync_settings IS '商品マスタ自動取得設定';
COMMENT ON COLUMN client_item_sync_settings.auth_credentials IS '認証情報（暗号化）';

CREATE INDEX idx_client_item_sync_settings_client_id ON client_item_sync_settings(client_id);

-- ============================================================================
-- Triggers for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables with updated_at column
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_client_google_drives_updated_at BEFORE UPDATE ON client_google_drives FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_client_asana_settings_updated_at BEFORE UPDATE ON client_asana_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_csv_mappings_updated_at BEFORE UPDATE ON csv_mappings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_item_master_definitions_updated_at BEFORE UPDATE ON item_master_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_client_item_mappings_updated_at BEFORE UPDATE ON client_item_mappings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_client_item_sync_settings_updated_at BEFORE UPDATE ON client_item_sync_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
