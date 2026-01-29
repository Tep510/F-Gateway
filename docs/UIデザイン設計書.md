# F-Gateway UIデザイン設計書

| 項目 | 内容 |
|------|------|
| ドキュメント名 | F-Gateway UIデザイン設計書 |
| バージョン | 1.0 |
| 最終更新 | 2026-01-28 |
| 更新者 | Teppei & Claude |

---

## 概要

F-GatewayのUIデザインは、**Vercel、Supabase、Linear**などの現代的なSaaSダッシュボードを参考に設計します。これらのプロダクトに共通する「**シンプルで高速、直感的**」なデザイン哲学を採用し、業務効率を最大化します。

### 参考プロダクト

| プロダクト | 参考要素 | URL |
|-----------|---------|-----|
| **Vercel** | 横並びナビゲーション、Scope Selector、Geistデザインシステム | https://vercel.com/dashboard |
| **Supabase** | ブレッドクラム構造、テーブルデザイン | https://supabase.com/dashboard |
| **Linear** | ミニマルな配色、高速なインタラクション | https://linear.app |

### デザイン哲学

1. **最小限の視覚要素** - 情報密度を高めつつ、余白と階層構造で見やすさを確保
2. **速度感** - アニメーションは控えめ、ページ遷移は瞬時
3. **コンテキストの明確化** - ユーザーが「今どこにいるか」を常に把握できる
4. **キーボード操作** - マウス不要で主要操作を完結（Command Menu実装）
5. **レスポンシブ** - デスクトップ優先だが、モバイルでも快適

---

## レイアウト構成

### 固定サイドバーを廃止する理由

従来の管理画面では左側に固定サイドバーを配置するのが一般的でしたが、現代的なSaaSダッシュボードでは**横並びナビゲーション**が主流です。

| 固定サイドバー（旧） | 横並びナビゲーション（新） |
|-------------------|----------------------|
| 画面の左側200-250pxが常に占有 | コンテンツエリアを最大限活用 |
| メニュー項目が縦に並ぶため優先順位が不明確 | 左から順に重要度が明確 |
| スクロールが発生しメニューが見切れる | 横スクロールで全メニューにアクセス可能 |
| モバイル表示時にハンバーガーメニュー化が必須 | モバイルでも横スクロールで自然に操作 |

**採用する理由:**
- **画面の有効活用** - コンテンツ表示領域が20%以上拡大
- **優先順位の明確化** - 左から順に「ダッシュボード→出庫→入庫→商品マスタ」と並べることで、重要度を視覚的に表現
- **一貫性** - デスクトップもモバイルも同じUI構造
- **現代的** - ユーザーが他のSaaSで慣れ親しんだUI

---

## ヘッダー設計

### 構造

ヘッダーは**3セクション構成**とし、固定配置（`position: sticky`）します。

```
┌────────────────────────────────────────────────────────────────────┐
│ [Logo] [Breadcrumb]                             [Account ▼]        │  # Header
├────────────────────────────────────────────────────────────────────┤
│ [Dashboard] [出庫] [入庫] [商品マスタ] [設定] ...                    │  # Navigation
└────────────────────────────────────────────────────────────────────┘
```

> **注意:** 本システムでは検索機能は実装しません。シンプルなナビゲーションでの画面遷移を優先します。

### 左セクション（ブレッドクラム）

ディレクトリ構造を表現し、ユーザーの現在位置を明確にします。

**表示例:**

```
F-Gateway / DAQ / ダッシュボード
F-Gateway / DAQ / 出庫管理
F-Gateway / DAQ / 商品マスタ
F-Gateway / Admin / クライアント管理
```

**構造:**

| 階層 | 表示 | 説明 |
|------|------|------|
| 第1階層 | F-Gateway | サービス名（クリックでトップへ） |
| 第2階層 | クライアント名 or Admin | Scope Selector（クリックで切り替え） |
| 第3階層 | 画面名 | 現在表示中の画面 |

**Scope Selector:**

Vercelの「Scope Selector」を模倣し、クライアント/Adminの切り替えを第2階層で行います。

```tsx
<button className="flex items-center gap-2 hover:bg-gray-100 px-3 py-1 rounded">
  <span className="font-medium">DAQ</span>
  <ChevronDown className="w-4 h-4" />
</button>
```

クリック時にドロップダウンが開き、以下を表示：

- **自分が所属するクライアント一覧** - 通常ユーザーは自社のみ
- **Admin** - Admin権限保持者のみ表示
- **アカウント設定** - 個人設定へのリンク

### 中央セクション（横並びナビゲーション）

画面の主要セクションを横並びで表示します。

**クライアント側メニュー:**

```
[ダッシュボード] [出庫] [入庫] [商品マスタ]
```

**Admin側メニュー:**

```
[ダッシュボード] [クライアント] [商品マスタ] [ユーザー] [ログ] [設定]
```

**デザイン仕様:**

| 項目 | 仕様 |
|------|------|
| フォントサイズ | 14px（text-sm） |
| アクティブ状態 | 下線（border-b-2）+ 濃い文字色 |
| 非アクティブ状態 | グレー文字 + ホバーで背景色変化 |
| スペーシング | 各項目間に16px（gap-4） |
| モバイル | 横スクロール有効化（overflow-x-auto） |

**実装例:**

```tsx
<nav className="flex gap-4 overflow-x-auto border-b">
  <a href="/client" className={cn(
    "px-3 py-2 text-sm whitespace-nowrap",
    isActive ? "border-b-2 border-blue-600 text-gray-900" : "text-gray-600 hover:text-gray-900"
  )}>
    ダッシュボード
  </a>
  <a href="/client/shipping" className="...">出庫</a>
  <a href="/client/receiving" className="...">入庫</a>
  <a href="/client/items" className="...">商品マスタ</a>
</nav>
```

### 右セクション（ユーティリティ）

ユーザーアカウントを右端に配置します。

**構成要素:**

1. **アカウントメニュー** - ユーザーのメールアドレス + ドロップダウン

> **注意:** 検索機能とテーマ切り替えは本システムでは実装しません。

**アカウントメニュー項目:**

```
──────────────────────
 goto@daq.jp
──────────────────────
 アカウント設定
 ログアウト
──────────────────────
```

---

## カラーパレット

Vercelの**Geistデザインシステム**を参考に、ニュートラルグレーを基調とした配色を採用します。

### 基本色

| 用途 | カラー | Tailwind Class |
|------|--------|----------------|
| 背景（ページ） | `#fafafa` | bg-gray-50 |
| 背景（カード） | `#ffffff` | bg-white |
| 境界線 | `#e5e5e5` | border-gray-200 |
| テキスト（主） | `#171717` | text-gray-900 |
| テキスト（副） | `#737373` | text-gray-500 |
| アクセント | `#0070f3` | bg-blue-600 |

### ステータスカラー

| 状態 | カラー | Tailwind Class |
|------|--------|----------------|
| 成功 | `#22c55e` | text-green-600 |
| エラー | `#ef4444` | text-red-600 |
| 警告 | `#f59e0b` | text-yellow-600 |
| 情報 | `#3b82f6` | text-blue-600 |

### ダークモード

- **背景**: `#0a0a0a`
- **カード**: `#171717`
- **境界線**: `#262626`
- **テキスト**: `#ededed`

---

## タイポグラフィ

### フォントファミリー

**Geist Sans**（Vercel公式フォント）を採用します。

```css
font-family: 'Geist Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

Next.jsでの読み込み:

```tsx
import { GeistSans } from 'geist/font/sans';

export default function RootLayout({ children }) {
  return (
    <html lang="ja" className={GeistSans.className}>
      <body>{children}</body>
    </html>
  );
}
```

### スケール

| 用途 | サイズ | Line Height | Tailwind Class |
|------|--------|-------------|----------------|
| H1（ページタイトル） | 24px | 32px | text-2xl font-bold |
| H2（セクション） | 18px | 28px | text-lg font-semibold |
| H3（サブセクション） | 16px | 24px | text-base font-semibold |
| Body（本文） | 14px | 20px | text-sm |
| Caption（補足） | 12px | 16px | text-xs |

### 日本語最適化

- **行間**: 欧文より広め（`leading-relaxed`）
- **字間**: デフォルト（`tracking-normal`）
- **太字**: `font-semibold`（600）または`font-bold`（700）

---

## コンポーネント設計

### カード

**基本仕様:**

```tsx
<div className="bg-white rounded-lg border border-gray-200 shadow-sm">
  <div className="px-6 py-4 border-b border-gray-200">
    <h3 className="text-lg font-semibold">タイトル</h3>
  </div>
  <div className="p-6">
    {/* コンテンツ */}
  </div>
</div>
```

### テーブル

Vercelスタイルのシンプルなテーブルデザイン:

```tsx
<table className="w-full">
  <thead>
    <tr className="border-b border-gray-200">
      <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">列名</th>
    </tr>
  </thead>
  <tbody>
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="py-3 px-4 text-sm text-gray-900">データ</td>
    </tr>
  </tbody>
</table>
```

### ステータスバッジ

```tsx
<span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">
  完了
</span>
```

### ボタン

**Primary:**

```tsx
<button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium transition-colors">
  実行
</button>
```

**Secondary:**

```tsx
<button className="px-4 py-2 bg-white border border-gray-300 rounded hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors">
  キャンセル
</button>
```

---

## Command Menu（⌘K）【将来実装】

> **注意:** 本システムでは検索機能・Command Menuは実装予定なし。将来の拡張可能性として設計情報のみ残しています。

Vercelの**Command Menu**を参考にした設計です。

### 起動方法（参考）

- **Mac**: `⌘ + K`
- **Windows/Linux**: `Ctrl + K`

### 実装（参考）

[cmdk](https://github.com/pacocoursey/cmdk)ライブラリを使用する場合:

```tsx
import { Command } from 'cmdk';

<Command.Dialog open={open} onOpenChange={setOpen}>
  <Command.Input placeholder="コマンド入力..." />
  <Command.List>
    <Command.Group heading="ページ">
      <Command.Item onSelect={() => router.push('/client')}>
        ダッシュボード
      </Command.Item>
      <Command.Item onSelect={() => router.push('/client/shipping')}>
        出庫管理
      </Command.Item>
    </Command.Group>
  </Command.List>
</Command.Dialog>
```

### 機能（参考）

- **ページ遷移** - 全ページへのクイックアクセス
- **クライアント切り替え** - Scope切り替え

---

## レスポンシブ設計

### ブレークポイント

| サイズ | 幅 | Tailwind | 対応 |
|--------|-----|----------|------|
| Mobile | < 640px | sm未満 | 横スクロールナビゲーション |
| Tablet | 640-1024px | sm-lg | 同上 |
| Desktop | > 1024px | lg以上 | 全機能表示 |

### モバイル対応

1. **横スクロールナビゲーション** - 固定ナビゲーションを横スクロールで表示
2. **テーブルの横スクロール** - `overflow-x-auto`でスクロール有効化
3. **カードスタック** - グリッドを1列に変更
4. **Command Menu** - モバイルでもフルスクリーン表示

---

## アニメーション

Vercelのような「**速くて邪魔にならない**」アニメーションを実装します。

### 基本方針

- **ページ遷移**: アニメーションなし（瞬時に切り替え）
- **ホバー**: `transition-colors duration-150`
- **ドロップダウン**: `transition-all duration-200 ease-out`
- **モーダル**: フェードイン（`opacity` + `scale`）

### 実装例

```tsx
<div className="transition-colors duration-150 hover:bg-gray-50">
  ホバーで色変化
</div>
```

---

## アクセシビリティ

### 必須対応

- **キーボード操作** - Tab/Shift+Tab/Enter/Escapeで操作可能
- **フォーカス表示** - `focus:ring-2 focus:ring-blue-500`
- **ラベル** - すべてのinputに`<label>`を付与
- **カラーコントラスト** - WCAG AA準拠（4.5:1以上）
- **セマンティックHTML** - `<nav>`, `<main>`, `<article>`の適切な使用

---

## 実装優先度

| 優先度 | 項目 | 理由 |
|--------|------|------|
| **高** | ブレッドクラム + 横並びナビゲーション | 画面の基本構造 |
| **高** | Scope Selector | クライアント切り替えの基盤 |
| **高** | カラーパレット + タイポグラフィ | デザインの統一性 |
| **中** | Command Menu | キーボード操作の効率化 |
| **中** | ダークモード | ユーザー体験の向上 |
| **低** | アニメーション細部調整 | 最後の仕上げ |

---

## 参考リソース

### デザインシステム

- [Vercel Geist Design System](https://vercel.com/geist/introduction)
- [Supabase Design System](https://supabase-design-system.vercel.app/)
- [shadcn/ui](https://ui.shadcn.com/)

### UIライブラリ

- [cmdk](https://github.com/pacocoursey/cmdk) - Command Menu
- [Radix UI](https://www.radix-ui.com/) - ヘッドレスコンポーネント
- [Tailwind CSS](https://tailwindcss.com/) - ユーティリティファースト

### 参考テンプレート

- [Next.js & shadcn/ui Admin Dashboard](https://vercel.com/templates/next.js/next-js-and-shadcn-ui-admin-dashboard)
- [Modernize Next.js Admin Dashboard](https://vercel.com/templates/next.js/modernize-admin-dashboard)

---

## 更新履歴

| 日付 | 版数 | 更新内容 | 更新者 |
|------|------|---------|--------|
| 2026-01-28 | 1.0 | 初版作成。Vercel/Supabase風のUIデザイン設計を策定 | Teppei & Claude |
| 2026-01-28 | 1.1 | 検索機能・Command Menuを実装予定なしに変更。ヘッダーから検索アイコンを削除 | Teppei & Claude |

---

## Sources

**Design System Resources:**
- [Vercel Geist Typography](https://vercel.com/geist/typography)
- [Geist Design System – Vercel Framework](https://designsystems.surf/design-systems/vercel)
- [Supabase Design System](https://supabase-design-system.vercel.app/)
- [Vercel Dashboard Overview](https://vercel.com/docs/dashboard-features)

**UI Templates & Patterns:**
- [Next.js & shadcn/ui Admin Dashboard Template](https://vercel.com/templates/next.js/next-js-and-shadcn-ui-admin-dashboard)
- [21+ Best Next.js Admin Dashboard Templates - 2026](https://nextjstemplates.com/blog/admin-dashboard-templates)
- [Best Dashboard Design Examples & Inspirations for 2026](https://muz.li/blog/best-dashboard-design-examples-inspirations-for-2026/)
- [shadcn/ui Dashboard Templates](https://www.shadcn.io/template/category/dashboard)
