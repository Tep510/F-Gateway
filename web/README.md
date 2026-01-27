# F-Gateway - Friendslogi Data Exchange Portal

Neon PostgreSQL、NextAuth.js、Prismaを使用したクライアントとFriendslogiのデータ交換ポータル。

## プロジェクト構成

```
web/
├── app/
│   ├── api/              # API Routes
│   │   ├── admin/        # 管理者向けAPI
│   │   │   ├── clients/  # クライアント管理
│   │   │   ├── dashboard/ # 管理ダッシュボード
│   │   │   ├── logs/     # ログ閲覧
│   │   │   └── users/    # ユーザー管理
│   │   ├── auth/         # NextAuth認証
│   │   └── client/       # クライアント向けAPI
│   │       ├── dashboard/ # クライアントダッシュボード
│   │       └── history/  # 作業履歴
│   ├── components/       # UIコンポーネント
│   ├── admin/            # 管理者ページ
│   ├── client/           # クライアントページ
│   └── page.tsx          # ログインページ
├── lib/
│   ├── auth.ts           # NextAuth設定
│   └── prisma.ts         # Prisma Client
├── prisma/
│   └── schema.prisma     # データベーススキーマ
├── types/
│   └── next-auth.d.ts    # NextAuth型定義
└── middleware.ts         # 認証ミドルウェア

```

## 実装済み機能

### 認証システム
- ✅ Google OAuth 2.0認証
- ✅ ロールベースアクセス制御（admin/client）
- ✅ セッション管理
- ✅ 認証ミドルウェア

### データベース
- ✅ Prisma ORM統合
- ✅ Neon PostgreSQL Adapter
- ✅ 21モデル（システム、マスター、トランザクション、商品マスター）
- ✅ NextAuth認証テーブル統合

### API Routes

#### クライアント向けAPI
- ✅ `GET /api/client/dashboard` - ダッシュボードデータ取得
- ✅ `GET /api/client/history` - 作業履歴取得（月次）

#### 管理者向けAPI
- ✅ `GET /api/admin/dashboard` - 管理ダッシュボード
- ✅ `GET /api/admin/clients` - クライアント一覧
- ✅ `POST /api/admin/clients` - クライアント作成
- ✅ `GET /api/admin/clients/[id]` - クライアント詳細
- ✅ `PATCH /api/admin/clients/[id]` - クライアント更新
- ✅ `DELETE /api/admin/clients/[id]` - クライアント削除（ソフトデリート）
- ✅ `GET /api/admin/users` - ユーザー一覧
- ✅ `POST /api/admin/users` - ユーザー作成
- ✅ `PATCH /api/admin/users/[id]` - ユーザー更新
- ✅ `DELETE /api/admin/users/[id]` - ユーザー削除（ソフトデリート）
- ✅ `GET /api/admin/logs` - ログ取得（CSV、ファイル転送、Asana通知）

### UI
- ✅ Vercel風モダンデザイン
- ✅ レスポンシブレイアウト
- ✅ クライアントダッシュボード
- ✅ 管理者ダッシュボード
- ✅ サインイン/サインアウト

## セットアップ

### 1. 環境変数の設定

`.env.local`ファイルを作成（`.env.local.example`を参考）:

```bash
# Database (Neon PostgreSQL)
DATABASE_URL="postgresql://user:password@host/database?sslmode=require"

# Authentication
NEXTAUTH_URL="http://localhost:3002"
NEXTAUTH_SECRET="" # openssl rand -base64 32 で生成

# Google OAuth
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Google Drive API
GOOGLE_DRIVE_API_KEY=""
GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON=''

# Asana API
ASANA_PERSONAL_ACCESS_TOKEN=""

# Application Settings
NODE_ENV="development"
PORT="3002"
```

### 2. Google OAuth設定

1. [Google Cloud Console](https://console.cloud.google.com/)でプロジェクト作成
2. OAuth 2.0クライアントID作成
3. 承認済みリダイレクトURIを追加:
   - `http://localhost:3002/api/auth/callback/google`
4. クライアントIDとシークレットを`.env.local`に設定

### 3. Neon PostgreSQL設定

1. [Neon](https://neon.tech/)でプロジェクト作成
2. 接続文字列を取得
3. `DATABASE_URL`を`.env.local`に設定

### 4. データベースマイグレーション

```bash
# Prismaスキーマをデータベースに反映
npx prisma db push

# Prisma Studioでデータ確認（オプション）
npx prisma studio
```

### 5. 開発サーバー起動

```bash
npm install
npm run dev
```

ブラウザで http://localhost:3002 を開く

## ポート設定

- **開発サーバー**: 3002
- **代替ポート**: 3003, 3004（3002が使用中の場合）
- **ポート3000は使用しない**（他プロジェクトとの競合防止）

## データベーススキーマ

### システムテーブル
- `system_settings` - システム設定
- `accounts` - NextAuth OAuthアカウント
- `sessions` - NextAuthセッション
- `verification_tokens` - NextAuth検証トークン

### マスターテーブル
- `clients` - クライアント情報
- `users` - ユーザー情報
- `client_google_drives` - Google Drive設定
- `client_asana_settings` - Asana設定

### トランザクションテーブル
- `csv_mappings` - CSV列マッピング
- `csv_upload_logs` - CSVアップロードログ
- `csv_conversion_logs` - CSV変換ログ
- `file_transfers` - ファイル転送ログ
- `result_returns` - 結果返却ログ
- `asana_notifications` - Asana通知ログ

### 商品マスターテーブル
- `item_master_definitions` - 商品マスタ定義
- `client_item_mappings` - クライアント商品マッピング
- `item_import_logs` - 商品インポートログ
- `client_item_masters` - クライアント商品マスタ
- `client_item_sync_settings` - 同期設定

## ビルド

```bash
npm run build
```

## 本番環境デプロイ

```bash
npm start
```

## トラブルシューティング

### ポートが使用中
```bash
# 使用中のポートを確認
lsof -i :3002

# プロセスを停止
kill $(lsof -ti :3002)
```

### Prismaクライアント生成
```bash
npx prisma generate
```

### データベース接続エラー
- `DATABASE_URL`が正しく設定されているか確認
- Neonのデータベースが起動しているか確認
- SSL接続が有効か確認（`?sslmode=require`）

## 次のステップ

1. **Google Drive API統合**
   - CSV自動アップロード/ダウンロード機能
   - フォルダ監視機能

2. **Asana API統合**
   - タスク自動作成
   - 通知機能

3. **CSV処理機能**
   - 列マッピング機能
   - データ変換・検証機能
   - 自動処理スケジューラー

4. **商品マスタ管理**
   - CRUD操作
   - インポート/エクスポート
   - 自動同期機能

## 技術スタック

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19, Tailwind CSS 3.4
- **Database**: Neon PostgreSQL
- **ORM**: Prisma 7.3
- **Authentication**: NextAuth.js v5 (beta)
- **Language**: TypeScript 5.9

## ライセンス

© 2026 Friendslogi
