# GitHub Issues Sync

GitHubのプライベートリポジトリからIssuesを取得し、ローカルのMarkdownファイルとして同期するCLIツールです。

> 🤖 このツールは[Claude Code](https://claude.ai/code)を使用して開発されました。

## 特徴

- 🔄 GitHubリポジトリからIssuesを自動同期
- 📁 Issues を状態別（Active/Todo/Done/Blocked）にディレクトリ分けして整理
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

# ドライラン（実際の同期はしない）
npm run start sync --dry-run
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

## Sub-issues対応機能

### タスクリスト進捗管理

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

### Issue関係性の抽出

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

#### 拡張情報（enhanced template）
- `{{progress.percentage}}` - 進捗率
- `{{taskListMarkdown}}` - タスクリスト
- `{{subIssuesMarkdown}}` - Sub-issues
- `{{relationshipsMarkdown}}` - 関係性
- `{{metadata.complexity}}` - 複雑度（simple/moderate/complex）

## ライセンス

MIT License