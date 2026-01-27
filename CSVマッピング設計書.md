# F-Gateway CSVマッピング設計書

| 項目 | 内容 |
|------|------|
| 文書番号 | DEV-GATEWAY-CSV-MAPPING-001 |
| 版数 | 1.0 |
| ステータス | 設計完了 |
| 最終更新 | 2026-01-28 |

---

## 1. 概要

### 1.1 目的

F-Gatewayは、クライアントが自由形式で提出するCSVファイルを、WMSポータルなど関連システムが必要とする標準形式に変換する機能を提供します。

### 1.2 提供価値

| 提供価値 | 説明 |
|---------|------|
| **柔軟性** | クライアントは既存のCSV形式をそのまま使用可能 |
| **自動変換** | マッピング設定により、自動で標準形式に変換 |
| **エンコーディング自動検出** | 文字コード・改行コードを自動判定 |
| **視覚的設定** | GUI画面で直感的にマッピング設定 |
| **複数形式対応** | 同一クライアントでも複数のCSV形式に対応可能 |

### 1.3 システム位置づけ

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CSV Mapping System Flow                                  │
└─────────────────────────────────────────────────────────────────────────────┘

  [Client CSV]                [F-Gateway]                [Standard CSV]
  # 自由形式                  # マッピング               # 標準形式

  ┌────────────┐              ┌────────────┐              ┌────────────┐
  │ Any Format │              │  Mapping   │              │  Standard  │
  │            │              │  Engine    │              │  Format    │
  │ - 任意列名 │──(1)Upload─->│            │──(3)Output─->│            │
  │ - 任意順序 │              │ (2)Detect  │              │ - 固定列名 │
  │ - 任意文字 │              │   Encoding │              │ - 固定順序 │
  │   コード   │              │   Mapping  │              │ - UTF-8    │
  │            │              │   Convert  │              │ - CRLF     │
  └────────────┘              └────────────┘              └────────────┘
                                    │
                                    v
                              ┌────────────┐
                              │  Mapping   │
                              │  Config DB │
                              └────────────┘
```

---

## 2. 機能要件

### 2.1 文字コード・改行コード自動検出

| 機能 | 説明 |
|------|------|
| **文字コード自動検出** | UTF-8, Shift_JIS, EUC-JPを自動判定 |
| **改行コード自動検出** | CRLF, LF, CRを自動判定 |
| **BOM対応** | BOM付きUTF-8に対応 |
| **バリデーション** | 文字化け検出時はエラー通知 |

**検出ロジック**:

```typescript
function detectEncoding(buffer: Buffer): string {
  // BOMチェック
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return 'UTF-8-BOM';
  }

  // chardet ライブラリで自動検出
  const detected = chardet.detect(buffer);
  return detected || 'UTF-8';
}

function detectLineEnding(content: string): string {
  const crlfCount = (content.match(/\r\n/g) || []).length;
  const lfCount = (content.match(/(?<!\r)\n/g) || []).length;
  const crCount = (content.match(/\r(?!\n)/g) || []).length;

  if (crlfCount > Math.max(lfCount, crCount)) return 'CRLF';
  if (lfCount > Math.max(crlfCount, crCount)) return 'LF';
  if (crCount > Math.max(crlfCount, lfCount)) return 'CR';
  return 'CRLF'; // default
}
```

### 2.2 CSVパース（柔軟対応）

| 機能 | 説明 |
|------|------|
| **区切り文字自動検出** | カンマ、タブ、セミコロンを自動判定 |
| **引用符処理** | ダブルクォートで囲まれた値に対応 |
| **エスケープ処理** | `""`（二重ダブルクォート）のエスケープに対応 |
| **空行スキップ** | 空行を無視 |
| **ヘッダー行検出** | 1行目をヘッダーとして扱う |

**対応形式**:

```csv
# カンマ区切り
商品コード,商品名,数量
DAQ-001,T-Shirt White S,10

# タブ区切り
商品コード	商品名	数量
DAQ-001	T-Shirt White S	10

# ダブルクォート囲み
"商品コード","商品名","数量"
"DAQ-001","T-Shirt White S","10"

# ダブルクォート内カンマ
商品コード,商品名,備考
DAQ-001,T-Shirt White S,"サイズ: S, カラー: White"
```

### 2.3 マッピング設定UI

クライアント管理画面で、Admin側が視覚的にマッピングを設定します。

#### 2.3.1 設定フロー

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Mapping Configuration Flow                               │
└─────────────────────────────────────────────────────────────────────────────┘

  [Admin]                                              [F-Gateway DB]

  (1) Upload Sample CSV
      │
      v
  ┌──────────────────┐
  │ Parse & Detect   │
  │ - Encoding       │
  │ - Line Ending    │
  │ - Delimiter      │
  │ - Header Columns │
  └────────┬─────────┘
           │
           v
  (2) Show Mapping UI
      │
      v
  ┌──────────────────────────────────────┐
  │ Client CSV       Standard CSV        │
  │ ────────────     ────────────        │
  │ 商品コード   --> item_code            │
  │ 商品名       --> item_name            │
  │ JANコード    --> jan_code             │
  │ 数量         --> quantity             │
  │ 備考         --> (ignore)             │
  └────────┬─────────────────────────────┘
           │
           v
  (3) Save Mapping Config
      │
      v
  ┌──────────────────┐
  │ csv_mappings     │
  │ テーブルに保存   │
  └──────────────────┘
```

#### 2.3.2 マッピングUI画面

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  F-Gateway Admin > Clients > DAQ > CSV Mapping      [Admin] [Logout]       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CSVマッピング設定: 出庫予定                                                │
│                                                                             │
│  ┌─── サンプルCSVアップロード ───────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  [ファイルを選択] または ドラッグ&ドロップ                             │  │
│  │                                                                       │  │
│  │  ✅ shipping_sample.csv (2.5KB)                                        │  │
│  │     文字コード: Shift_JIS  改行コード: CRLF  区切り文字: カンマ       │  │
│  │     検出ヘッダー: 商品コード, 商品名, JANコード, 数量, 備考           │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─── マッピング設定 ─────────────────────────────────────────────────┐    │
│  │                                                                       │  │
│  │  クライアントCSV列        必須項目         標準CSV列                  │  │
│  │  ───────────────────     ──────         ──────────                  │  │
│  │  商品コード               [必須]    -->   item_code                   │  │
│  │  商品名                   [必須]    -->   item_name                   │  │
│  │  JANコード                [任意]    -->   jan_code                    │  │
│  │  数量                     [必須]    -->   quantity                    │  │
│  │  備考                     [任意]    -->   (マッピングなし)            │  │
│  │                                                                       │  │
│  │  [+] 列を追加                                                         │  │
│  │                                                                       │  │
│  │  ─────────────────────────────────────────────────────────────────  │  │
│  │                                                                       │  │
│  │  標準CSVプレビュー:                                                   │  │
│  │                                                                       │  │
│  │  item_code  | item_name        | jan_code     | quantity            │  │
│  │  ────────────────────────────────────────────────────────────────   │  │
│  │  DAQ-001    | T-Shirt White S  | 4901234567890| 10                  │  │
│  │  DAQ-002    | T-Shirt White M  | 4901234567891| 20                  │  │
│  │  DAQ-003    | T-Shirt White L  | 4901234567892| 15                  │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─── 標準CSV形式の必須項目 ──────────────────────────────────────────┐    │
│  │                                                                       │  │
│  │  出庫予定CSV:                                                         │  │
│  │  - item_code (必須): 商品コード                                       │  │
│  │  - item_name (必須): 商品名                                           │  │
│  │  - quantity (必須): 数量                                              │  │
│  │  - jan_code (任意): JANコード                                         │  │
│  │  - delivery_date (任意): 出庫希望日                                   │  │
│  │  - remarks (任意): 備考                                               │  │
│  │                                                                       │  │
│  │  入庫予定CSV:                                                         │  │
│  │  - item_code (必須): 商品コード                                       │  │
│  │  - item_name (必須): 商品名                                           │  │
│  │  - quantity (必須): 数量                                              │  │
│  │  - jan_code (任意): JANコード                                         │  │
│  │  - arrival_date (任意): 入庫予定日                                    │  │
│  │  - remarks (任意): 備考                                               │  │
│  │                                                                       │  │
│  │  商品マスタCSV:                                                       │  │
│  │  - item_code (必須): 商品コード                                       │  │
│  │  - item_name (必須): 商品名                                           │  │
│  │  - jan_code (任意): JANコード                                         │  │
│  │  - weight (任意): 重量(g)                                             │  │
│  │  - size_width (任意): 幅(cm)                                          │  │
│  │  - size_depth (任意): 奥行(cm)                                        │  │
│  │  - size_height (任意): 高さ(cm)                                       │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│                                          [キャンセル]  [保存して検証実行]   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 マッピング変換処理

#### 2.4.1 処理フロー

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CSV Mapping Conversion Flow                              │
└─────────────────────────────────────────────────────────────────────────────┘

  [Client CSV]                                              [Standard CSV]

  (1) Upload
      │
      v
  ┌──────────────────┐
  │ Detect Encoding  │  # 文字コード自動検出
  │ & Line Ending    │  # 改行コード自動検出
  └────────┬─────────┘
           │
           v
  ┌──────────────────┐
  │ Convert to UTF-8 │  # UTF-8に統一変換
  └────────┬─────────┘
           │
           v
  ┌──────────────────┐
  │ Parse CSV        │  # CSVパース
  │ Detect Delimiter │  # 区切り文字検出
  └────────┬─────────┘
           │
           v
  ┌──────────────────┐
  │ Load Mapping     │  # DB からマッピング設定取得
  │ Config from DB   │
  └────────┬─────────┘
           │
           v
  ┌──────────────────┐
  │ Apply Mapping    │  # マッピング適用
  │ & Validation     │  # 必須項目チェック
  └────────┬─────────┘
           │
           ├───> [Validation Error] --> Asana Notify
           │
           v
  ┌──────────────────┐
  │ Generate         │  # 標準CSV生成
  │ Standard CSV     │  # UTF-8 + CRLF
  └────────┬─────────┘
           │
           v
  ┌──────────────────┐
  │ Transfer to      │  # 社内Google Driveへ転送
  │ Friendslogi      │
  │ Google Drive     │
  └──────────────────┘
```

#### 2.4.2 バリデーション

| バリデーション項目 | 説明 |
|------------------|------|
| **必須項目チェック** | マッピング設定で必須指定された項目が空でないか |
| **データ型チェック** | 数値項目に数値が入っているか |
| **文字長チェック** | 最大文字数を超えていないか |
| **重複チェック** | 商品コード等のユニークキーが重複していないか |
| **日付形式チェック** | 日付項目が正しい形式か（YYYY-MM-DD等） |

**エラー時の動作**:

- Asanaにエラー通知
- エラー詳細をログに記録
- クライアントCSVは社内転送しない

---

## 3. データモデル設計

### 3.1 テーブル追加

#### csv_mappings（CSVマッピング設定）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid | 主キー |
| client_id | uuid | クライアントID（FK） |
| csv_type | varchar(30) | CSV種別（shipping_plan, receiving_plan, item_master） |
| mapping_name | varchar(100) | マッピング名（「デフォルト」「新形式」等） |
| client_columns | jsonb | クライアントCSV列定義（配列） |
| mapping_config | jsonb | マッピング設定（JSON） |
| is_active | boolean | 有効フラグ |
| created_at | timestamp | 作成日時 |
| updated_at | timestamp | 更新日時 |

**client_columns 例**:

```json
[
  "商品コード",
  "商品名",
  "JANコード",
  "数量",
  "備考"
]
```

**mapping_config 例**:

```json
{
  "encoding": "auto",
  "lineEnding": "auto",
  "delimiter": "auto",
  "mappings": [
    {
      "clientColumn": "商品コード",
      "standardColumn": "item_code",
      "required": true,
      "dataType": "string",
      "maxLength": 50
    },
    {
      "clientColumn": "商品名",
      "standardColumn": "item_name",
      "required": true,
      "dataType": "string",
      "maxLength": 255
    },
    {
      "clientColumn": "JANコード",
      "standardColumn": "jan_code",
      "required": false,
      "dataType": "string",
      "maxLength": 13
    },
    {
      "clientColumn": "数量",
      "standardColumn": "quantity",
      "required": true,
      "dataType": "integer",
      "min": 1
    },
    {
      "clientColumn": "備考",
      "standardColumn": null,
      "required": false
    }
  ]
}
```

#### csv_conversion_logs（CSV変換ログ）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid | 主キー |
| upload_log_id | uuid | CSV提出ログID（FK） |
| mapping_id | uuid | 使用したマッピング設定ID（FK） |
| detected_encoding | varchar(20) | 検出された文字コード |
| detected_line_ending | varchar(10) | 検出された改行コード |
| detected_delimiter | varchar(5) | 検出された区切り文字 |
| conversion_status | varchar(20) | 変換ステータス（success, error） |
| conversion_errors | jsonb | 変換エラー詳細 |
| converted_file_path | varchar(500) | 変換後ファイルパス |
| created_at | timestamp | 作成日時 |

### 3.2 データベーススキーマ更新

```sql
-- CSVマッピング設定テーブル
CREATE TABLE csv_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  csv_type VARCHAR(30) NOT NULL,
  mapping_name VARCHAR(100) NOT NULL,
  client_columns JSONB NOT NULL,
  mapping_config JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_csv_mappings_client_id ON csv_mappings(client_id);
CREATE INDEX idx_csv_mappings_csv_type ON csv_mappings(csv_type);

-- CSV変換ログテーブル
CREATE TABLE csv_conversion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_log_id UUID NOT NULL REFERENCES csv_upload_logs(id) ON DELETE CASCADE,
  mapping_id UUID NOT NULL REFERENCES csv_mappings(id),
  detected_encoding VARCHAR(20),
  detected_line_ending VARCHAR(10),
  detected_delimiter VARCHAR(5),
  conversion_status VARCHAR(20) NOT NULL,
  conversion_errors JSONB,
  converted_file_path VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_csv_conversion_logs_upload_log_id ON csv_conversion_logs(upload_log_id);
CREATE INDEX idx_csv_conversion_logs_mapping_id ON csv_conversion_logs(mapping_id);
```

---

## 4. 標準CSV形式仕様

### 4.1 出庫予定CSV

| 列名 | データ型 | 必須 | 最大長 | 説明 |
|------|---------|------|--------|------|
| item_code | string | ○ | 50 | 商品コード |
| item_name | string | ○ | 255 | 商品名 |
| quantity | integer | ○ | - | 数量（1以上） |
| jan_code | string | - | 13 | JANコード |
| delivery_date | date | - | - | 出庫希望日（YYYY-MM-DD） |
| remarks | string | - | 500 | 備考 |

**例**:

```csv
item_code,item_name,quantity,jan_code,delivery_date,remarks
DAQ-001,T-Shirt White S,10,4901234567890,2026-01-30,
DAQ-002,T-Shirt White M,20,4901234567891,2026-01-30,
```

### 4.2 入庫予定CSV

| 列名 | データ型 | 必須 | 最大長 | 説明 |
|------|---------|------|--------|------|
| item_code | string | ○ | 50 | 商品コード |
| item_name | string | ○ | 255 | 商品名 |
| quantity | integer | ○ | - | 数量（1以上） |
| jan_code | string | - | 13 | JANコード |
| arrival_date | date | - | - | 入庫予定日（YYYY-MM-DD） |
| remarks | string | - | 500 | 備考 |

**例**:

```csv
item_code,item_name,quantity,jan_code,arrival_date,remarks
DAQ-001,T-Shirt White S,100,4901234567890,2026-02-01,初回入荷
DAQ-002,T-Shirt White M,200,4901234567891,2026-02-01,初回入荷
```

### 4.3 商品マスタCSV

| 列名 | データ型 | 必須 | 最大長 | 説明 |
|------|---------|------|--------|------|
| item_code | string | ○ | 50 | 商品コード |
| item_name | string | ○ | 255 | 商品名 |
| jan_code | string | - | 13 | JANコード |
| weight | decimal | - | - | 重量（g） |
| size_width | decimal | - | - | 幅（cm） |
| size_depth | decimal | - | - | 奥行（cm） |
| size_height | decimal | - | - | 高さ（cm） |

**例**:

```csv
item_code,item_name,jan_code,weight,size_width,size_depth,size_height
DAQ-001,T-Shirt White S,4901234567890,150,20,25,1
DAQ-002,T-Shirt White M,4901234567891,160,21,26,1
```

### 4.4 標準CSV共通仕様

| 項目 | 仕様 |
|------|------|
| **文字コード** | UTF-8（BOMなし） |
| **改行コード** | CRLF（`\r\n`） |
| **区切り文字** | カンマ（`,`） |
| **ヘッダー行** | 1行目に列名を記載 |
| **引用符** | フィールドに改行・カンマが含まれる場合はダブルクォートで囲む |
| **エスケープ** | ダブルクォート内のダブルクォートは `""` でエスケープ |

---

## 5. 実装技術

### 5.1 使用ライブラリ

| ライブラリ | 用途 | npm パッケージ |
|-----------|------|---------------|
| **chardet** | 文字コード自動検出 | `chardet` |
| **iconv-lite** | 文字コード変換 | `iconv-lite` |
| **PapaParse** | CSVパース | `papaparse` |
| **csv-stringify** | CSV生成 | `csv-stringify` |
| **zod** | バリデーション | `zod` |

### 5.2 実装例（TypeScript）

#### 5.2.1 文字コード・改行コード検出

```typescript
import chardet from 'chardet';
import iconv from 'iconv-lite';

interface DetectionResult {
  encoding: string;
  lineEnding: 'CRLF' | 'LF' | 'CR';
  content: string;
}

async function detectAndConvert(buffer: Buffer): Promise<DetectionResult> {
  // 文字コード検出
  const detected = chardet.detect(buffer);
  const encoding = detected || 'UTF-8';

  // UTF-8に変換
  const content = iconv.decode(buffer, encoding);

  // 改行コード検出
  const crlfCount = (content.match(/\r\n/g) || []).length;
  const lfCount = (content.match(/(?<!\r)\n/g) || []).length;
  const crCount = (content.match(/\r(?!\n)/g) || []).length;

  let lineEnding: 'CRLF' | 'LF' | 'CR' = 'CRLF';
  if (lfCount > Math.max(crlfCount, crCount)) lineEnding = 'LF';
  else if (crCount > Math.max(crlfCount, lfCount)) lineEnding = 'CR';

  return { encoding, lineEnding, content };
}
```

#### 5.2.2 CSVパース

```typescript
import Papa from 'papaparse';

interface ParseResult {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
}

function parseCSV(content: string): ParseResult {
  const result = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    delimiter: '', // 自動検出
    transformHeader: (header) => header.trim(),
  });

  if (result.errors.length > 0) {
    throw new Error(`CSV parse error: ${result.errors[0].message}`);
  }

  return {
    headers: result.meta.fields || [],
    rows: result.data as Record<string, string>[],
    delimiter: result.meta.delimiter,
  };
}
```

#### 5.2.3 マッピング適用

```typescript
import { z } from 'zod';

interface MappingConfig {
  clientColumn: string;
  standardColumn: string | null;
  required: boolean;
  dataType: 'string' | 'integer' | 'decimal' | 'date';
  maxLength?: number;
  min?: number;
  max?: number;
}

function applyMapping(
  rows: Record<string, string>[],
  mappings: MappingConfig[]
): Record<string, any>[] {
  return rows.map((row, index) => {
    const mapped: Record<string, any> = {};

    for (const mapping of mappings) {
      if (!mapping.standardColumn) continue; // マッピングなし

      const value = row[mapping.clientColumn];

      // 必須チェック
      if (mapping.required && (!value || value.trim() === '')) {
        throw new Error(
          `Row ${index + 2}: Required field '${mapping.clientColumn}' is empty`
        );
      }

      // データ型変換・バリデーション
      if (value && value.trim() !== '') {
        mapped[mapping.standardColumn] = convertAndValidate(
          value,
          mapping,
          index + 2
        );
      } else {
        mapped[mapping.standardColumn] = null;
      }
    }

    return mapped;
  });
}

function convertAndValidate(
  value: string,
  mapping: MappingConfig,
  rowNum: number
): any {
  const trimmed = value.trim();

  switch (mapping.dataType) {
    case 'integer':
      const intValue = parseInt(trimmed, 10);
      if (isNaN(intValue)) {
        throw new Error(
          `Row ${rowNum}: '${mapping.clientColumn}' must be an integer`
        );
      }
      if (mapping.min !== undefined && intValue < mapping.min) {
        throw new Error(
          `Row ${rowNum}: '${mapping.clientColumn}' must be >= ${mapping.min}`
        );
      }
      if (mapping.max !== undefined && intValue > mapping.max) {
        throw new Error(
          `Row ${rowNum}: '${mapping.clientColumn}' must be <= ${mapping.max}`
        );
      }
      return intValue;

    case 'decimal':
      const decValue = parseFloat(trimmed);
      if (isNaN(decValue)) {
        throw new Error(
          `Row ${rowNum}: '${mapping.clientColumn}' must be a number`
        );
      }
      return decValue;

    case 'date':
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(trimmed)) {
        throw new Error(
          `Row ${rowNum}: '${mapping.clientColumn}' must be YYYY-MM-DD format`
        );
      }
      return trimmed;

    case 'string':
    default:
      if (mapping.maxLength && trimmed.length > mapping.maxLength) {
        throw new Error(
          `Row ${rowNum}: '${mapping.clientColumn}' exceeds max length ${mapping.maxLength}`
        );
      }
      return trimmed;
  }
}
```

#### 5.2.4 標準CSV生成

```typescript
import { stringify } from 'csv-stringify/sync';

function generateStandardCSV(
  rows: Record<string, any>[],
  columns: string[]
): string {
  const csv = stringify(rows, {
    header: true,
    columns: columns,
    quoted_string: true,
    record_delimiter: '\r\n',
  });

  return csv;
}
```

---

## 6. エラーハンドリング

### 6.1 エラー種別

| エラー種別 | 説明 | 通知先 |
|-----------|------|--------|
| **文字コード検出失敗** | 文字コードが判定できない | Asana |
| **CSVパースエラー** | CSV形式が不正 | Asana |
| **マッピング未設定** | マッピング設定が存在しない | Asana |
| **必須項目欠落** | 必須項目が空 | Asana |
| **データ型不正** | 数値項目に文字列等 | Asana |
| **文字長超過** | 最大文字数超過 | Asana |
| **変換処理エラー** | システムエラー | Asana + システムログ |

### 6.2 Asana通知フォーマット

```
【F-Gateway】CSV変換エラー

クライアント: DAQ (T-shirts.sc)
ファイル名: shipping_20260128.csv
CSV種別: 出庫予定
マッピング設定: デフォルト

検出情報:
- 文字コード: Shift_JIS
- 改行コード: CRLF
- 区切り文字: カンマ

エラー内容:
- Row 5: Required field '商品コード' is empty
- Row 7: '数量' must be an integer
- Row 12: '商品名' exceeds max length 255

対応をお願いします。
```

---

## 7. テスト設計

### 7.1 テストケース

| テストケース | 入力 | 期待結果 |
|------------|------|---------|
| **UTF-8 カンマ区切り** | UTF-8, CRLF, カンマ | 正常変換 |
| **Shift_JIS タブ区切り** | Shift_JIS, CRLF, タブ | 正常変換 |
| **UTF-8 BOM付き** | UTF-8-BOM, LF, カンマ | 正常変換 |
| **EUC-JP** | EUC-JP, LF, カンマ | 正常変換 |
| **引用符囲み** | ダブルクォート囲み | 正常変換 |
| **引用符内カンマ** | フィールド内カンマ | 正常変換 |
| **必須項目欠落** | item_code が空 | エラー通知 |
| **数値項目に文字列** | quantity に "abc" | エラー通知 |
| **文字長超過** | item_name が 256文字 | エラー通知 |
| **マッピング未設定** | 設定なし | エラー通知 |

### 7.2 テストデータ

**UTF-8 カンマ区切り**:

```csv
商品コード,商品名,数量
DAQ-001,T-Shirt White S,10
DAQ-002,T-Shirt White M,20
```

**Shift_JIS タブ区切り**:

```csv
商品コード	商品名	数量
DAQ-001	T-Shirt White S	10
DAQ-002	T-Shirt White M	20
```

**引用符内カンマ**:

```csv
商品コード,商品名,備考
DAQ-001,T-Shirt White S,"サイズ: S, カラー: White"
```

---

## 8. セキュリティ

### 8.1 セキュリティ対策

| 項目 | 対策 |
|------|------|
| **ファイルサイズ制限** | 最大10MB |
| **行数制限** | 最大100,000行 |
| **インジェクション対策** | CSVフォーミュラインジェクション対策（`=`, `+`, `-`, `@` で始まる値をエスケープ） |
| **パス トラバーサル対策** | ファイルパスを検証 |
| **一時ファイル削除** | 処理後に一時ファイルを削除 |

### 8.2 CSVインジェクション対策

```typescript
function sanitizeCSVValue(value: string): string {
  // セル頭の危険文字をエスケープ
  const dangerousChars = ['=', '+', '-', '@', '\t', '\r'];

  if (dangerousChars.some(char => value.startsWith(char))) {
    return `'${value}`; // シングルクォートでエスケープ
  }

  return value;
}
```

---

## 9. 運用設計

### 9.1 マッピング設定の管理

| 運用項目 | 説明 |
|---------|------|
| **初期設定** | クライアント追加時にサンプルCSVから自動生成 |
| **変更管理** | Admin側でのみ変更可能 |
| **バージョン管理** | 変更履歴を保持（created_at, updated_at） |
| **複数設定** | 同一クライアントで複数のマッピング設定を保持可能 |
| **デフォルト設定** | is_active = true を優先使用 |

### 9.2 トラブルシューティング

| 問題 | 原因 | 対処 |
|------|------|------|
| 文字化け | 文字コード検出失敗 | 手動で文字コードを指定 |
| 列数不一致 | クライアントCSV形式変更 | マッピング設定を更新 |
| 変換エラー頻発 | バリデーションルール不適切 | マッピング設定を緩和 |

---

## 10. 関連ドキュメント

- [F-Gateway README](./README.md) - プロジェクト概要
- [設計書.md](./設計書.md) - 詳細設計書
- [商品マスタ管理設計書](./商品マスタ管理設計書.md) - 商品マスタ機能
- [技術補足設計書](./技術補足設計書.md) - API・テスト・デプロイ設計
- [UIデザイン設計書](./UIデザイン設計書.md) - UIデザイン設計

---

## 更新履歴

| 日付 | 版数 | 更新内容 | 更新者 |
|------|------|---------|--------|
| 2026-01-28 | 1.0 | 初版作成（CSVマッピング機能設計完成） | Teppei & Claude |
