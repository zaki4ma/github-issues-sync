# GitHub Issues Sync

GitHubのプライベートリポジトリからIssuesを取得し、ローカルのMarkdownファイルとして同期するCLIツールです。

> 🤖 このツールは[Claude Code](https://claude.ai/code)を使用して開発されました。

## 特徴

- 🔄 GitHubリポジトリからIssuesを自動同期
- 📁 Issues を状態別（Active/Todo/Done/Blocked）にディレクトリ分けして整理
- 🗂️ **自動Issue状態管理** - GitHub上の状態変更に応じた自動ファイル移動
- 🎯 **Claude Code最適化** - 未完了タスクのみを`todo`フォルダに整理してモチベーション維持
- 💬 **コメント同期** - Issue・コメントを完全同期
- 🖼️ **画像分析機能** - GitHub画像URLの自動検出・情報表示
- 🎯 **Sub-issues対応** - タスクリスト、関係性、進捗管理
- 🎨 複雑度に応じた自動テンプレート選択
- 📋 インデックスファイルの自動生成
- 🛠️ 複数リポジトリの一括処理・並列処理
- ⚡ 増分同期による高速化
- 🔍 高度なフィルタリング機能
- 💾 キャッシュ機能によるパフォーマンス向上
- 🛡️ 堅牢なエラーハンドリングと自動リトライ

## インストール

```bash
git clone https://github.com/zaki4ma/github-issues-sync.git
cd github-issues-sync
npm install
```

## クイックスタート

### 1. 初期設定
```bash
# 設定ファイルを初期化
npm run start init

# 環境変数ファイルをコピー
cp .env.example .env
```

### 2. GitHub Personal Access Tokenの設定

1. [GitHub Settings > Personal access tokens](https://github.com/settings/tokens) へアクセス
2. **Generate new token (classic)** をクリック
3. 必要なスコープを選択:
   - `repo` - プライベートリポジトリへのアクセス（必須）
   - `read:org` - 組織のリポジトリアクセス（オプション）
4. トークンをコピーして `.env` ファイルに追加:

```bash
# .env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. リポジトリ設定

`config.yml` を編集して同期対象リポジトリを設定:

```yaml
repositories:
  - owner: "your-username"
    repo: "your-project"
    output_dir: "./docs/issues"
    display_name: "Your Project"
    filters:
      states: ["open"]
      labels: []
```

### 4. 同期実行

```bash
# 初回同期（同期追跡データが作成される）
npm run start sync
```

## 使用方法

### 基本コマンド

```bash
# 基本的な同期
npm run start sync

# 同期状況の確認
npm run start status

# 初回設定
npm run start init

# ヘルプ表示
npm run start --help
```

### 高度なオプション

```bash
# 特定プロジェクトのみ同期
npm run start sync --project my-repo

# リポジトリグループでの同期
npm run start sync --group personal

# 並列処理での高速同期
npm run start sync --parallel

# フル同期（増分同期を無効）
npm run start sync --no-incremental

# キャッシュ無効化（最新データを強制取得）
npm run start sync --no-cache

# 強制的な状態別ファイル再整理
npm run start sync --force-reorganize

# ドライラン（実際の同期はしない）
npm run start sync --dry-run

# ファイル整理のみ実行
npm run start reorganize

# ファイル整理のドライラン
npm run start reorganize --dry-run
```

## 設定ファイル詳細

### 基本設定 (config.yml)

```yaml
github:
  token: "${GITHUB_TOKEN}"

# 複数リポジトリの設定
repositories:
  - owner: "your-username"
    repo: "project-alpha"
    output_dir: "../project-alpha/docs/issues"
    display_name: "Project Alpha"
    filters:
      states: ["open"]
      labels: []
  
  - owner: "your-username"
    repo: "project-beta"
    output_dir: "../project-beta/docs/issues"
    display_name: "Project Beta"

# グローバルフィルター
filters:
  states: ["open"]          # open, closed, all
  labels: []                # 空=全ラベル
  assignee: null            # null=全員, "username", "none"
  sort: "updated"           # created, updated, comments
  direction: "desc"         # asc, desc

# 出力設定
output:
  group_by_state: true               # 状態別ディレクトリ分け
  create_index: true                 # インデックスファイル作成
  use_enhanced_template: true        # 拡張テンプレート使用
  auto_reorganize: true              # Issue状態変更時の自動ファイル移動
  create_master_index: false         # マスターインデックス作成
  master_index_path: "./docs/master-index.md"
```

### コメント同期設定

```yaml
# コメント同期設定
comments:
  enabled: true                    # コメント同期の有効化
  limit: 50                       # 1つのIssue当たりの最大コメント数
  sort: "created"                 # created, updated
  direction: "asc"                # asc, desc
  include_metadata: true          # メタデータの表示
```

### 画像分析設定

```yaml
# 画像分析設定
images:
  enabled: true                   # 画像処理の有効化
  download_enabled: true          # 画像のローカルダウンロード
  analyze_enabled: true           # 画像分析の実行
  output_analysis: true           # 分析結果のMarkdown出力
  download_directory: "./downloaded_images"
  max_file_size: 10              # 最大ファイルサイズ（MB）
  cleanup_after_hours: 168       # 古い画像の削除（時間）
```

### 高度なフィルタリング

```yaml
filters:
  # 複数状態
  states: ["open", "closed"]
  
  # ラベル条件
  labels: ["bug", "enhancement"]
  label_mode: "any"          # any, all, none
  exclude_labels: ["wontfix"]
  
  # ユーザーフィルター
  assignee: "username"       # 特定ユーザーのみ
  creator: "username"        # 作成者フィルター
  mentioned: "username"      # メンション済み
  
  # 日付フィルター
  since: "2024-01-01"        # この日以降に更新
  until: "2024-12-31"        # この日までに更新
  
  # カスタムクエリ
  query: "is:issue label:bug in:title"  # GitHub検索構文
```

## 出力ディレクトリ構造

```
docs/issues/
├── index.md              # Issues概要とリンク集
├── active/               # 作業中のIssues
│   └── 123-feature-x.md
├── todo/                 # 未着手のIssues
│   ├── 124-bug-fix.md
│   └── 125-enhancement.md
├── done/                 # 完了済みIssues
│   └── 122-completed.md
└── blocked/              # ブロック中のIssues
    └── 121-waiting.md
```

## 主要機能詳細

### 🗂️ 自動Issue状態管理機能

GitHub上でIssueの状態が変更された際に、ローカルファイルを適切なフォルダに自動移動する機能です。

#### 🎯 主な特徴

- **自動ファイル移動**: GitHub上でIssueを完了済み（Closed）にマークすると、次回同期時に`todo`フォルダから`done`フォルダに自動移動
- **Claude Code最適化**: `todo`フォルダには未完了のIssueのみが残るため、Claude Codeでのタスク管理がより効率的
- **状態別分類**: Issues を以下の4つの状態に自動分類
  - `todo/` - 未着手のIssues（open状態）
  - `active/` - 作業中のIssues（"in progress"や"active"ラベル付き）
  - `done/` - 完了済みIssues（closed状態）
  - `blocked/` - ブロック中のIssues（"blocked"ラベル付き）

#### 📁 フォルダ構造の例

```
docs/issues/
├── index.md              # Issues概要（状態別サマリー付き）
├── todo/                 # 未完了タスク（Claude Codeが参照）
│   ├── 124-bug-fix.md
│   └── 125-enhancement.md
├── done/                 # 完了済みタスク
│   ├── 122-completed.md
│   └── 123-released.md
├── active/               # 作業中
│   └── 126-in-progress.md
└── blocked/              # ブロック中
    └── 127-waiting.md
```

#### 🚀 使用方法

##### 基本的な同期（自動移動有効）
```bash
# GitHub上でIssueをClosedにマークした後、通常通り同期
npm run start sync

# 状態変更を強制的に反映
npm run start sync --force-reorganize
```

##### 手動でのファイル整理
```bash
# 現在のGitHub Issue状態に基づいてファイルを再整理
npm run start reorganize

# ドライラン（実際の移動はせず、移動予定を表示）
npm run start reorganize --dry-run

# 特定プロジェクトのみ整理
npm run start reorganize --project my-repo
```

#### ⚙️ 設定オプション

```yaml
# config.yml
output:
  group_by_state: true      # 状態別フォルダ分けを有効化
  auto_reorganize: true     # 自動ファイル移動を有効化
  
filters:
  states: ["all"]           # open と closed 両方を取得（重要！）
```

> **重要**: `states: ["all"]` または `states: ["open", "closed"]` の設定が必要です。`states: ["open"]` のままでは完了済みIssueが取得されず、自動移動機能が動作しません。

#### 🎨 インデックスファイルの改善

状態管理機能により、インデックスファイルは以下のように改善されます：

```markdown
# Issues Overview

**Last Updated:** 2025-07-08T22:01:41.143Z  
**Total Issues:** 11

## Todo Issues (3)
- [#4 簡易的な管理画面が欲しい](./todo/4-issue.md)
- [#8 カレンダーから行ける日次レポート改善](./todo/8-issue.md)
- [#10 今日のチェックインについて](./todo/10-issue.md)

## Recently Completed (8)
- [#1 記録の時、サブカテゴリで内容選択の改善](./done/1-issue.md) - Closed: 2025-01-15
- [#2 記録ボタンを大きく画面下に固定](./done/2-issue.md) - Closed: 2025-01-14
- [#3 記録後の画面リセット](./done/3-issue.md) - Closed: 2025-01-13
...
```

#### 🔧 トラブルシューティング

**Q: Issue を完了済みにしたのに `todo` フォルダに残っている**

A: 以下を確認してください：

1. 設定で `states: ["all"]` になっているか
2. キャッシュをクリアして最新データを取得
3. 手動でファイル整理を実行

```bash
# 1. キャッシュクリア + 最新データ取得
npm run start sync --no-cache

# 2. 手動整理
npm run start reorganize

# 3. 設定確認
cat config.yml | grep -A 2 "filters:"
```

**Q: 自動移動機能を無効にしたい**

A: 設定で無効化できます：

```yaml
output:
  auto_reorganize: false    # 自動移動を無効化
```

### 💬 コメント同期機能

GitHub IssueとコメントをMarkdownに完全同期：

```markdown
## Comments (2)

### username - 2024-01-15 10:30:22

コメントの内容がここに表示されます。
複数行のコメントも正しく同期されます。

*Last updated: 2024-01-15 10:32:15*

---
```

**特徴:**
- 投稿者・日時の正確な記録
- 編集履歴の追跡
- 増分同期による効率的な更新
- 設定可能なコメント数制限

### 🖼️ 画像分析機能

Issue・コメント内の画像を自動検出・情報表示：

```markdown
## Images (2)

### Image issue-4-image-1.png

- **Original URL**: [GitHub画像URL](https://github.com/user-attachments/assets/...)

### Image Analysis Results

#### issue-4-image-1.png

**Analysis Summary:**
PNG image file containing potential UI elements, screenshots, or diagrams

**Detected Elements:**
- Screenshot
- Admin Dashboard
- User Interface
```

**特徴:**
- GitHub画像URLの自動検出
- 画像メタデータの抽出
- ファイル名・サイズ情報の表示
- 将来的なClaude Code画像分析統合対応

### 🎯 Sub-issues対応機能

#### タスクリスト進捗管理

GitHub issueに以下のようなタスクリストがある場合：

```markdown
- [x] 設計ドキュメント作成
- [ ] 実装
- [ ] テスト作成
- [x] レビュー依頼 #456
```

自動的に進捗バーと統計が生成されます：

```
## Task Progress (2/4)
████████░░░░░░░░░░░░ 50%

### Tasks
- [x] 設計ドキュメント作成 ✅
- [ ] 実装 ⭕
- [ ] テスト作成 ⭕
- [x] レビュー依頼 #456 ✅
```

#### Issue関係性の抽出

以下のキーワードを自動検出：
- `closes #123`, `fixes #456` → "Closes" セクション
- `related to #789` → "Related to" セクション  
- `depends on #101` → "Depends on" セクション
- `blocks #202` → "Blocks" セクション

## よくある質問

### Q: 出力ディレクトリを変更したらファイルが生成されない

**A:** 出力ディレクトリを変更した際は、同期追跡データをリセットしてください：

```bash
rm -rf .sync
npm run start sync
```

### Q: 特定のラベルのIssuesだけを同期したい

**A:** フィルター設定を使用：

```yaml
filters:
  labels: ["bug", "enhancement"]
  label_mode: "any"  # いずれかのラベルを持つ
```

### Q: プライベートリポジトリにアクセスできない

**A:** GitHub tokenに`repo`スコープが含まれているか確認してください。組織のリポジトリの場合は`read:org`も必要な場合があります。

### Q: 同期が遅い

**A:** 並列処理とキャッシュを活用：

```bash
npm run start sync --parallel
```

### Q: エラーが発生する

**A:** ログを確認：

```bash
# ログファイルの確認
ls logs/
cat logs/sync-$(date +%Y-%m-%d).log
```

## トラブルシューティング

### 認証エラー
```
Error: Authentication failed
```
- GitHub tokenが正しく設定されているか確認
- tokenの有効期限を確認
- 必要なスコープが付与されているか確認

### ファイル権限エラー
```
Error: Permission denied
```
- 出力ディレクトリの書き込み権限を確認
- 相対パスが正しいか確認

### レート制限エラー
```
Error: API rate limit exceeded
```
- しばらく待ってから再実行
- `performance.rate_limit_delay`を調整

## 開発・カスタマイズ

### テンプレートカスタマイズ

`templates/` ディレクトリのファイルを編集：

- `issue.md` - 標準テンプレート
- `issue-enhanced.md` - 拡張テンプレート（sub-issues対応）
- `index.md` - インデックスファイルテンプレート

### 使用可能な変数

#### 基本情報
- `{{title}}`, `{{number}}`, `{{body}}`, `{{state}}`
- `{{created_at}}`, `{{updated_at}}`, `{{html_url}}`
- `{{labels}}`, `{{assignees}}`, `{{milestone}}`

#### コメント・画像情報
- `{{comments}}` - コメント配列
- `{{comments.length}}` - コメント数
- `{{imageData.images}}` - 画像配列
- `{{imageData.images.length}}` - 画像数
- `{{imageData.analyses}}` - 画像分析結果

#### 拡張情報（enhanced template）
- `{{progress.percentage}}` - 進捗率
- `{{taskListMarkdown}}` - タスクリスト
- `{{subIssuesMarkdown}}` - Sub-issues
- `{{relationshipsMarkdown}}` - 関係性
- `{{metadata.complexity}}` - 複雑度（simple/moderate/complex）

## ライセンス

MIT License