# F-Gateway Google Drive連携設計書

| 項目 | 内容 |
|------|------|
| ドキュメント名 | Google Drive連携設計書 |
| バージョン | 1.0 |
| 最終更新 | 2026-01-28 |
| 更新者 | Teppei & Claude |

---

## 概要

F-GatewayとGoogle Drive間の連携設計を定義します。クライアントフォルダからのCSV検出、管理者中央フォルダへの転送、アクセス権限の管理方法を規定します。

---

## アーキテクチャ

### フォルダ構成

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Google Drive Structure                                │
└─────────────────────────────────────────────────────────────────────────────┘

  [Client A]                                              [Admin Central]
  ┌────────────────────┐                                 ┌────────────────────┐
  │ Client A Drive     │                                 │ Friendslogi Drive  │
  │                    │                                 │                    │
  │ ├─ 出庫予定/       │─────── Detect & Copy ─────────>│ ├─ 出庫予定/       │
  │ │  └─ *.csv       │                                 │ │  └─ renamed.csv  │
  │ ├─ 出庫実績/       │<───── Return Result ──────────│ ├─ 出庫実績/       │
  │ │  └─ result.csv  │                                 │ │                  │
  │ ├─ 入庫予定/       │─────── Detect & Copy ─────────>│ ├─ 入庫予定/       │
  │ │  └─ *.csv       │                                 │ │  └─ renamed.csv  │
  │ └─ 入庫実績/       │<───── Return Result ──────────│ └─ 入庫実績/       │
  │    └─ result.csv  │                                 │                    │
  └────────────────────┘                                 └────────────────────┘

  [Client B]
  ┌────────────────────┐
  │ Client B Drive     │──────────────────────────────────────────┐
  │ (Same structure)   │                                          │
  └────────────────────┘                                          v
                                                          [Same Admin Central]
```

### データフロー

1. **クライアント提出** - クライアントがCSVをGoogle Driveフォルダにアップロード
2. **検出** - F-Gatewayがフォルダを監視し、新規ファイルを検出
3. **検証** - CSVフォーマットを検証
4. **リネーム** - 標準命名規則に従ってリネーム
5. **転送** - 管理者中央フォルダにコピー
6. **通知** - 処理結果をAsanaに通知
7. **返却** - 実績CSVをクライアントフォルダに返却

---

## フォルダ設定

### クライアント側フォルダ（4種類）

| フォルダ | 用途 | 方向 |
|---------|------|------|
| **出庫予定** | 出庫依頼CSVの提出先 | Client -> System |
| **出庫実績** | 出庫実績CSVの返却先 | System -> Client |
| **入庫予定** | 入庫予定CSVの提出先 | Client -> System |
| **入庫実績** | 入庫実績CSVの返却先 | System -> Client |

### 管理者側フォルダ（4種類 - 全クライアント共通）

| フォルダ | 用途 | 説明 |
|---------|------|------|
| **出庫予定集約** | 全クライアントの出庫予定を集約 | WMS取込用 |
| **出庫実績配布** | 出庫実績の配布元 | WMSから出力 |
| **入庫予定集約** | 全クライアントの入庫予定を集約 | WMS取込用 |
| **入庫実績配布** | 入庫実績の配布元 | WMSから出力 |

---

## URL入力とアクセス権限

### URLフォーマット

Google DriveフォルダのURL形式:

```
# マイドライブ
https://drive.google.com/drive/folders/{folderId}

# 共有ドライブ
https://drive.google.com/drive/folders/{folderId}
```

### フォルダIDの抽出

```typescript
function extractFolderId(url: string): string | null {
  // パターン1: /folders/xxxxx
  const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];

  // パターン2: ?id=xxxxx
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];

  // パターン3: フォルダIDのみ
  if (/^[a-zA-Z0-9_-]+$/.test(url)) return url;

  return null;
}
```

### アクセス権限の付与方法

URLを入力するだけでは**アクセス権限は付与されません**。

#### 手順1: サービスアカウント情報の取得

システム設定でサービスアカウントのメールアドレスを表示:

```
f-gateway@f-gateway-project.iam.gserviceaccount.com
```

#### 手順2: クライアントによるフォルダ共有

**共有ドライブの場合:**
1. 共有ドライブの「管理」を開く
2. 「メンバーを追加」をクリック
3. サービスアカウントのメールアドレスを入力
4. 権限を「編集者」に設定

**マイドライブの場合:**
1. フォルダを右クリック → 「共有」
2. サービスアカウントのメールアドレスを入力
3. 権限を「編集者」に設定

#### 手順3: アクセス確認

「アクセス確認」ボタンをクリックして、サービスアカウントがフォルダにアクセスできるか検証。

---

## クライアント設定UI

### 設定画面のフロー

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ クライアント編集: DAQ - Tshirt.st                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  基本情報                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ クライアントコード: [DAQ        ]  クライアント名: [Tshirt.st      ]   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Google Drive設定                                                            │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                          ││
│  │  サービスアカウント: f-gateway@f-gateway-project.iam.gserviceaccount.com││
│  │  [Copy] このメールアドレスをフォルダに共有してください                   ││
│  │                                                                          ││
│  │  ────────────────────────────────────────────────────────────────────   ││
│  │                                                                          ││
│  │  出庫予定フォルダ                                                        ││
│  │  [https://drive.google.com/drive/folders/xxxxx              ] [確認]    ││
│  │  ステータス: ✅ アクセス可能                                             ││
│  │                                                                          ││
│  │  出庫実績フォルダ                                                        ││
│  │  [https://drive.google.com/drive/folders/yyyyy              ] [確認]    ││
│  │  ステータス: ❌ アクセス権限がありません                                  ││
│  │                                                                          ││
│  │  入庫予定フォルダ                                                        ││
│  │  [https://drive.google.com/drive/folders/zzzzz              ] [確認]    ││
│  │  ステータス: ⏳ 未確認                                                   ││
│  │                                                                          ││
│  │  入庫実績フォルダ                                                        ││
│  │  [                                                          ] [確認]    ││
│  │  ステータス: ─ 未設定                                                    ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│                                              [キャンセル] [保存]             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### アクセス確認API

```typescript
// POST /api/admin/clients/[id]/verify-drive
{
  "folderType": "shippingPlan",
  "folderId": "1abc123..."
}

// Response
{
  "success": true,
  "folderName": "出庫予定_DAQ",
  "driveType": "shared_drive", // or "my_drive"
  "permissions": ["read", "write"]
}

// Error Response
{
  "success": false,
  "error": "ACCESS_DENIED",
  "message": "サービスアカウントにアクセス権限がありません"
}
```

---

## ファイル監視と検出

### 監視方式の比較

| 方式 | メリット | デメリット | 推奨 |
|------|---------|-----------|------|
| **Webhook (Push)** | リアルタイム、APIコール削減 | 設定複雑、Webhook URL必要 | △ |
| **Polling** | シンプル、確実 | API使用量増、遅延あり | ○ |
| **手動トリガー** | シンプル、確実 | ユーザー操作必要 | △ |

### 推奨: 定期Polling + 手動トリガー

```
┌───────────────────────────────────────────────────────────────┐
│ File Detection Flow                                           │
└───────────────────────────────────────────────────────────────┘

  [Cron Job]                    [Manual Trigger]
      │                              │
      v                              v
  ┌───────────────────────────────────────────────────────────┐
  │ Poll Client Folders                                        │
  │  - List files in each folder                               │
  │  - Compare with last known state                           │
  │  - Detect new files                                        │
  └──────────────────────┬────────────────────────────────────┘
                         │
                         v
  ┌───────────────────────────────────────────────────────────┐
  │ For each new file:                                         │
  │  1. Download file                                          │
  │  2. Validate CSV format                                    │
  │  3. Rename with standard naming                            │
  │  4. Upload to Admin Central Drive                          │
  │  5. Log processing result                                  │
  │  6. Send Asana notification                                │
  └───────────────────────────────────────────────────────────┘
```

### ファイル命名規則

```
# クライアント提出時（任意）
any_filename.csv

# リネーム後（標準形式）
{type}_{clientCode}_{YYYYMMDD}_{HHMMSS}.csv

# 例
shukka_DAQ_20260128_143052.csv
nyuka_MNG_20260128_091530.csv
```

---

## 管理者中央フォルダ設定

### システム設定テーブル

```prisma
model SystemSetting {
  id          Int      @id @default(autoincrement())
  settingKey  String   @unique
  settingValue String
  description String?
}

// 設定例
// admin_shipping_plan_drive_id: "1xxx..."
// admin_shipping_result_drive_id: "1yyy..."
// admin_receiving_plan_drive_id: "1zzz..."
// admin_receiving_result_drive_id: "1www..."
```

### 管理者設定UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ システム設定 > Google Drive                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  サービスアカウント情報                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ メールアドレス: f-gateway@f-gateway-project.iam.gserviceaccount.com     ││
│  │ [Copy]                                                                   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  管理者中央フォルダ（Friendslogi社内）                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                          ││
│  │  出庫予定集約フォルダ                                                    ││
│  │  [https://drive.google.com/drive/folders/...          ] [確認] ✅       ││
│  │                                                                          ││
│  │  出庫実績配布フォルダ                                                    ││
│  │  [https://drive.google.com/drive/folders/...          ] [確認] ✅       ││
│  │                                                                          ││
│  │  入庫予定集約フォルダ                                                    ││
│  │  [https://drive.google.com/drive/folders/...          ] [確認] ✅       ││
│  │                                                                          ││
│  │  入庫実績配布フォルダ                                                    ││
│  │  [https://drive.google.com/drive/folders/...          ] [確認] ✅       ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│                                                           [保存]             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## データベース設計

### Clientテーブル（更新）

```prisma
model Client {
  id                    Int       @id @default(autoincrement())
  clientCode            String    @unique
  clientName            String
  status                String    @default("active")

  // Google Drive設定 - フォルダID
  shippingPlanDriveId   String?   // 出庫予定フォルダID
  shippingResultDriveId String?   // 出庫実績フォルダID
  receivingPlanDriveId  String?   // 入庫予定フォルダID
  receivingResultDriveId String?  // 入庫実績フォルダID

  // Google Drive設定 - アクセス確認ステータス
  shippingPlanDriveStatus   String?  // verified, error, pending
  shippingResultDriveStatus String?
  receivingPlanDriveStatus  String?
  receivingResultDriveStatus String?

  // 最終確認日時
  driveVerifiedAt       DateTime?
}
```

### FileTransferテーブル（ログ用）

```prisma
model FileTransfer {
  id                Int       @id @default(autoincrement())
  clientId          Int
  transferType      String    // shipping_plan, shipping_result, etc.
  transferDirection String    // inbound, outbound
  sourceFileId      String    // 元ファイルのGoogle Drive ID
  sourceFileName    String    // 元ファイル名
  destFileId        String?   // 転送先ファイルのGoogle Drive ID
  destFileName      String?   // リネーム後ファイル名
  transferStatus    String    // pending, completed, failed
  errorMessage      String?
  startedAt         DateTime  @default(now())
  completedAt       DateTime?

  client            Client    @relation(fields: [clientId], references: [id])
}
```

---

## 実装計画

### Phase 1: 基本設定（2-3日）

1. [ ] サービスアカウント情報をシステム設定に追加
2. [ ] クライアント編集画面にURL入力フィールド追加
3. [ ] フォルダID抽出ロジック実装
4. [ ] 管理者中央フォルダ設定画面実装

### Phase 2: アクセス確認（2-3日）

1. [ ] Google Drive APIクライアント実装
2. [ ] アクセス確認APIエンドポイント実装
3. [ ] アクセス確認UI実装
4. [ ] アクセスステータスの保存

### Phase 3: ファイル転送（3-5日）

1. [ ] ファイル一覧取得機能
2. [ ] ファイルダウンロード機能
3. [ ] ファイルアップロード（リネーム付き）
4. [ ] 転送ログ記録
5. [ ] 手動トリガー機能

### Phase 4: 自動検出（2-3日）

1. [ ] 定期ポーリングジョブ
2. [ ] 新規ファイル検出ロジック
3. [ ] 自動転送パイプライン
4. [ ] Asana通知連携

---

## セキュリティ考慮事項

### サービスアカウント

| 項目 | 対策 |
|------|------|
| **秘密鍵の管理** | 環境変数で管理、Gitにコミットしない |
| **最小権限の原則** | 必要なフォルダのみにアクセス権を付与 |
| **監査ログ** | 全ファイル操作をログに記録 |

### クライアントフォルダ

| 項目 | 対策 |
|------|------|
| **データ分離** | クライアント間でフォルダを分離 |
| **アクセス制限** | サービスアカウントのみがアクセス |
| **検証** | URLとアクセス権限を必ず検証 |

---

## 更新履歴

| 日付 | 版数 | 更新内容 | 更新者 |
|------|------|---------|--------|
| 2026-01-28 | 1.0 | 初版作成。Google Drive連携設計を策定 | Teppei & Claude |
