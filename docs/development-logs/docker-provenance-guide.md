# Docker Provenance設定ガイド

## `--provenance=false` フラグが必要な理由

### 概要

AWS Lambda コンテナイメージをデプロイする際、特にARM64アーキテクチャでビルドする場合、`--provenance=false` フラグが必要です。これはDocker BuildKitの証明書機能とAWS Lambdaの互換性問題を解決するためです。

### 技術的背景

#### Docker BuildKit Provenance機能

- Docker BuildKit v0.10以降では、デフォルトで「provenance」（証明書）機能が有効
- ビルドプロセスに関するメタデータを含む証明書を生成
- セキュリティと透明性向上が目的

#### AWS Lambdaの制限

- Lambda のコンテナイメージサポートが複雑なマニフェストリストを正しく処理できない
- Provenanceが有効だと、マルチプラットフォームビルドと同様にマニフェストが追加でアップロードされる
- 結果として、デプロイメントが失敗する

### 特に影響を受けるケース

1. **Apple Silicon Mac（M1/M2/M3）でのビルド**

   - ARM64アーキテクチャでビルドしてAWS Lambdaにデプロイする場合
   - プラットフォーム差異により問題が顕在化しやすい

2. **マルチプラットフォーム対応**
   - `--platform linux/arm64` を使用する場合
   - クロスプラットフォームビルドを行う場合

### 解決方法

#### 1. Docker Build コマンドでの対応

```bash
# ARM64用のビルド
docker build --platform linux/arm64 --provenance=false -t your-image-name .

# AMD64用のビルド
docker build --platform linux/amd64 --provenance=false -t your-image-name .
```

#### 2. CDK使用時の対応

```bash
# 環境変数で証明書を無効化
BUILDX_NO_DEFAULT_ATTESTATIONS=1 cdk deploy
```

#### 3. Docker BuildX使用時の対応

```bash
# BuildXでの証明書無効化
docker buildx build --platform linux/arm64 --provenance=false -t your-image-name .
```

### 本プロジェクトでの設定

`package.json` の設定例：

```json
{
  "scripts": {
    "build:docker": "docker build -t personal-recruit-agent .",
    "build:docker-ecr": "docker build --platform linux/arm64 --provenance=false -t personal-recruit-agent .",
    "test:docker": "docker run --rm -p 9000:8080 personal-recruit-agent",
    "deploy:docker": "aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin $ECR_REGISTRY && docker tag personal-recruit-agent:latest $ECR_REGISTRY/personal-recruit-agent:latest && docker push $ECR_REGISTRY/personal-recruit-agent:latest"
  }
}
```

### 注意点

1. **セキュリティ考慮事項**

   - 証明書を無効化することで、ビルドプロセスの透明性が低下
   - 本番環境では、セキュリティポリシーとのバランスを考慮

2. **将来的な対応**

   - AWS Lambdaが証明書付きイメージをサポートする可能性
   - Docker BuildKitの改善により問題が解決される可能性

3. **デバッグ方法**
   - デプロイメントが失敗する場合は、まず `--provenance=false` を試す
   - ECRへのプッシュ時とLambdaデプロイメント時の両方でエラーが発生する可能性

### 関連するエラーメッセージ

```
The provided image is invalid
```

```
Error: lambda: could not find image
```

このようなエラーが発生した場合、`--provenance=false` フラグの追加を検討してください。

### 参考リンク

- [Docker BuildKit Provenance Documentation](https://docs.docker.com/build/attestations/slsa-provenance/)
- [AWS Lambda Container Image Support](https://docs.aws.amazon.com/lambda/latest/dg/images-create.html)
- [Docker Multi-platform builds](https://docs.docker.com/build/building/multi-platform/)
