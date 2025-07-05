# CLAUDE.md

このファイルは、このリポジトリでコードを作業する際にClaude Code (claude.ai/code) にガイダンスを提供します。

## 会話のガイドライン

- 常に日本語で会話する
- Mastraについて質問された場合は、必ず`mcp__mastra__*`ツールを使用してドキュメントを参照する
- MCPツールでも解決できない場合は、`mcp__deepwiki__ask_question`を使用してmastra-ai/mastraリポジトリで調べる

## 開発コマンド

### ビルドと開発

- `npm run dev` - Mastraフレームワークを使用して開発サーバーを起動
- `npm run build` - Mastraビルドシステムを使用してプロジェクトをビルド

### コード品質

- `npm run lint` - TypeScript/JavaScriptファイルでESLintを実行
- `npm run lint:fix` - ESLintの問題を自動修正
- `npm run format` - Prettierでコードをフォーマット
- `npm run format:check` - コードフォーマットをチェック
- `npx tsc --noEmit` - TypeScript型チェック

**重要**: コード変更後は必ず以下を実行してエラーがないことを確認する：

1. `npm run lint` - ESLintチェック
2. `npx tsc --noEmit` - TypeScript型チェック

### Docker & AWS Lambda デプロイメント

- `npm run build:docker` - Docker イメージをビルド
- `npm run build:docker-ecr` - AWS ECR 用 Docker イメージをビルド（ARM64）
- `npm run test:docker` - Docker コンテナをローカルでテスト実行
- `npm run deploy:docker` - AWS ECR にイメージをプッシュしてデプロイ

### テスト

- 現在テストスイートは設定されていません（`npm test`は失敗します）

## アーキテクチャ概要

これは、Mastra AIフレームワークで構築された個人用求人エージェントシステムです。このシステムは複数の専門化されたAIエージェントを使用して、求人検索とマッチングを支援し、AWS Lambdaでサーバーレス実行されています。

### デプロイメントアーキテクチャ

**AWS Lambda 統合** (`src/lambda.ts`):

- API Gateway + Lambda による HTTPエンドポイント
- POST リクエストでユーザー要件を受信し、統合ワークフローを実行
- コンテナイメージによるデプロイメント（Dockerfile）
- ARM64アーキテクチャでECRにプッシュ

### コアコンポーネント

**Mastraフレームワーク統合** (`src/mastra/index.ts`):

- ストレージにLibSQL（インメモリデータベース）を使用した中央設定
- 3つのメインエージェントが登録されています：JobSearchAgent、ChecklistAgent、JobMatcherAgent
- 統合ワークフロー：`recruitWorkflow` - 3つのエージェントを連携させる自動化フロー
- 全環境でインメモリデータベース（`:memory:`）を使用

**エージェントシステム**:

- **JobSearchAgent** (`src/mastra/agents/job-search-agent.ts`): 積極的な検索戦略を持つ求人検索スペシャリスト、マルチフェーズ検索を通じて10件以上の求人を見つけることを目標とする
- **ChecklistAgent** (`src/mastra/agents/checklist-agent.ts`): ユーザー要件を構造化されたMarkdownチェックリストに変換
- **JobMatcherAgent** (`src/mastra/agents/job-matcher-agent.ts`): 詳細なスコアリングアルゴリズムを使用して求人適合性を分析（推奨には80%以上の閾値）

**統合ワークフローシステム** (`src/mastra/workflows/recruit-workflow.ts`):

- **統合求人マッチングワークフロー**: 3つのエージェントを自動連携させる統合フロー
- **日付フィルタリング**: 指定日数以内の新しい求人のみを抽出（デフォルト7日、環境変数`JOB_FILTER_DAYS`で調整可能）
- **並列処理**: 求人のマッチング分析（エラー耐性付き）
- **重複削除**: 検索結果の重複求人を自動除去
- **自動フィルタリング**: 80%以上のマッチング率のみを推奨として抽出
- **結果ソート**: マッチング率降順で結果を整理
- **Slack通知**: マッチング結果を自動的にSlackに通知

**Slack統合**:

- **Job Slack Formatter** (`src/mastra/formatters/job-slack-formatter.ts`): 求人結果をSlack Block Kit形式とプレーンテキスト形式の両方でフォーマット
- **Slack Sender** (`src/mastra/utils/slack-sender.ts`): Slackへの通知送信機能
- リッチフォーマット（Block Kit）とプレーンテキストの両方をサポート

**外部統合**:

- **LAPRAS MCP クライアント** (`src/mastra/mcp-client/lapras-mcp.ts`): MCP（Model Context Protocol）を介してLAPRAS求人検索サービスに接続
- NPXを使用してLAPRAS MCPサーバーを実行: `npx -y @lapras-inc/lapras-mcp-server`

### エージェントの行動パターン

**JobSearchAgent検索戦略**:

- 厳密な条件からより広い検索へのマルチフェーズ拡張を使用（Phase 1-5）
- 技術や職種キーワードを拡張しながら、コアな制約（給与、リモートワーク、雇用形態）を維持
- AND検索の性質を考慮した条件変更（追加ではなく変更・絞り込み緩和）
- 求人結果と検索統計を含む構造化されたJSONを出力

**JobMatcherAgent評価**:

重み付けスコアリングシステム：技術スタック（30%）、働き方（25%）、給与（20%）、会社（15%）、その他（10%）

- ユーザーチェックリストで明示的に言及された条件のみを評価
- 不足している条件は負のスコアではなく「制約なし」として扱う
- 肯定的な推奨には80%以上のマッチ率が必要
- 客観的事実のみで評価、推測・推論は禁止

**統合ワークフロー実行フロー**:

1. **ChecklistAgent**: ユーザーの自由文要望をMarkdownチェックリストに変換（優先度明確化）
2. **JobSearchAgent**: チェックリストを元に積極的な求人検索（10件以上目標）
3. **日付フィルタリング**: 指定日数以内（デフォルト7日）の新しい求人のみを抽出
4. **重複削除**: job_description_idベースで重複求人を自動除去
5. **JobMatcherAgent**: 求人のマッチング分析（エラー時は該当案件をスキップして継続）
6. **フィルタリング**: 80%以上のマッチング率の求人のみを抽出
7. **ソート**: マッチング率降順で結果を整理
8. **Slack通知**: マッチング結果をSlackに自動通知（Block Kit形式）

### メモリと状態管理

すべてのエージェントは以下を追跡するワーキングメモリテンプレートを持つLibSQLストレージを使用します：

- ユーザープロファイルと設定
- 検索履歴と戦略
- 求人マッチング結果とパターン
- 評価基準の一貫性

### 技術スタック

- **ランタイム**: Node.js 20.9.0+、ES2022モジュール
- **デプロイメント**: AWS Lambda（Container Image）、Docker、AWS ECR
- **AIモデル**: 切り替え可能（Gemini: 2.0-flash-exp、2.5-flash-preview | OpenAI: GPT-4.1-mini、GPT-4o-mini、GPT-4o）
- **フレームワーク**: MCP統合を持つMastra AIフレームワーク
- **ストレージ**: エージェントメモリ用LibSQL（SQLite互換、インメモリモード）
- **外部統合**: Slack（Webhook、Block Kit）、LAPRAS（MCP）
- **コード品質**: Huskyプレコミットフックを持つESLint + Prettier
- **ビルドツール**: esbuild、TypeScript

## 開発ノート

- プロジェクトはESモジュールを使用（package.jsonで`"type": "module"`）
- TypeScript設定はバンドラーモジュール解決でES2022をターゲット
- ローカルに作成されるデータベースファイル：`mastra.db`、`mastra.db-shm`、`mastra.db-wal`
- すべてのエージェント指示は日本語で、日本の求人市場をターゲット
- LAPRAS統合により日本のエンジニア求人リストへのアクセスを提供
- AWS Lambda環境では常にインメモリデータベース（`:memory:`）を使用
- Slack通知機能により求人マッチング結果を自動配信

## コーディング規約

- **関数定義**: 必ずアロー関数を使用する（`function` 宣言は使用しない）

  ```typescript
  // ✅ 正しい
  const myFunction = () => {};

  // ❌ 避ける
  function myFunction() {}
  ```

## ロギング設定

### PinoLogger設定

PinoLoggerが設定されており、アプリケーションの動作状況をログで確認できます：

```typescript
// src/mastra/index.ts
import { PinoLogger } from '@mastra/loggers';

const logger = new PinoLogger({
  name: 'PersonalRecruitAgent',
  level: 'info',
});
```

### ログレベル

- `trace` (10) - 最も詳細なデバッグ情報
- `debug` (20) - デバッグ情報
- `info` (30) - 一般的な情報（デフォルト）
- `warn` (40) - 警告
- `error` (50) - エラー
- `fatal` (60) - 致命的エラー

## AIモデル設定と切り替え

### 現在のモデル設定

現在の設定では、全エージェントのモデルを一括で切り替え可能です。設定は `src/mastra/config/model-config.ts` で管理されています。

### 切り替え方法

**Gemini から GPT-4.1-mini に切り替え:**

```typescript
// src/mastra/config/model-config.ts
export const MODEL_CONFIG = {
  provider: 'openai' as ModelProvider, // 'gemini' → 'openai'
  // 以下省略
};
```

**GPT-4.1-mini から Gemini に戻す:**

```typescript
// src/mastra/config/model-config.ts
export const MODEL_CONFIG = {
  provider: 'gemini' as ModelProvider, // 'openai' → 'gemini'
  // 以下省略
};
```

### 必要な環境変数

**Gemini使用時:**

```bash
export GOOGLE_GENERATIVE_AI_API_KEY="your-api-key"
```

**OpenAI使用時:**

```bash
export OPENAI_API_KEY="your-api-key"
```

**Slack統合（オプション）:**

```bash
export SLACK_WEBHOOK_URL="your-slack-webhook-url"
```

**求人フィルタリング（オプション）:**

```bash
export JOB_FILTER_DAYS="7"  # デフォルト: 7日以内の求人のみ表示
```

**AWS デプロイメント（オプション）:**

```bash
export ECR_REGISTRY="your-ecr-registry-url"
```

### 利用可能なモデル

- **Gemini**: `gemini-2.0-flash-exp` (デフォルト), `gemini-2.5-flash-preview`
- **OpenAI**: `gpt-4.1-mini` (デフォルト), `gpt-4o-mini`, `gpt-4o`

詳細な切り替え手順は `src/mastra/config/README.md` を参照してください。

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
