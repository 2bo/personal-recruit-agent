# AWS Lambda Container Image デプロイメント ガイド

## 概要

このドキュメントは、Mastraフレームワークを使用したPersonal Recruit AgentをAWS Lambda Container Imageとしてデプロイする際に発生した課題と解決策をまとめたものです。

## 背景と目標

### 初期状況

- MastraフレームワークベースのAIエージェントシステム
- LibSQLを使用したストレージ
- MCPサーバー（LAPRAS）との統合
- 当初はLambda Layersを使用していたが、Docker Container Imageへの移行を決定

### 移行の理由

- パッケージサイズの制限（Lambda Layers: 250MB、Container Image: 10GB）
- 依存関係管理の簡素化
- デプロイプロセスの一元化

## 主要な技術的課題と解決策

### 1. LibSQL動的require問題

#### 課題

```bash
Dynamic require of "node:os" is not supported
Dynamic require of "node:path" is not supported
Dynamic require of "tty" is not supported
```

#### 根本原因

- LibSQLがネイティブバイナリ（Rust/C++）を使用
- `@neon-rs/load`パッケージが実行時プラットフォーム判定でdynamic requireを使用
- esbuildがESM形式でバンドル時にCommonJS `require()`を変換できない

#### 解決策

**ストレージ設定の最適化:**

```typescript
// src/mastra/index.ts
const storage = new LibSQLStore({
  url: ':memory:', // Lambda環境では常にメモリストレージを使用
});
```

**esbuild設定の調整:**

```dockerfile
# Dockerfile
RUN npx esbuild src/lambda/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=esm \
  --outfile=index.mjs \
  --packages=external \  # 全依存関係をバンドルから除外
  --keep-names
```

### 2. Lambda Container Image互換性

#### 課題

```bash
# 初期エラー
image manifest, config or layer media type not supported
entrypoint requires the handler name to be the first argument
```

#### 解決策

**Dockerファイルの最適化:**

```dockerfile
# AWS Lambda Node.js 20 runtime
FROM public.ecr.aws/lambda/nodejs:20

# 作業ディレクトリを設定
WORKDIR /var/task

# 依存関係のインストール
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci

# アプリケーションコードをコピー
COPY src/ ./src/

# Mastra本体をビルド
RUN npm run build

# Lambda関数をesbuildでコンパイル
RUN npx esbuild src/lambda/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=esm \
  --outfile=index.mjs \
  --packages=external \
  --keep-names

# Lambda Runtime Interface Client を設定
CMD ["index.handler"]
```

**Docker Build設定:**

```bash
# プロベナンス無効化（Lambda互換性のため）
docker build --provenance=false -t personal-recruit-agent-container .
```

### 3. MCP（Model Context Protocol）サーバー統合

#### 課題

- MCPサーバーは子プロセスでNode.jsを実行する必要
- `@lapras-inc/lapras-mcp-server`パッケージの動的require問題

#### 解決策

**MCP設定の最適化:**

```typescript
// src/mastra/mcp-client/lapras-mcp.ts
export const LaprasMCP = new MCPClient({
  servers: {
    lapras: {
      command: 'node',
      args: ['node_modules/@lapras-inc/lapras-mcp-server/dist/index.js'],
    },
  },
});
```

**`--packages=external`による依存関係の外部化:**

- MCPサーバーパッケージを`node_modules/`から実行時に読み込み
- 子プロセス実行時の動的require問題を回避

### 4. バンドルサイズの最適化

#### 結果

```bash
# --packages=external使用前: 2.6MB（失敗）
# --packages=external使用後: 78KB（成功、97%削減）
```

#### `--packages=external`の効果

**除外される依存関係:**

- `node:*` (Node.js組み込みモジュール)
- `libsql` (ネイティブバイナリ)
- `@lapras-inc/lapras-mcp-server`
- `@mastra/*` フレームワーク
- `@neon-rs/*` (LibSQL依存)
- `detect-libc` (プラットフォーム検出)

## 最終的なアーキテクチャ

### Lambda環境での実行フロー

1. **初期化**: `:memory:`データベースでLibSQLストレージ作成
2. **MCPサーバー起動**: 子プロセスでLAPRAS MCPサーバーを実行
3. **ワークフロー実行**: ChecklistAgent → RecruitAgent → JobMatcherAgent
4. **結果返却**: API Gateway経由でJSON形式で応答

### ストレージ戦略

**`:memory:`ストレージの利点:**

- ファイルI/O不要で高速動作
- Lambda環境の一時的な特性に適合
- 各実行でクリーンな状態から開始
- 動的require問題の回避

**メモリ使用パターン:**

- エージェントのワーキングメモリ
- 会話スレッドの一時保存
- ワークフロー実行状態の管理

### デプロイメントプロセス

```bash
# 1. Dockerイメージビルド
docker build --provenance=false -t personal-recruit-agent-container .

# 2. ECRタグ付け
docker tag personal-recruit-agent-container:latest \
  <AWS_ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/personal-recruit-agent:latest

# 3. ECRプッシュ
docker push <AWS_ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/personal-recruit-agent:latest

# 4. Lambda関数更新
aws lambda update-function-code \
  --function-name <FUNCTION_NAME> \
  --image-uri <AWS_ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/personal-recruit-agent:latest
```

## 学んだこと・ベストプラクティス

### 1. esbuildバンドリング戦略

**避けるべき設定:**

```bash
# 全てバンドル（失敗パターン）
--bundle --platform=node --target=node20 --format=esm
```

**推奨設定:**

```bash
# 外部依存関係を保持（成功パターン）
--bundle --platform=node --target=node20 --format=esm --packages=external
```

### 2. Lambda Container Image制約

**重要な制約:**

- プロベナンス情報はサポートされない（`--provenance=false`必須）
- エントリポイントは`CMD`で指定（`ENTRYPOINT`使用不可）
- ARM64アーキテクチャのサポート
- 最大タイムアウト：15分（603秒に設定）

### 3. 依存関係管理

**外部化すべきパッケージ:**

- ネイティブバイナリを含むパッケージ（libsql, @neon-rs/\*）
- 子プロセスを使用するパッケージ（MCP関連）
- Node.js組み込みモジュール（node:\*）
- プラットフォーム固有のパッケージ（detect-libc）

**バンドル可能なパッケージ:**

- 純粋なJavaScript/TypeScriptライブラリ
- 小さなユーティリティライブラリ
- 静的な設定ファイル

### 4. メモリストレージ vs ファイルストレージ

**Lambda環境での比較:**

| 方式         | メリット                            | デメリット                   |
| ------------ | ----------------------------------- | ---------------------------- |
| `:memory:`   | 高速、動的require回避、容量制限なし | 実行間でデータ保持不可       |
| `file:/tmp/` | 実行間でのデータ保持可能            | 512MB制限、I/Oオーバーヘッド |

**推奨:**

- 一時的なワーキングメモリ → `:memory:`
- 永続データ → 外部データベース（Turso、PostgreSQL）

### 5. デバッグとモニタリング

**CloudWatch Logsでの確認ポイント:**

- MCPサーバーの起動ログ
- LibSQLストレージの初期化
- エージェント実行の詳細ログ
- エラー発生時のスタックトレース

**成功の指標:**

```
[MCP] [debug] lapras: [lapras] Successfully connected to MCP server
[MCP] [debug] lapras: [lapras] Tool executed successfully: search_jobs
```

## トラブルシューティング

### よくある問題と解決策

**1. 動的requireエラー**

```bash
# エラー
Dynamic require of "tty" is not supported

# 解決策
--packages=external を使用してバンドルから除外
```

**2. MCPサーバー接続失敗**

```bash
# 確認ポイント
- node_modules/@lapras-inc/lapras-mcp-server/dist/index.js の存在
- 子プロセス実行権限
- Lambda環境でのStdio通信
```

**3. LibSQLストレージエラー**

```bash
# 解決策
url: ':memory:' を使用してインメモリストレージに設定
```

## まとめ

AWS Lambda Container ImageでのMastraデプロイメントは、以下の主要な設定変更により実現できました：

1. **`--packages=external`**: 動的require問題の根本解決
2. **`:memory:`ストレージ**: Lambda環境に最適化されたストレージ戦略
3. **適切なDockerfile**: Lambda Container Image仕様への準拠
4. **MCP統合の維持**: 子プロセスでの外部サービス連携

この設定により、Mastraフレームワークの全機能をAWS Lambda環境で活用できるようになりました。

## 参考リソース

- [AWS Lambda Container Images](https://docs.aws.amazon.com/lambda/latest/dg/images-create.html)
- [Mastra Documentation](https://docs.mastra.ai/)
- [LibSQL Documentation](https://docs.turso.tech/libsql)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
