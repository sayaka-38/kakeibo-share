# Kakeibo Share - UI ガイドライン

> 参照元: [claude-code/plugins/frontend-design](https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md)

このガイドラインは、Kakeibo Share の UI 実装における品質基準を定義します。

---

## 1. デザイン思考

コーディングの前に、コンテキストを理解し、明確な美的方向性を決定する。

### 確認事項

- **Purpose（目的）**: このインターフェースはどんな問題を解決するか？誰が使うか？
- **Tone（トーン）**: ミニマル、モダン、親しみやすい、プロフェッショナルなど
- **Constraints（制約）**: 技術要件（フレームワーク、パフォーマンス、アクセシビリティ）
- **Differentiation（差別化）**: 何がこの UI を印象的にするか？

### Kakeibo Share のデザイン方向性

- **トーン**: クリーン・モダン・親しみやすい
- **カラー**: 青系を基調とした信頼感のあるパレット
- **フォント**: システムフォントを基本に、読みやすさを重視

---

## 2. Tailwind CSS クラス並び順

**重要**: クラスは以下の順序で記述すること。一貫性のあるコードベースを維持するため厳守する。

### 推奨順序

```
1. レイアウト（Layout）
2. フレックスボックス/グリッド（Flexbox/Grid）
3. スペーシング（Spacing）
4. サイズ（Sizing）
5. タイポグラフィ（Typography）
6. 背景（Background）
7. ボーダー（Border）
8. エフェクト（Effects）
9. フィルター（Filters）
10. トランジション/アニメーション（Transition/Animation）
11. インタラクティブ（Interactive）
12. レスポンシブ修飾子（Responsive）
13. 状態修飾子（State）
```

### 具体例

```tsx
// Good - 推奨順序に従っている
<button className="flex items-center justify-center gap-2 px-4 py-2 w-full text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
  Submit
</button>

// Bad - 順序がバラバラ
<button className="text-white hover:bg-blue-700 px-4 bg-blue-600 flex py-2 rounded-lg items-center">
  Submit
</button>
```

### カテゴリ別クラス一覧

#### 1. レイアウト（Layout）
```
block, inline-block, inline, flex, inline-flex, grid, inline-grid
hidden, visible
static, fixed, absolute, relative, sticky
top-*, right-*, bottom-*, left-*, inset-*
z-*
```

#### 2. フレックスボックス/グリッド（Flexbox/Grid）
```
flex-row, flex-col, flex-wrap
items-*, justify-*, content-*, self-*
gap-*, gap-x-*, gap-y-*
grid-cols-*, grid-rows-*
col-span-*, row-span-*
```

#### 3. スペーシング（Spacing）
```
p-*, px-*, py-*, pt-*, pr-*, pb-*, pl-*
m-*, mx-*, my-*, mt-*, mr-*, mb-*, ml-*
space-x-*, space-y-*
```

#### 4. サイズ（Sizing）
```
w-*, min-w-*, max-w-*
h-*, min-h-*, max-h-*
```

#### 5. タイポグラフィ（Typography）
```
text-xs, text-sm, text-base, text-lg, text-xl, text-2xl...
font-thin, font-light, font-normal, font-medium, font-semibold, font-bold
text-left, text-center, text-right
text-{color}-*
leading-*, tracking-*
truncate, line-clamp-*
```

#### 6. 背景（Background）
```
bg-{color}-*
bg-gradient-*, from-*, via-*, to-*
bg-opacity-*
```

#### 7. ボーダー（Border）
```
border, border-*, border-t-*, border-r-*, border-b-*, border-l-*
border-{color}-*
rounded, rounded-*, rounded-t-*, rounded-r-*, rounded-b-*, rounded-l-*
```

#### 8. エフェクト（Effects）
```
shadow, shadow-*
opacity-*
```

#### 9. トランジション/アニメーション
```
transition, transition-*
duration-*
ease-*
animate-*
```

#### 10. インタラクティブ
```
cursor-*
select-*
```

#### 11. 状態修飾子
```
hover:*, focus:*, active:*, disabled:*, group-hover:*
```

---

## 3. スペーシング（Spacing）ガイドライン

### 基本原則

- **4px 単位**: Tailwind のデフォルトスケールを使用（1 = 4px）
- **一貫性**: 同じコンテキストでは同じスペーシングを使用
- **8pt グリッド**: 主要な間隔は 8 の倍数を推奨（2, 4, 6, 8, 12, 16...）

### スペーシングスケール

| クラス | サイズ | 用途 |
|--------|--------|------|
| `*-0` | 0px | リセット |
| `*-1` | 4px | 極小（アイコンとテキストの間隔） |
| `*-2` | 8px | 小（関連要素間） |
| `*-3` | 12px | 小〜中 |
| `*-4` | 16px | 中（セクション内要素間） |
| `*-6` | 24px | 大（セクション間） |
| `*-8` | 32px | 特大（主要セクション間） |

### コンポーネント別スペーシング

#### カード
```tsx
<div className="p-4 md:p-6">  {/* 内部パディング */}
  <h2 className="mb-2">Title</h2>  {/* タイトル下マージン */}
  <p className="mb-4">Content</p>  {/* コンテンツ下マージン */}
  <button>Action</button>
</div>
```

#### フォーム
```tsx
<form className="space-y-6">  {/* フォーム項目間 */}
  <div>
    <label className="block text-sm font-medium mb-1">Label</label>
    <input className="px-3 py-2" />  {/* 入力フィールド内部 */}
  </div>
</form>
```

#### リスト
```tsx
<ul className="divide-y">
  <li className="px-4 py-3">Item</li>  {/* リストアイテム */}
</ul>
```

#### ボタングループ
```tsx
<div className="flex gap-2">  {/* ボタン間の小さい間隔 */}
  <button>Cancel</button>
  <button>Submit</button>
</div>

<div className="flex gap-4">  {/* ボタン間の大きい間隔 */}
  <button>Option A</button>
  <button>Option B</button>
</div>
```

---

## 4. レスポンシブデザイン

### ブレークポイント

| プレフィックス | 最小幅 | 対象デバイス |
|---------------|--------|-------------|
| (なし) | 0px | モバイル（デフォルト） |
| `sm:` | 640px | 大きめのモバイル |
| `md:` | 768px | タブレット |
| `lg:` | 1024px | ラップトップ |
| `xl:` | 1280px | デスクトップ |
| `2xl:` | 1536px | 大画面 |

### モバイルファースト

**重要**: 常にモバイルをベースにし、大きな画面向けにスタイルを追加する。

```tsx
// Good - モバイルファースト
<div className="px-4 md:px-6 lg:px-8">
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    {/* コンテンツ */}
  </div>
</div>

// Bad - デスクトップファースト（避ける）
<div className="px-8 sm:px-4">  {/* 逆方向 */}
```

### レスポンシブパターン

#### グリッドレイアウト
```tsx
// 1列 → 2列 → 4列
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
```

#### ナビゲーション
```tsx
// モバイル: 縦積み、デスクトップ: 横並び
<nav className="flex flex-col md:flex-row md:items-center gap-4">
```

#### コンテナ幅
```tsx
// レスポンシブ最大幅
<div className="max-w-sm md:max-w-2xl lg:max-w-4xl mx-auto px-4">
```

#### テキストサイズ
```tsx
// 見出しのレスポンシブサイズ
<h1 className="text-2xl md:text-3xl lg:text-4xl font-bold">
```

#### 表示/非表示
```tsx
// モバイルのみ表示
<button className="md:hidden">Menu</button>

// デスクトップのみ表示
<nav className="hidden md:flex">
```

### Kakeibo Share 固有のレスポンシブルール

#### ダッシュボードグリッド
```tsx
// クイックアクション: 2列 → 4列
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
```

#### カードコンテナ
```tsx
// 最大幅を制限
<div className="max-w-4xl mx-auto px-4 md:px-0">
```

#### フォーム
```tsx
// モバイルでフル幅、デスクトップで適切な幅
<form className="w-full max-w-md mx-auto">
```

---

## 5. タイポグラフィ

### フォントサイズ

| クラス | サイズ | 用途 |
|--------|--------|------|
| `text-xs` | 12px | 補足テキスト、キャプション |
| `text-sm` | 14px | ラベル、サブテキスト |
| `text-base` | 16px | 本文（デフォルト） |
| `text-lg` | 18px | 強調テキスト |
| `text-xl` | 20px | 小見出し |
| `text-2xl` | 24px | 見出し |

### フォントウェイト

| クラス | 用途 |
|--------|------|
| `font-normal` | 本文 |
| `font-medium` | ラベル、強調 |
| `font-semibold` | ボタン、小見出し |
| `font-bold` | 見出し |

### テキストカラー

```tsx
// プライマリテキスト
<p className="text-gray-900">Main text</p>

// セカンダリテキスト
<p className="text-gray-600">Secondary text</p>

// 補助テキスト
<p className="text-gray-500">Helper text</p>

// リンク
<a className="text-blue-600 hover:text-blue-500">Link</a>

// エラー
<p className="text-red-600">Error message</p>

// 成功
<p className="text-green-600">Success message</p>
```

---

## 6. カラーパレット

### プライマリカラー（Blue）

```
bg-blue-50   - 背景（薄）
bg-blue-100  - 背景（ホバー）
bg-blue-600  - プライマリボタン
bg-blue-700  - プライマリボタン（ホバー）
text-blue-600 - リンク、アクセント
```

### グレースケール

```
bg-white     - カード背景
bg-gray-50   - ページ背景
bg-gray-100  - ホバー状態
bg-gray-200  - ボーダー
text-gray-500 - 補助テキスト
text-gray-600 - セカンダリテキスト
text-gray-700 - 通常テキスト
text-gray-900 - 見出し、強調
```

### ステータスカラー

```
// 成功
bg-green-50, text-green-600, border-green-200

// 警告
bg-yellow-50, text-yellow-700, border-yellow-200

// エラー
bg-red-50, text-red-600, border-red-200
```

---

## 7. コンポーネントパターン

### ボタン

```tsx
// プライマリボタン
<button className="flex justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
  Submit
</button>

// セカンダリボタン
<button className="flex justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
  Cancel
</button>
```

### 入力フィールド

```tsx
<input
  type="text"
  className="block w-full px-3 py-2 text-gray-900 border border-gray-300 rounded-lg shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
  placeholder="Enter text"
/>
```

### カード

```tsx
<div className="bg-white rounded-lg shadow">
  <div className="px-4 py-3 border-b border-gray-200">
    <h2 className="text-lg font-medium text-gray-900">Card Title</h2>
  </div>
  <div className="p-4">
    {/* Content */}
  </div>
</div>
```

### アラート

```tsx
// エラー
<div className="px-4 py-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
  Error message
</div>

// 成功
<div className="px-4 py-3 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg">
  Success message
</div>

// 警告
<div className="px-4 py-3 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg">
  Warning message
</div>
```

---

## 8. アンチパターン（避けるべきこと）

### 避けるべきパターン

1. **インラインスタイルの使用**
   ```tsx
   // Bad
   <div style={{ padding: "16px", margin: "8px" }}>

   // Good
   <div className="p-4 m-2">
   ```

2. **クラスの重複**
   ```tsx
   // Bad
   <div className="p-4 p-6">  {/* 競合 */}

   // Good
   <div className="p-6">
   ```

3. **マジックナンバー**
   ```tsx
   // Bad
   <div className="w-[347px]">  {/* 任意の数値 */}

   // Good
   <div className="w-full max-w-sm">
   ```

4. **過度なカスタマイズ**
   ```tsx
   // Bad - Tailwind のスケールから外れた値
   <div className="p-[13px] text-[17px]">

   // Good - Tailwind のスケールを使用
   <div className="p-3 text-base">
   ```

5. **アクセシビリティの無視**
   ```tsx
   // Bad
   <div onClick={handleClick}>Clickable</div>

   // Good
   <button onClick={handleClick}>Clickable</button>
   ```

---

## 9. チェックリスト

UI 実装時に確認すべき項目：

### 実装前
- [ ] デザインの方向性を理解したか
- [ ] モバイルファーストで考えたか

### 実装中
- [ ] Tailwind クラスの並び順を守っているか
- [ ] スペーシングに一貫性があるか
- [ ] レスポンシブ対応しているか（`md:`, `lg:` など）

### 実装後
- [ ] モバイル表示を確認したか
- [ ] タブレット表示を確認したか
- [ ] デスクトップ表示を確認したか
- [ ] ホバー/フォーカス状態を確認したか
- [ ] 既存コンポーネントと視覚的一貫性があるか
