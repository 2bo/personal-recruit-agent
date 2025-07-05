# ビルドオプション解説: esbuild と Docker Build

## 概要

このドキュメントでは、本プロジェクトで使用している esbuild と Docker Build のオプションについて、その理由と背景を詳しく解説します。

## esbuild オプション

### 現在のビルドコマンド

```bash
npx esbuild src/lambda/index.ts --bundle --platform=node --target=node20 --format=esm --outfile=index.mjs --packages=external --keep-names
```

### 各オプションの詳細解説

#### `--packages=external`

**目的**: 全てのnode_modulesパッケージを外部依存関係として扱う

**理由**:

1. **LAPRAS MCPサーバーの動的実行**

   - MCPサーバーを`node`プロセスで動的に起動する必要がある
   - バンドルに含めると、別プロセスでの実行が不可能になる
   - 実際の実行コード: `spawn('node', [path.join(process.cwd(), 'node_modules', '@lapras-inc', 'lapras-mcp-server', 'dist', 'index.js')])`

2. **LibSQLネイティブバイナリの対応**

   - LibSQLは`.node`拡張子のネイティブバイナリを使用
   - esbuildはネイティブバイナリを正しく処理できない（JavaScriptではないため）
   - バンドルすると、バイナリファイルが壊れる可能性がある

3. **プラットフォーム固有の最適化**
   - Docker buildで正しいARM64バイナリがnode_modulesにインストールされる
   - これを外部参照することで、最適化されたバイナリを使用可能

**esbuild公式ドキュメントより**:

> This can be used to import code in node at run time from a package that cannot be bundled. For example, the fsevents package contains a native extension, which esbuild doesn't support.

#### `--keep-names`

**目的**: 関数名とクラス名を保持する

**理由**:

1. **Mastraフレームワークの要件**

   - エージェント名やワークフロー名を内部で参照
   - 実行時にクラス名を動的に使用する処理がある

2. **デバッグとログの改善**

   - エラーログで正しい関数名が表示される
   - PinoLoggerでの関数名表示が正確になる

3. **リフレクションの対応**
   - 実行時に`MyClass.name`などで名前を参照する処理に対応

**通常のminification**:

```javascript
// 元のコード
class JobSearchAgent {
  constructor() {
    this.name = 'JobSearchAgent';
  }
}

// 通常のバンドル後
class a {
  constructor() {
    this.name = 'JobSearchAgent';
  }
}
```

**--keep-names使用時**:

```javascript
// --keep-names使用時
class JobSearchAgent {
  // ← 名前が保持される
  constructor() {
    this.name = 'JobSearchAgent';
  }
}
```

#### その他のオプション

- `--bundle`: モジュールを単一ファイルにバンドル
- `--platform=node`: Node.js環境向けの設定
- `--target=node20`: Node.js 20をターゲット
- `--format=esm`: ESモジュール形式で出力
- `--outfile=index.mjs`: 出力ファイル名

## Docker Build オプション

### 現在のビルドコマンド

```bash
docker build --platform linux/arm64 --provenance=false -t personal-recruit-agent .
```

### 各オプションの詳細解説

#### `--platform linux/arm64`

**目的**: ARM64アーキテクチャ向けのクロスコンパイル

**理由**:

1. **AWS Lambda ARM64対応**

   - ARM64 Lambda は x86_64 よりもコストパフォーマンスが良い
   - 約20%のコスト削減が期待できる

2. **ネイティブバイナリの正しいビルド**
   - LibSQLなどのネイティブバイナリがARM64向けに正しくビルドされる
   - クロスコンパイルにより、適切なアーキテクチャのバイナリを取得

**Docker公式ドキュメントより**:

> The --platform flag tells buildx to generate Linux images for Intel 64-bit, Arm 32-bit, and Arm 64-bit architectures.

#### `--provenance=false`

**目的**: プロビナンス証明書の生成を無効化

**理由**:

1. **互換性の確保**

   - デフォルトのイメージストアではプロビナンス証明書がサポートされていない
   - 一部のCIツールで問題が発生する可能性がある

2. **メタデータサイズの削減**
   - ビルド時間の短縮
   - 不要なメタデータの削除

**Docker公式ドキュメントより**:

> The default image store in Docker Engine doesn't support attestations. If you're using the default image store and you build an image using the default docker driver, the attestations are lost.

## なぜDockerビルドでも`--packages=external`が必要なのか？

### 問題の本質

多くの開発者が疑問に思うのは、「Dockerでビルドしているのに、なぜesbuildで外部パッケージ化が必要なのか？」という点です。

### 解決すべき問題

1. **esbuildバンドラーの制限**

   - ネイティブバイナリ（`.node`ファイル）はJavaScriptではない
   - バンドル時にバイナリファイルの構造が壊れる可能性
   - 動的`require()`や`import()`での読み込みが失敗する

2. **実行時の動的処理**
   - MCPサーバーを別プロセスで起動する必要がある
   - バンドルに含めると、プロセス間通信が不可能になる

### 具体例での説明

**正常なファイル構造**:

```
📁 node_modules/
  ├── @libsql/client/
  │   └── native.node (ARM64バイナリ)
  └── @lapras-inc/lapras-mcp-server/
      └── dist/index.js
```

**バンドル後の問題**:

```
📦 bundle.js
├── libsql code (壊れたバイナリ)
└── mcp-server code (別プロセス実行不可)
```

**外部パッケージ化の解決策**:

```
📦 bundle.js (メインコード)
📁 node_modules/ (ARM64用にビルド済み)
  ├── native.node ← 正しく動作
  └── mcp-server/ ← 別プロセス実行可能
```

## まとめ

### esbuild設定の意図

- `--packages=external`: ネイティブバイナリとMCPサーバーの動的実行のため
- `--keep-names`: Mastraフレームワークとデバッグのため

### Docker設定の意図

- `--platform linux/arm64`: AWS Lambda ARM64でのコスト最適化
- `--provenance=false`: 互換性とメタデータサイズの最適化

これらの設定により、AWS Lambda Container環境でのマルチプロセス実行、ネイティブバイナリの正しい動作、効率的なリソース使用が実現されています。

## `.node`ファイルとネイティブバイナリの詳細解説

### `.node`ファイルとは何か？

**`.node`ファイル** = **C++で書かれたプログラムをコンパイルしたバイナリファイル**

```
C++のソースコード → コンパイル → native.node (バイナリファイル)
```

### Node.js Native Modulesの構造

**LibSQLの場合**:

```
📁 node_modules/@libsql/client/
  ├── index.js (JavaScript部分) ← Node.jsが理解できる
  └── native.node (C++部分) ← 機械語でコンパイル済み
```

### なぜC++を使うのか？

1. **パフォーマンス** - データベース操作など、高速処理が必要
2. **既存のライブラリ活用** - SQLiteなど、既存のC++ライブラリを使用
3. **システムレベルのアクセス** - OSの機能に直接アクセス

### esbuildが処理できない理由

**esbuildの役割**: JavaScript/TypeScriptバンドラー = **テキストファイルを処理するツール**

**JavaScriptファイルの場合**:

```
📄 index.js (テキスト) → esbuild → 📦 bundle.js (テキスト) ✅
```

**native.nodeファイルの場合**:

```
🔧 native.node (バイナリ) → esbuild → 📦 bundle.js (壊れる) ❌
```

**問題の詳細**:

1. **ファイル形式の違い**

   - JavaScript: テキストファイル（人間が読める）
   - native.node: バイナリファイル（機械語、人間が読めない）

2. **esbuildの制限**

   - esbuildはテキストベースのファイル処理に特化
   - バイナリファイルの構造や依存関係を理解できない

3. **実行時の問題**
   - バンドル後、native.nodeファイルへの正しいパスが失われる
   - 動的読み込み(`require()`)でバイナリファイルが見つからない

## `--packages=external`時のパッケージ取得

### 実行時のパッケージ取得場所

```javascript
// バンドル後のコード内で
const libsql = require('@libsql/client');
```

この`require()`は**実行時**に以下の場所からパッケージを探します：

### Node.jsの標準的なモジュール解決

```
実行される場所/
├── index.mjs (バンドル後のファイル)
└── node_modules/
    └── @libsql/client/
        └── native.node
```

### 本プロジェクトでの実際の流れ

**開発時**:

```
/Users/kota/workspace/.../personal-recruit-agent/
├── src/lambda/index.ts
└── node_modules/
    └── @libsql/client/
```

**ビルド後**:

```
/Users/kota/workspace/.../personal-recruit-agent/
├── index.mjs (バンドル後)
└── node_modules/ (そのまま残る)
    └── @libsql/client/
```

**Docker実行時**:

```
/app/ (コンテナ内)
├── index.mjs
└── node_modules/ (Dockerfileでコピー)
    └── @libsql/client/
```

つまり、**バンドル時は外部化**するけど、**実行時は同じnode_modulesから読み込む**という仕組みです！

## `--packages=external`のメリット・デメリット

### デメリット

#### 1. **デプロイサイズの増加**

```
✅ 全バンドル時:
📦 bundle.js (10MB) ← 全て含まれる

❌ external時:
📦 bundle.js (400KB)
📁 node_modules/ (50MB) ← 別途必要
合計: 50.4MB
```

#### 2. **依存関係の管理複雑化**

- **実行環境にnode_modulesが必要**
- パッケージのバージョン不整合リスク
- 本番環境でのpackage.jsonとの整合性確保が必要

#### 3. **起動時間の増加**

```javascript
// 実行時に毎回require()でファイルI/O発生
const libsql = require('@libsql/client'); // ← ディスクアクセス
const lapras = require('@lapras-inc/lapras-mcp-server'); // ← ディスクアクセス
```

#### 4. **セキュリティリスク（一般論）**

- node_modulesの内容が実行時に変更される可能性
- バンドル時とは異なるパッケージが読み込まれるリスク

#### 5. **Docker固有の問題**

```dockerfile
# レイヤーサイズが大きくなる
COPY node_modules/ ./node_modules/  # ← 大きなレイヤー

# マルチステージビルドの恩恵を受けにくい
```

### 本プロジェクトでセキュリティリスクが低い理由

**このプロジェクトでは実際にはセキュリティリスクはほぼゼロ**です：

1. **AWS Lambda**: サンドボックス環境
2. **Docker Container**: イミュータブルな実行環境
3. **package-lock.json**: 厳密なバージョン管理
4. **npm ci**: 再現可能なビルド

```dockerfile
# ビルド時に固定
RUN npm ci --only=production  # package-lock.jsonで厳密にバージョン固定

# 実行時は読み取り専用
FROM public.ecr.aws/lambda/nodejs:20-arm64  # イミュータブルな環境
```

### 本プロジェクトでexternalを選択する理由

#### 1. **技術的制約**

- MCPサーバーの動的プロセス起動が必須
- LibSQLネイティブバイナリのバンドル不可

#### 2. **Lambda Container環境**

- コンテナサイズよりも実行時の安定性を優先
- 50MBのコンテナサイズは許容範囲

#### 3. **代替手段の不存在**

- ネイティブバイナリを含むパッケージは外部化以外に選択肢がない

## 理想的な解決策との比較

もしMCPサーバーやLibSQLがなければ：

```bash
# 理想的なバンドル
npx esbuild src/lambda/index.ts --bundle --minify --outfile=index.mjs
# → 単一ファイル、高速起動、小サイズ
```

つまり、**技術的制約による妥協**として外部化を選択していますが、一般的なNode.jsアプリケーションでは全バンドルの方が効率的です。
