# CLAUDE.md

このファイルは、このリポジトリでコードを作業する際にClaude Code (claude.ai/code) にガイダンスを提供します。

## 会話のガイドライン

- 常に日本語で会話する

## 開発コマンド

### ビルドと開発

- `npm run dev` - Mastraフレームワークを使用して開発サーバーを起動
- `npm run build` - Mastraビルドシステムを使用してプロジェクトをビルド

### コード品質

- `npm run lint` - TypeScript/JavaScriptファイルでESLintを実行
- `npm run lint:fix` - ESLintの問題を自動修正
- `npm run format` - Prettierでコードをフォーマット
- `npm run format:check` - コードフォーマットをチェック

### テスト

- 現在テストスイートは設定されていません（`npm test`は失敗します）

## アーキテクチャ概要

これは、Mastra AIフレームワークで構築された個人用求人エージェントシステムです。このシステムは複数の専門化されたAIエージェントを使用して、求人検索とマッチングを支援します。

### コアコンポーネント

**Mastraフレームワーク統合** (`src/mastra/index.ts`):

- ストレージにLibSQL（ファイルデータベース）を使用した中央設定
- 3つのメインエージェントが登録されています：RecruitAgent、ChecklistAgent、JobMatcherAgent
- 開発にはインメモリデータベースを使用

**エージェントシステム**:

- **RecruitAgent** (`src/mastra/agents/recruit-agent.ts`): 積極的な検索戦略を持つ求人検索スペシャリスト、マルチフェーズ検索を通じて10件以上の求人を見つけることを目標とする
- **ChecklistAgent** (`src/mastra/agents/checklist-agent.ts`): ユーザー要件を構造化されたMarkdownチェックリストに変換
- **JobMatcherAgent** (`src/mastra/agents/job-matcher-agent.ts`): 詳細なスコアリングアルゴリズムを使用して求人適合性を分析（推奨には80%以上の閾値）

**外部統合**:

- **LAPRAS MCP クライアント** (`src/mastra/mcp-client/lapras-mcp.ts`): MCP（Model Context Protocol）を介してLAPRAS求人検索サービスに接続
- NPXを使用してLAPRAS MCPサーバーを実行: `npx -y @lapras-inc/lapras-mcp-server`

### エージェントの行動パターン

**RecruitAgent検索戦略**:

- 厳密な条件からより広い検索へのマルチフェーズ拡張を使用
- 技術や職種キーワードを拡張しながら、コアな制約（給与、リモートワーク、雇用形態）を維持
- 求人結果と検索統計を含む構造化されたJSONを出力

**JobMatcherAgent評価**:

- 重み付けスコアリングシステム：技術スタック（30%）、働き方（25%）、給与（20%）、会社（15%）、その他（10%）
- ユーザーチェックリストで明示的に言及された条件のみを評価
- 不足している条件は負のスコアではなく「制約なし」として扱う
- 肯定的な推奨には80%以上のマッチ率が必要

### メモリと状態管理

すべてのエージェントは以下を追跡するワーキングメモリテンプレートを持つLibSQLストレージを使用します：

- ユーザープロファイルと設定
- 検索履歴と戦略
- 求人マッチング結果とパターン
- 評価基準の一貫性

### 技術スタック

- **ランタイム**: Node.js 20.9.0+、ES2022モジュール
- **AIモデル**: Google Gemini（2.0-flash-exp、2.5-flash-preview）
- **フレームワーク**: MCP統合を持つMastra AIフレームワーク
- **ストレージ**: エージェントメモリ用LibSQL（SQLite互換）
- **コード品質**: Huskyプレコミットフックを持つESLint + Prettier

## 開発ノート

- プロジェクトはESモジュールを使用（package.jsonで`"type": "module"`）
- TypeScript設定はバンドラーモジュール解決でES2022をターゲット
- ローカルに作成されるデータベースファイル：`database.db`と`mastra.db`
- すべてのエージェント指示は日本語で、日本の求人市場をターゲット
- LAPRAS統合により日本のエンジニア求人リストへのアクセスを提供

## MCP サーバー利用指針

### Mastra ドキュメント参照

- Mastraの実装や機能について調べる際は、必ず`mcp__mastra__mastraDocs`を使用してドキュメントを参照する
- `mcp__mastra__mastraExamples`で関連するコード例を確認する
- `mcp__mastra__mastraChanges`で最新の変更履歴を確認する

### GitHub リポジトリ情報取得

- GitHubのリポジトリに関する詳細情報が必要な場合は`mcp__deepwiki__*`ツールを活用する
- リポジトリの構造理解や機能調査に`mcp__deepwiki__read_wiki_structure`と`mcp__deepwiki__read_wiki_contents`を使用する
- 特定の技術的質問には`mcp__deepwiki__ask_question`を活用する

### 実装ガイドライン

- 新機能実装前には必ずMastraの公式ドキュメントとサンプルコードを確認する
- 不明な点がある場合は、コードを推測せずにMCP経由でドキュメントを参照する
- 最新のベストプラクティスを確認するため、定期的に変更履歴をチェックする
