# GitHub Issues Sync Tool - 設計書

## プロジェクト概要

Node.jsベースのCLIツールで、GitHubのプライベートリポジトリからIssuesを取得し、ローカルのMarkdownファイルとして同期するツールを作成する。

## 要件

### 機能要件
- GitHub APIを使ってプライベートリポジトリのIssuesを取得
- 取得したIssuesをMarkdownファイルとして出力
- 手動実行によるCLIツール
- 個人の複数プロジェクト対応
- 将来的なオープンソース化を見据えた設計

### 非機能要件
- 実行時間：数秒以内
- GitHub API レート制限に配慮
- エラーハンドリングと分かりやすいメッセージ
- 設定ファイルによる柔軟な設定

## アーキテクチャ

### ディレクトリ構造
```
github-issues-sync/
├── src/
│   ├── cli.js          # CLI エントリーポイント
│   ├── github.js       # GitHub API 操作
│   ├── fileManager.js  # ローカルファイル管理
│   ├── config.js       # 設定管理
│   └── utils.js        # ユーティリティ関数
├── templates/
│   ├── issue.md        # Issue出力テンプレート
│   └── index.md        # インデックスファイルテンプレート
├── tests/
│   └── (テストファイル)
├── .env.example        # 環境変数サンプル
├── config.example.yml  # 設定ファイルサンプル
├── package.json
├── README.md
└── .gitignore
```

### 出力ディレクトリ構造
```
docs/
├── issues/
│   ├── index.md           # 優先度順の作業リスト
│   ├── active/            # 現在作業中
│   ├── todo/              # 未着手（優先度順）
│   ├── done/              # 完了済み
│   └── blocked/           # ブロック中
```

## CLI インターフェース

### コマンド体系
```bash
# 基本的な同期
gis sync

# 特定プロジェクトのみ
gis sync --project my-app

# 状態確認（同期なし）
gis status

# 初回設定
gis init

# ヘルプ
gis --help
```

### 設定ファイル形式
```yaml
# config.yml
github:
  token: "${GITHUB_TOKEN}"  # 環境変数から取得
  
repositories:
  - owner: "your-username"
    repo: "project-a"
    output_dir: "./docs/issues"
    
filters:
  states: ["open"]
  labels: ["bug", "enhancement", "feature"]
  
templates:
  issue: "./templates/issue.md"
  index: "./templates/index.md"
```

## 主要な依存関係

```json
{
  "dependencies": {
    "@octokit/rest": "^20.0.0",
    "commander": "^11.0.0",
    "chalk": "^5.0.0",
    "yaml": "^2.0.0",
    "mustache": "^4.0.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "eslint": "^8.0.0"
  }
}
```

## Issue Markdownテンプレート

```markdown
# {{title}}

**Issue #{{number}}** | **{{state}}** | **{{created_at}}**

{{#labels}}
- Label: {{name}}
{{/labels}}

{{#assignees}}
- Assignee: {{login}}
{{/assignees}}

{{#milestone}}
- Milestone: {{title}}
{{/milestone}}

## Description

{{body}}

---

**Created:** {{created_at}}  
**Updated:** {{updated_at}}  
**URL:** {{html_url}}
```

## インデックスファイルテンプレート

```markdown
# Issues Overview

**Last Updated:** {{timestamp}}  
**Total Issues:** {{total_count}}

## Active Issues ({{active_count}})

{{#active_issues}}
- [#{{number}} {{title}}](./active/{{number}}-{{slug}}.md) - {{labels}}
{{/active_issues}}

## Todo Issues ({{todo_count}})

{{#todo_issues}}
- [#{{number}} {{title}}](./todo/{{number}}-{{slug}}.md) - {{labels}}
{{/todo_issues}}

## Recently Completed ({{done_count}})

{{#done_issues}}
- [#{{number}} {{title}}](./done/{{number}}-{{slug}}.md) - Completed {{closed_at}}
{{/done_issues}}
```

## 実装フェーズ

### Phase 1: MVP (最小実行可能製品)
1. **プロジェクト初期化**
   - package.json作成
   - 基本ディレクトリ構造作成
   - 依存関係インストール

2. **GitHub API接続**
   - @octokit/rest セットアップ
   - 認証実装
   - 基本的なAPI呼び出しテスト

3. **設定管理**
   - 環境変数読み込み
   - YAML設定ファイル解析
   - 設定検証

4. **Issue取得機能**
   - 単一リポジトリからのIssue取得
   - フィルタリング機能
   - エラーハンドリング

5. **ファイル出力**
   - Markdownテンプレート処理
   - ファイル作成・更新
   - ディレクトリ管理

6. **CLI インターフェース**
   - commander.js セットアップ
   - 基本コマンド実装
   - ヘルプメッセージ

### Phase 2: 機能拡張
- 複数リポジトリ対応
- 増分同期機能
- より詳細なフィルタリング
- パフォーマンス最適化

### Phase 3: 品質向上
- テスト実装
- エラーハンドリング強化
- ドキュメント整備
- パッケージ化

## 技術的考慮事項

### GitHub API
- Personal Access Token による認証
- API レート制限（5000 requests/hour）
- ページネーション対応
- GraphQL API の将来的な利用検討

### ファイル管理
- 既存ファイルの更新検知
- ファイル名の重複回避
- 安全なファイル操作

### エラーハンドリング
- ネットワークエラー
- 認証エラー
- ファイルシステムエラー
- 設定ファイルエラー

## 開始手順

1. **Claude Code起動**
   ```bash
   mkdir github-issues-sync
   cd github-issues-sync
   claude code
   ```

2. **最初のタスク**
   「この設計書に基づいて、GitHub Issues同期ツールの開発を開始してください。まずはPhase 1のプロジェクト初期化から始めて、package.jsonの作成と基本ディレクトリ構造の作成をお願いします。」