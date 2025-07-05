# Personal Recruit Agent

Mastra AIフレームワークで構築された個人用求人エージェントシステムです。複数の専門化されたAIエージェントを使用して、効率的な求人検索とマッチングを支援します。

## 特徴

- **マルチエージェントシステム**: 求人検索、要件分析、マッチング評価を専門化されたAIエージェントが自動実行
- **統合ワークフロー**: 3つのエージェントが連携する自動化された求人マッチングフロー
- **LAPRAS統合**: 日本のエンジニア求人情報への直接アクセス
- **高精度マッチング**: 重み付けスコアリングシステムによる80%以上の精度保証
- **並列処理**: 最大10件の求人を同時分析してパフォーマンスを最適化
- **重複除去**: 検索結果の重複求人を自動で削除

## 技術スタック

- **Runtime**: Node.js 20.9.0+
- **言語**: TypeScript (ES2022)
- **AIフレームワーク**: Mastra AI Framework
- **AIモデル**: Gemini 2.5-flash / GPT-4.1-mini（切り替え可能）
- **ストレージ**: LibSQL（SQLite互換）
- **外部統合**: LAPRAS MCP（Model Context Protocol）
- **コード品質**: ESLint + Prettier + Husky

## 前提条件

- Node.js 20.9.0以上
- npm
- 以下のいずれかのAPIキー:
  - Google Generative AI API Key（Gemini使用時）
  - OpenAI API Key（GPT使用時）

## 環境変数

プロジェクトで使用される環境変数の一覧です：

| 環境変数名                     | 必須  | デフォルト値  | 説明                                      | 使用場所                                   |
| ------------------------------ | ----- | ------------- | ----------------------------------------- | ------------------------------------------ |
| `GOOGLE_GENERATIVE_AI_API_KEY` | ◯\*   | なし          | GeminiモデルのAPIキー                     | AI SDK                                     |
| `OPENAI_API_KEY`               | ◯\*   | なし          | OpenAIモデルのAPIキー                     | AI SDK                                     |
| `SLACK_WEBHOOK_URL`            | ◯     | なし          | Slack通知用のWebhook URL                  | `src/mastra/utils/slack-sender.ts`         |
| `NODE_ENV`                     | -     | `development` | 実行環境（production/development）        | `src/mastra/mcp-client/lapras-mcp.ts`      |
| `SLACK_DEFAULT_CHANNEL`        | -     | `#general`    | Slack通知のデフォルトチャンネル           | `src/mastra/utils/slack-sender.ts`         |
| `JOB_FILTER_DAYS`              | -     | `7`           | 求人の日付フィルタリング（日数）          | `src/mastra/workflows/recruit-workflow.ts` |
| `ECR_REGISTRY`                 | ◯\*\* | なし          | AWS ECRレジストリURL（Docker デプロイ用） | `package.json`                             |

\*AIモデルのAPIキーはGeminiかOpenAIのどちらか一つが必須  
\*\*Docker デプロイ時のみ必須

## セットアップ

1. **リポジトリのクローン**

   ```bash
   git clone https://github.com/kota/personal-recruit-agent.git
   cd personal-recruit-agent
   ```

2. **依存関係のインストール**

   ```bash
   npm install
   ```

3. **環境変数の設定**

   **ローカル開発環境**:
   `.env`ファイルを作成して必要な環境変数を設定

   ```bash
   # .env
   # AIモデル用（どちらか一つ必須）
   GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-api-key
   OPENAI_API_KEY=your-openai-api-key

   # Slack通知用（必須）
   SLACK_WEBHOOK_URL=your-slack-webhook-url

   # オプション設定
   NODE_ENV=development
   SLACK_DEFAULT_CHANNEL=#recruitment
   JOB_FILTER_DAYS=14

   # Docker デプロイ用（Docker使用時のみ必須）
   ECR_REGISTRY=your-ecr-registry-url
   ```

   **Lambda環境**:
   AWS Lambda環境変数として設定

   ```bash
   # AWS Lambda Environment Variables
   GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-api-key
   OPENAI_API_KEY=your-openai-api-key
   SLACK_WEBHOOK_URL=your-slack-webhook-url
   NODE_ENV=production
   SLACK_DEFAULT_CHANNEL=#recruitment
   JOB_FILTER_DAYS=7
   ECR_REGISTRY=your-ecr-registry-url
   ```

4. **開発サーバーの起動**
   ```bash
   npm run dev
   ```

## 使用方法

### 基本的な求人検索

```bash
npm run dev
```

開発サーバーが起動後、統合ワークフローが以下の流れで実行されます：

1. ユーザー要件をMarkdownチェックリストに変換
2. 積極的な求人検索（10件以上を目標）
3. 重複求人の自動除去
4. 並列マッチング分析（最大10件同時）
5. 80%以上のマッチング率の求人を抽出
6. マッチング率順でソートされた結果を出力

### AIモデルの切り替え

`src/mastra/models.ts` で利用可能なモデルを定義：

```typescript
export const MODELS = {
  // OpenAI モデル
  GPT_4_1_MINI: openai('gpt-4.1-mini'),
  GPT_4O_MINI: openai('gpt-4o-mini'),
  GPT_4O: openai('gpt-4o'),

  // Gemini モデル
  GEMINI_2_5_FLASH: google('gemini-2.5-flash'),
} as const;
```

各エージェントファイルで使用するモデルを個別に設定できます。

## 開発コマンド

### ビルドと開発

- `npm run dev` - 開発サーバーを起動
- `npm run build` - プロジェクトをビルド

### コード品質

- `npm run lint` - ESLintでコードチェック
- `npm run lint:fix` - ESLintの問題を自動修正
- `npm run format` - Prettierでコードフォーマット
- `npm run format:check` - コードフォーマットをチェック
- `npx tsc --noEmit` - TypeScript型チェック

### Docker

- `npm run build:docker` - Dockerイメージをビルド
- `npm run build:docker-ecr` - ARM64アーキテクチャ用Dockerイメージをビルド
- `npm run test:docker` - Dockerコンテナをテスト実行
- `npm run deploy:docker` - ECRへのデプロイ（環境変数ECR_REGISTRYが必要）

### テスト

- 現在テストスイートは設定されていません（`npm test`は失敗します）

## アーキテクチャ

### コアコンポーネント

#### 1. Mastraフレームワーク統合 (`src/mastra/index.ts`)

- LibSQL（ファイルデータベース）を使用した中央設定
- 3つのメインエージェントを統合管理
- 統合ワークフローシステム

#### 2. エージェントシステム

**JobSearchAgent** (`src/mastra/agents/job-search-agent.ts`)

- 積極的な検索戦略を持つ求人検索スペシャリスト
- マルチフェーズ検索（厳密→拡張）
- 10件以上の求人発見を目標

**ChecklistAgent** (`src/mastra/agents/checklist-agent.ts`)

- ユーザー要件を構造化されたMarkdownチェックリストに変換
- 一貫した評価基準を提供

**JobMatcherAgent** (`src/mastra/agents/job-matcher-agent.ts`)

- 詳細なスコアリングアルゴリズム
- 重み付け評価：技術スタック（30%）、働き方（25%）、給与（20%）、会社（15%）、その他（10%）
- 80%以上の閾値で推奨判定

#### 3. 統合ワークフロー (`src/mastra/workflows/recruit-workflow.ts`)

- 3つのエージェントを自動連携
- 並列処理とエラー耐性
- 重複除去とフィルタリング
- 結果の自動ソート

#### 4. 外部統合

- **LAPRAS MCP クライアント**: 日本のエンジニア求人データベースへのアクセス
- **Slack通知**: 求人結果の自動通知機能（オプション）

### メモリと状態管理

すべてのエージェントはLibSQLストレージを使用してワーキングメモリを管理し、以下を追跡：

- ユーザープロファイルと設定
- 検索履歴と戦略
- 求人マッチング結果とパターン
- 評価基準の一貫性

**ストレージ設定**:

- **全環境**: インメモリストレージ（`:memory:`）を使用
- データは実行時のみ保持され、プロセス終了時に消去されます

## プロジェクト構造

```
src/
├── lambda/                    # AWS Lambda関数
│   ├── index.ts
│   └── index.test.ts
├── mastra/
│   ├── agents/               # AIエージェント
│   │   ├── checklist-agent.ts
│   │   ├── job-matcher-agent.ts
│   │   └── job-search-agent.ts
│   ├── formatters/           # 出力フォーマッター
│   │   └── job-slack-formatter.ts
│   ├── mcp-client/           # MCPクライアント
│   │   └── lapras-mcp.ts
│   ├── types/                # 型定義
│   │   └── recruitment.ts
│   ├── utils/                # ユーティリティ
│   │   └── slack-sender.ts
│   ├── workflows/            # ワークフロー
│   │   └── recruit-workflow.ts
│   ├── index.ts             # Mastraエントリーポイント
│   └── models.ts            # AIモデル定義
└── lambda.ts                 # Lambda関数エントリーポイント
```

### ログ設定

システムにはPinoLoggerが組み込まれており、動作状況をログで確認できます:

- **レベル**: info（デフォルト）
- **場所**: `src/mastra/index.ts`で設定

## AWS Lambda + EventBridge 本番環境セットアップ

本番環境でのAWS Lambda + EventBridge構成による定期実行セットアップ手順です。

### 前提条件

- AWS CLI設定済み
- Docker環境
- ECRリポジトリが作成済み
- 必要なIAM権限

### 1. ECRリポジトリ作成

```bash
# ECRリポジトリを作成
aws ecr create-repository \
  --repository-name personal-recruit-agent \
  --region ap-northeast-1

# ECR_REGISTRY環境変数を設定
export ECR_REGISTRY="<ACCOUNT_ID>.dkr.ecr.ap-northeast-1.amazonaws.com"
```

### 2. Dockerイメージのビルドとプッシュ

```bash
# ARM64アーキテクチャ用Dockerイメージをビルド
npm run build:docker-ecr

# ECRにログイン
aws ecr get-login-password --region ap-northeast-1 | \
  docker login --username AWS --password-stdin $ECR_REGISTRY

# イメージをタグ付けしてプッシュ
docker tag personal-recruit-agent:latest $ECR_REGISTRY/personal-recruit-agent:latest
docker push $ECR_REGISTRY/personal-recruit-agent:latest

# または一括実行
npm run deploy:docker
```

### 3. Lambda関数の作成（AWS Console）

1. **Lambdaコンソール**にアクセス
2. **「関数の作成」**をクリック
3. **「コンテナイメージ」**を選択
4. 設定項目：
   - **関数名**: `personal-recruit-agent-container`
   - **コンテナイメージURI**: `<ACCOUNT_ID>.dkr.ecr.ap-northeast-1.amazonaws.com/personal-recruit-agent:latest`
   - **実行ロール**: **「基本的なLambdaアクセス権限で新しいロールを作成」**を選択
5. **「関数の作成」**をクリック
6. **「設定」**タブで環境変数を追加：
   - `NODE_ENV`: `production`
   - `GOOGLE_GENERATIVE_AI_API_KEY`: `your-gemini-api-key`
   - `SLACK_WEBHOOK_URL`: `your-slack-webhook-url`
   - `SLACK_DEFAULT_CHANNEL`: `#recruitment`
   - `JOB_FILTER_DAYS`: `7`
7. **「一般設定」**を調整：
   - **タイムアウト**: **15分（900秒）**
   - **メモリ**: **1024MB**（初期設定、必要に応じて増加）

### 4. EventBridge ルールの設定（AWS Console）

1. **EventBridgeコンソール**にアクセス
2. **「ルール」**→**「ルールの作成」**
3. 設定項目：
   - **名前**: `personal-recruit-agent-daily`
   - **説明**: `Personal Recruit Agent daily execution at 8PM JST`
4. **「スケジュール」**を選択
5. **スケジュール式**: `cron(0 11 * * ? *)` （毎日JST 20:00）
6. **「次へ」**→**「ターゲットを選択」**
7. ターゲット設定：
   - **ターゲットタイプ**: `AWS Lambda function`
   - **関数**: `personal-recruit-agent-container`
8. **「追加設定」**→**「定数（JSON テキスト）**で以下を入力：
   ```json
   {
     "source": "personal.recruit.agent",
     "detail-type": "Scheduled Job Search",
     "detail": {
       "userRequirements": "TypeScript、Next.js、React、フルリモート、副業OK、年収700万円以上、自社開発"
     }
   }
   ```
9. **「次へ」**→**「ルールの作成」**

### 5. 動作確認（AWS Console）

#### Lambda関数の手動テスト

1. **Lambdaコンソール**→関数を選択
2. **「テスト」**タブ→**「新しいテストイベント作成」**
3. **イベントJSON**：
   ```json
   {
     "source": "personal.recruit.agent",
     "detail-type": "Manual Test",
     "detail": {
       "userRequirements": "TypeScript、フルリモート、年収600万円以上"
     }
   }
   ```
4. **「テスト」**実行

#### CloudWatch Logsでの確認

1. **CloudWatchコンソール**→**「ログ」**→**「ログ グループ」**
2. `/aws/lambda/personal-recruit-agent-container`を選択
3. 最新のログストリームで実行結果を確認

### 6. アップデート手順

コードを更新する場合：

```bash
# 1. 新しいイメージをビルド・プッシュ
npm run deploy:docker

# 2. Lambda関数のイメージURIを更新
aws lambda update-function-code \
  --function-name personal-recruit-agent-container \
  --image-uri $ECR_REGISTRY/personal-recruit-agent:latest \
  --region ap-northeast-1
```
