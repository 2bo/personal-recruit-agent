# AWS Lambda Node.js 20 runtime
FROM public.ecr.aws/lambda/nodejs:20

# 日本時間を設定
ENV TZ=Asia/Tokyo

# 作業ディレクトリを設定
WORKDIR /var/task

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./
COPY tsconfig.json ./

# 全依存関係をインストール（TypeScript含む）
RUN npm ci

# アプリケーションコードをコピー
COPY src/ ./src/

# Mastra本体をビルド
RUN npm run build

# Lambda関数をesbuildでコンパイル
RUN npx esbuild src/lambda/index.ts --bundle --platform=node --target=node20 --format=esm --outfile=index.mjs --packages=external --keep-names

# Lambda Runtime Interface Client を設定
CMD ["index.handler"]