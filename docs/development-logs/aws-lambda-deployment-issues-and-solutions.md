# AWS Lambda デプロイレポート

## 概要

このレポートでは、MastraフレームワークをベースにしたPersonal Recruit AgentをAWS Lambdaにデプロイする際に発生したエラーと解決策を詳しく説明します。

---

## 基礎知識

### Node.js モジュールシステム

**CommonJS (CJS)**

- Node.jsの従来のモジュールシステム
- `require()` と `module.exports` を使用
- 同期的にモジュールを読み込み

**ES Modules (ESM)**

- ECMAScript 2015で標準化されたモジュールシステム
- `import` と `export` を使用
- 非同期でモジュールを読み込み
- ブラウザとNode.jsの両方で利用可能

**本プロジェクトの設定**

```json
{
  "type": "module" // package.jsonでESMを指定
}
```

### AWS Lambda の特徴と制約

**実行環境**

- サーバーレス関数実行環境
- 一時的なファイルシステム (`/tmp` のみ書き込み可能)
- 外部プロセス実行に制限あり
- ARM64またはx86_64アーキテクチャ

**制約事項**

- `npx` コマンドは利用できない
- ネイティブバイナリは環境に合ったものが必要
- 子プロセス (ChildProcess) の実行に制限
- `/tmp` 以外への書き込み不可
- 実行時間制限（最大15分）
- メモリ制限（最大10GB）

---

## 発生したエラーと解決策

### 1. ESM関連エラー

#### エラー1: "Cannot use import statement outside a module"

```
SyntaxError: Cannot use import statement outside a module
```

**原因**: AWS LambdaがコードをESMとして認識していない

**解決策**:

```bash
echo '{"type":"module"}' > dist/package.json
```

- デプロイパッケージに `package.json` を含めてESMを明示

#### エラー2: "Dynamic require of \"path\" is not supported"

```
Error: Dynamic require of "path" is not supported
```

**原因**: ESM環境では動的な `require()` が使用できない

**解決策**:

```bash
--banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
```

- esbuildのbannerオプションでESM環境でのrequire関数を提供

### 2. ネイティブバイナリ関連エラー

#### エラー3-7: LibSQL依存関係エラー

```
Cannot find module '@libsql/linux-arm64-gnu'
Cannot find package '@libsql/client'
Cannot find package 'libsql'
Cannot find package 'promise-limit'
```

**原因**:

- ネイティブバイナリが環境に合わない
- 依存関係がバンドルに含まれていない
- package.jsonが不足している

**解決策**: Lambda Layerを使用した依存関係管理

### 3. MCP接続エラー

#### エラー8: "Failed to connect to MCP server lapras"

```
McpError: MCP error -32000: Connection closed
```

**原因**:

- `npx` コマンドがLambda環境で利用できない
- 子プロセスの実行制限

**解決策**:

- MCPサーバーをLambda Layerに含める
- 直接 `node` コマンドで実行

#### 子プロセス (ChildProcess) の詳細解説

**子プロセスとは**
Node.jsでは、メインプロセスから別のプログラムを実行するために子プロセスを作成できます。

**MCPアーキテクチャでのプロセス構造**

```
┌─────────────────────┐
│   Lambda関数        │
│   (Mastra本体)      │  ← メインプロセス
│                     │
│  ┌───────────────┐  │
│  │ MCPクライアント │  │
│  └───────────────┘  │
└─────────────────────┘
           │
           │ 子プロセス起動
           ▼
┌─────────────────────┐
│   MCPサーバー       │  ← 子プロセス
│ (lapras-mcp-server) │
└─────────────────────┘
```

**重要**: MCPサーバーは**必ず別プロセス**として動作します

- `npx` → 子プロセス作成
- `node` → 子プロセス作成
- どちらの方法でも2プロセス構成になる

**通常の環境での動作**

```javascript
// ローカル環境では正常動作
const { spawn } = require('child_process');
const child = spawn('npx', ['-y', '@lapras-inc/lapras-mcp-server']);
```

**AWS Lambdaでの制限**

1. **実行可能ファイルの制限**

   - Lambda環境には `npx` がインストールされていない
   - パッケージマネージャー系のコマンドは利用不可

2. **プロセス管理の制限**

   - 長時間実行される子プロセスの管理が困難
   - Lambda関数の実行時間制限の影響

3. **ファイルシステム制限**
   - 読み取り専用ファイルシステム
   - 動的なファイル作成・実行に制約

**プロセス間通信 (IPC) の詳細**

```
Lambda関数プロセス     ←→     MCPサーバープロセス
      │                            │
      │  1. JSON-RPC リクエスト      │
      │ ──────────────────────────→ │
      │                            │
      │  2. LAPRAS API呼び出し       │
      │                            │ ──→ LAPRAS API
      │                            │
      │  3. JSON-RPC レスポンス      │
      │ ←────────────────────────── │
      │                            │
   stdin/stdout            stdin/stdout
   (パイプ通信)              (パイプ通信)
```

**なぜ2プロセス構成なのか**

1. **分離設計**: MCPサーバーは汎用的なツールとして独立
2. **再利用性**: 複数のクライアントから同じサーバーを利用可能
3. **プロトコル標準化**: JSON-RPC 2.0による標準化された通信
4. **プロセス分離**: クラッシュ時の影響範囲を限定

**MCPクライアントでの子プロセス使用例**

```typescript
// 問題のあったコード
export const LaprasMCP = new MCPClient({
  servers: {
    lapras: {
      command: 'npx', // ❌ Lambda環境に存在しない
      args: ['-y', '@lapras-inc/lapras-mcp-server'],
    },
  },
});
```

**エラーの流れ**

1. MCPクライアントが `npx` コマンドで子プロセス作成を試行
2. Lambda環境で `npx` が見つからない
3. 子プロセスが異常終了 (exit code != 0)
4. MCP接続が失敗 → "Connection closed" エラー

**解決策の仕組み**

```typescript
// 修正後のコード
export const LaprasMCP = new MCPClient({
  servers: {
    lapras: {
      command: 'node', // ✅ Lambda環境に標準搭載
      args: [
        '/opt/nodejs/node_modules/@lapras-inc/lapras-mcp-server/dist/index.js',
      ],
    },
  },
});
```

- `node` コマンドは Lambda 環境に標準搭載
- Lambda Layer によって必要なファイルが `/opt/nodejs/` に配置
- 直接JavaScriptファイルを実行するため、パッケージマネージャー不要

---

## Lambda Layer とは

### 概念

Lambda Layerは、複数のLambda関数で共有できるコードとライブラリのパッケージングメカニズムです。

### メリット

1. **コードの再利用**: 複数の関数で同じライブラリを共有
2. **デプロイサイズの削減**: 本体コードから依存関係を分離
3. **管理の簡素化**: ライブラリのバージョン管理を集約

### 本プロジェクトでの用途

```bash
layer/
└── nodejs/
    └── node_modules/
        ├── @libsql/client
        ├── libsql
        ├── @libsql/linux-arm64-gnu
        └── @lapras-inc/lapras-mcp-server
```

**Layer内容**:

- LibSQL関連パッケージ（データベース）
- LAPRAS MCPサーバー（求人検索API）
- 各種ネイティブバイナリ

#### なぜLambda Layerが必要になったのか？

**1. ネイティブバイナリの問題**

```
Cannot find module '@libsql/linux-arm64-gnu'
```

LibSQLはSQLite系のデータベースライブラリで、高速化のためにネイティブバイナリ（C/C++コンパイル済みファイル）を使用します。

**問題**:

- macOS開発環境: ARM64 Darwin用バイナリ
- Lambda実行環境: ARM64 Linux用バイナリ
- **バイナリは環境固有で、異なるOS間で互換性なし**

**2. esbuildの制限**

```bash
esbuild src/lambda.ts --bundle
```

esbuildは優秀なバンドラーですが、ネイティブバイナリは処理できません。

**バンドル対象外**:

- `.node` ファイル（ネイティブ拡張）
- プラットフォーム固有のバイナリ
- 動的に読み込まれるファイル

**3. 依存関係の複雑さ**

```
@libsql/client → libsql → @libsql/linux-arm64-gnu → promise-limit → ...
```

LibSQLは多層の依存関係を持ち、それぞれがさらに依存関係を持ちます。

**課題**:

- 手動で全依存関係を管理するのは非現実的
- バージョンの整合性確保が困難
- パッケージマネージャー（npm）の自動解決が必要

**4. MCPサーバーの実行**

```
command: 'npx', args: ['-y', '@lapras-inc/lapras-mcp-server']
```

元々はnpxで動的にダウンロード・実行していました。

**Lambda環境の問題**:

- インターネットアクセス制限
- パッケージマネージャー未搭載
- 動的ダウンロード不可

**Layer による解決**

```bash
# Layer ビルド時
npm install --prefix layer/nodejs \
  @libsql/client \
  libsql \
  @libsql/linux-arm64-gnu \
  @lapras-inc/lapras-mcp-server \
  --force
```

#### なぜLayerでネイティブバイナリ問題が解決するのか？

**重要な誤解**: Layer自体は魔法ではありません！

**実際の解決メカニズム**:

1. **明示的なLinux用パッケージ指定**

```bash
@libsql/linux-arm64-gnu  # ← Linux ARM64専用パッケージを明示
```

2. **--forceオプションの効果**

```bash
npm install @libsql/linux-arm64-gnu --force
# macOS環境でも強制的にLinux用バイナリをダウンロード
```

**通常のesbuildビルドで起きていた問題**:

```bash
# macOS開発環境
npm install @libsql/client
# ↓ 自動的にDarwin用バイナリがインストールされる
node_modules/@libsql/darwin-arm64/  # ← macOS用

# esbuildでバンドル
esbuild --bundle  # ← Darwin用バイナリがバンドルに含まれる（または除外される）

# Lambda（Linux）で実行
# ❌ Darwin用バイナリはLinuxで動作しない
```

**Layerビルドで解決される流れ**:

```bash
# Layer構築時（macOS環境）
npm install --prefix layer/nodejs @libsql/linux-arm64-gnu --force
# ↓ プラットフォーム制約を無視してLinux用をダウンロード
layer/nodejs/node_modules/@libsql/linux-arm64-gnu/  # ← Linux用

# Lambda実行時（Linux環境）
# ✅ Linux用バイナリなので正常動作
```

**パッケージの実体**:

```bash
@libsql/darwin-arm64     # macOS ARM64用のネイティブバイナリ
@libsql/linux-arm64-gnu  # Linux ARM64用のネイティブバイナリ
@libsql/linux-x64-gnu    # Linux x64用のネイティブバイナリ
@libsql/win32-x64-msvc   # Windows x64用のネイティブバイナリ
```

**npmの通常動作**:

- インストール時に現在の環境を検出
- 適合するパッケージを自動選択
- 異なる環境用パッケージは拒否

**--forceオプションの効果**:

- プラットフォーム制約を無視
- 異なる環境用パッケージも強制インストール
- ただし、実行時の動作は保証されない（今回はターゲット環境用なので問題なし）

**メリット**:

1. **正しい環境用バイナリ**: Linux用を明示的に取得
2. **依存解決**: npmが全依存関係を自動解決
3. **事前配置**: 実行時ダウンロード不要
4. **パス固定**: `/opt/nodejs/node_modules/` で確実にアクセス可能

**結果**:

- ネイティブバイナリ問題解決
- MCP接続問題解決
- 依存関係管理の自動化
- 実行時の安定性向上

---

## ビルドコマンド詳細解説

### Lambda関数ビルド

```bash
npm run build:lambda
```

**実行内容**:

```bash
mkdir -p dist && \
esbuild src/lambda.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=esm \
  --minify \
  --tree-shaking=true \
  --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);" \
  --outfile=dist/index.js && \
echo '{"type":"module"}' > dist/package.json && \
cd dist && zip ../dist.zip *
```

**各オプションの意味**:

| オプション            | 説明                                          |
| --------------------- | --------------------------------------------- |
| `--bundle`            | 全依存関係を1つのファイルにまとめる           |
| `--platform=node`     | Node.js環境向けにビルド                       |
| `--target=node20`     | Node.js 20に最適化                            |
| `--format=esm`        | ES Modulesとして出力                          |
| `--minify`            | コードを圧縮してサイズ削減                    |
| `--tree-shaking=true` | 未使用コードを除去                            |
| `--banner:js="..."`   | ファイル先頭にコード追加（require関数の提供） |

### Lambda Layerビルド

```bash
npm run build:lambda-layer
```

**実行内容**:

```bash
mkdir -p layer/nodejs && \
npm install --prefix layer/nodejs \
  @libsql/client \
  libsql \
  @libsql/linux-arm64-gnu \
  @lapras-inc/lapras-mcp-server \
  --force && \
cd layer && zip -r ../layer.zip *
```

**処理内容**:

1. `layer/nodejs/` ディレクトリ作成
2. Lambda環境用の依存関係をインストール
3. `--force` でプラットフォーム制約を無視
4. Layer用zipファイル作成

---

## 最終的な構成

### ファイル構成

```
プロジェクト/
├── dist.zip          # Lambda関数コード
├── layer.zip         # Lambda Layer
├── src/
│   ├── lambda.ts     # Lambda関数エントリーポイント
│   └── mastra/       # Mastraフレームワーク設定
└── package.json      # プロジェクト設定
```

### AWS Lambda設定

1. **Runtime**: Node.js 20.x
2. **Architecture**: ARM64
3. **Layer**: `layer.zip` をLayerとしてアップロード
4. **Function**: `dist.zip` を関数コードとしてアップロード
5. **Environment Variables**:
   - `NODE_ENV=production`
   - `OPENAI_API_KEY=<YOUR_API_KEY>`
   - `SLACK_WEBHOOK_URL=<YOUR_WEBHOOK_URL>`

### MCP設定

```typescript
export const LaprasMCP = new MCPClient({
  id: 'lapras-mcp',
  servers: {
    lapras: {
      command: 'node',
      args: [
        '/opt/nodejs/node_modules/@lapras-inc/lapras-mcp-server/dist/index.js',
      ],
      env: {
        // 環境変数が必要な場合はここに設定
      },
    },
  },
});
```

**パス解説**:

- `/opt/nodejs/` : Lambda LayerのNode.jsファイルの標準パス
- `node_modules/@lapras-inc/lapras-mcp-server/dist/index.js` : MCPサーバーの実行ファイル

---

## 成功要因まとめ

1. **ESM設定の完璧な対応**

   - package.jsonでtype: module指定
   - esbuildでESM互換require関数提供

2. **Lambda Layerの効果的活用**

   - ネイティブバイナリの環境適応
   - 依存関係の分離管理

3. **MCP設定の最適化**

   - npxからnodeコマンドへの変更
   - 正しいLayerパスの指定

4. **ビルドプロセスの自動化**
   - 関数とLayerの分離ビルド
   - 環境固有設定の自動化

この構成により、複雑なMastraフレームワークとMCPサーバーがAWS Lambda環境で安定動作しています。
