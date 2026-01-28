# F-Gateway Google Drive連携設計書

| 項目 | 内容 |
|------|------|
| ドキュメント名 | Google Drive連携設計書 |
| バージョン | 2.0 |
| 最終更新 | 2026-01-28 |
| 更新者 | Teppei & Claude |

---

## 概要

F-GatewayとGoogle Drive間の連携設計を定義します。**システム全体で4つの共有フォルダ**を使用し、全クライアントのCSVを集約管理します。

### 前提条件

- **サービスアカウント**: `script@friendslogi.com`
- **対象Drive**: 上記アカウントがアクセス可能なFriendslogi社のGoogle Workspace Drive
- 設定する4つのフォルダは、すべて `script@friendslogi.com` が編集権限を持つフォルダであること

---

## アーキテクチャ

### 設計方針

- **システム全体で4フォルダを共有**: 全クライアントのCSVは共通のフォルダに格納
- **クライアント識別はファイル名で実施**: リネーム時にクライアントコードを付与
- **管理者設定でフォルダを一括管理**: クライアント個別のDrive設定は不要

### フォルダ構成

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Google Drive Structure (System-wide)                      │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌────────────────────────────────────┐
                              │    F-Gateway System Folders        │
                              │    (Admin Settings)                │
                              │                                    │
  [Client A]                  │  ┌──────────────────────────────┐  │
  Upload via F-Gateway ──────>│  │ 出庫予定/                     │  │
                              │  │   DAQ_20260128_143052.csv    │  │
  [Client B]                  │  │   MNG_20260128_091530.csv    │  │
  Upload via F-Gateway ──────>│  │   (All clients)              │  │
                              │  └──────────────────────────────┘  │
  [Client C]                  │                                    │
  Upload via F-Gateway ──────>│  ┌──────────────────────────────┐  │
                              │  │ 出庫実績/                     │  │
                              │  │   (Friendslogi returns here) │  │
                              │  └──────────────────────────────┘  │
                              │                                    │
                              │  ┌──────────────────────────────┐  │
                              │  │ 入庫予定/                     │  │
                              │  │   (All clients)              │  │
                              │  └──────────────────────────────┘  │
                              │                                    │
                              │  ┌──────────────────────────────┐  │
                              │  │ 入庫実績/                     │  │
                              │  │   (Friendslogi returns here) │  │
                              │  └──────────────────────────────┘  │
                              └────────────────────────────────────┘
```

### データフロー

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ CSV Processing Flow                                                          │
└─────────────────────────────────────────────────────────────────────────────┘

  [Client]        [F-Gateway]                      [System Drive]
      │                │                                 │
      │  Upload CSV    │                                 │
      │───────────────>│                                 │
      │                │                                 │
      │                │  1. Validate CSV                │
      │                │  2. Add client code to filename │
      │                │  3. Add timestamp               │
      │                │                                 │
      │                │  4. Upload to system folder     │
      │                │────────────────────────────────>│
      │                │                                 │
      │                │  5. Log transfer                │
      │                │  6. Notify via Asana            │
      │                │                                 │
      │  Success       │                                 │
      │<───────────────│                                 │
```

---

## フォルダ設定

### システム共有フォルダ（4種類）

| フォルダ | 用途 | 方向 | 設定場所 |
|---------|------|------|---------|
| **出庫予定** | 全クライアントの出庫予定CSVを集約 | Client -> Friendslogi | Admin設定 |
| **出庫実績** | 出庫実績CSVの返却先 | Friendslogi -> System | Admin設定 |
| **入庫予定** | 全クライアントの入庫予定CSVを集約 | Client -> Friendslogi | Admin設定 |
| **入庫実績** | 入庫実績CSVの返却先 | Friendslogi -> System | Admin設定 |

### クライアント固有フォルダ

**不要**: クライアントはF-Gateway経由でCSVをアップロードするため、クライアント固有のGoogle Driveフォルダは設定しません。

---

## システム設定

### SystemSettingテーブル

```prisma
model SystemSetting {
  id          Int      @id @default(autoincrement())
  settingKey  String   @unique
  settingValue String
  description String?
}

// 設定キー
// google_drive_shipping_plan_folder_id: "1xxx..."
// google_drive_shipping_result_folder_id: "1yyy..."
// google_drive_receiving_plan_folder_id: "1zzz..."
// google_drive_receiving_result_folder_id: "1www..."
```

### 管理者設定画面

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 設定 > Google Drive                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  システム全体で共有する4つのフォルダ                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ 全クライアントがCSVをアップロードすると、F-Gatewayがファイルを          ││
│  │ リネームしてこれらのフォルダに格納します。                               ││
│  │                                                                          ││
│  │ サービスアカウント: script@friendslogi.com [Copy]                        ││
│  │ ※上記アカウントがアクセス可能なFriendslogiのDriveフォルダを設定         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  設定状況: [出庫予定 ✓] [出庫実績 ✓] [入庫予定 ✓] [入庫実績 ✓]            │
│                                                                              │
│  出庫予定フォルダ                                                            │
│  [https://drive.google.com/drive/folders/...                        ]       │
│  クライアントの出庫予定CSVを格納                                             │
│                                                                              │
│  出庫実績フォルダ                                                            │
│  [https://drive.google.com/drive/folders/...                        ]       │
│  出庫実績CSVを格納（Friendslogiからの返却先）                                │
│                                                                              │
│  入庫予定フォルダ                                                            │
│  [https://drive.google.com/drive/folders/...                        ]       │
│  クライアントの入庫予定CSVを格納                                             │
│                                                                              │
│  入庫実績フォルダ                                                            │
│  [https://drive.google.com/drive/folders/...                        ]       │
│  入庫実績CSVを格納（Friendslogiからの返却先）                                │
│                                                                              │
│                                                       [設定を保存]           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## API設計

### GET /api/admin/settings/google-drive

Google Drive設定を取得

**Response:**
```json
{
  "settings": {
    "shippingPlanFolderId": "1abc123...",
    "shippingResultFolderId": "1def456...",
    "receivingPlanFolderId": "1ghi789...",
    "receivingResultFolderId": "1jkl012..."
  }
}
```

### POST /api/admin/settings/google-drive

Google Drive設定を保存

**Request:**
```json
{
  "shippingPlanFolderId": "1abc123...",
  "shippingResultFolderId": "1def456...",
  "receivingPlanFolderId": "1ghi789...",
  "receivingResultFolderId": "1jkl012..."
}
```

**Response:**
```json
{
  "success": true,
  "settings": { ... }
}
```

---

## ファイル命名規則

### アップロード時のリネーム

```
# 元ファイル名（任意）
sample_data.csv

# リネーム後（標準形式）
{clientCode}_{YYYYMMDD}_{HHMMSS}.csv

# 例
DAQ_20260128_143052.csv
MNG_20260128_091530.csv
ABC_20260128_162015.csv
```

### クライアント識別

- ファイル名のプレフィックスでクライアントを識別
- システムはファイル名からクライアントコードを抽出して処理

---

## データベース設計

### Clientテーブル（簡略化）

```prisma
model Client {
  id                    Int       @id @default(autoincrement())
  clientCode            String    @unique
  clientName            String
  status                String    @default("active")

  // Note: Google Drive設定はシステム全体で4フォルダを共有（SystemSettingで管理）
  // クライアント固有のDrive設定は不要

  // Asana settings
  asanaProjectId        String?
  asanaEnabled          Boolean   @default(false)
  // ...
}
```

### FileTransferテーブル（ログ用）

```prisma
model FileTransfer {
  id                Int       @id @default(autoincrement())
  clientId          Int
  transferType      String    // shipping_plan, shipping_result, etc.
  sourceFileId      String    // 元ファイルID
  sourceFileName    String    // 元ファイル名
  targetFileId      String?   // 転送先ファイルID
  targetFileName    String?   // リネーム後ファイル名（クライアントコード付き）
  transferStatus    String    // pending, completed, failed
  errorMessage      String?
  startedAt         DateTime  @default(now())
  completedAt       DateTime?

  client            Client    @relation(fields: [clientId], references: [id])
}
```

---

## CSVファイルの流れ

### 1. クライアントがCSVアップロード

各クライアントがF-Gateway経由で出庫/入庫予定CSVをアップロード

### 2. F-Gatewayでリネーム

- クライアントコードを付与
- タイムスタンプを付与
- 標準形式にリネーム

### 3. 共有フォルダに格納

上記4つのシステムフォルダに種類別にCSVを格納

### 4. Friendslogiが処理・実績返却

- Friendslogiが予定フォルダのCSVを取得
- 処理後、実績フォルダにCSVを格納

---

## セキュリティ考慮事項

### サービスアカウント

| 項目 | 値・対策 |
|------|------|
| **メールアドレス** | `script@friendslogi.com` |
| **所属** | Friendslogi Google Workspace |
| **アクセス対象** | Friendslogi社内のGoogle Driveフォルダ |
| **監査ログ** | 全ファイル操作をログに記録 |

### フォルダアクセス

| 項目 | 対策 |
|------|------|
| **中央集約** | 4フォルダのみを管理、分散管理不要 |
| **アクセス制限** | サービスアカウントのみがアクセス |
| **クライアント分離** | ファイル名でクライアントを識別、論理的に分離 |

---

## 実装計画

### Phase 1: システム設定（完了）

1. [x] SystemSettingテーブルにDrive設定を保存
2. [x] 管理者設定画面にGoogle Driveタブを追加
3. [x] フォルダID入力・保存機能
4. [x] クライアント管理からDrive設定を削除

### Phase 2: アクセス確認（未実装）

1. [ ] Google Drive APIクライアント実装
2. [ ] フォルダアクセス確認機能
3. [ ] アクセスステータス表示

### Phase 3: ファイル転送（未実装）

1. [ ] CSVアップロード時のリネーム処理
2. [ ] システムフォルダへのアップロード
3. [ ] 転送ログ記録

### Phase 4: 監視・通知（未実装）

1. [ ] 実績フォルダの監視
2. [ ] Asana通知連携

---

## 更新履歴

| 日付 | 版数 | 更新内容 | 更新者 |
|------|------|---------|--------|
| 2026-01-28 | 1.0 | 初版作成。クライアント単位のDrive設計 | Teppei & Claude |
| 2026-01-28 | 2.0 | **設計変更**: システム全体で4フォルダを共有する方式に変更。クライアント単位のDrive設定を廃止 | Teppei & Claude |
