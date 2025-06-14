# モデル設定切り替えガイド

このファイルでは、AIモデルの切り替え方法について説明します。

## クイック切り替え

`src/mastra/config/model-config.ts` を編集して、すべてのエージェントのモデルを一括で切り替えできます。

### Gemini から GPT-4.1-mini に切り替え

```typescript
export const MODEL_CONFIG = {
  provider: 'openai' as ModelProvider, // 'gemini' → 'openai' に変更
  models: {
    gemini: 'gemini-2.0-flash-exp' as const,
    openai: 'gpt-4.1-mini' as const,
  },
} as const;
```

### GPT-4.1-mini から Gemini に戻す

```typescript
export const MODEL_CONFIG = {
  provider: 'gemini' as ModelProvider, // 'openai' → 'gemini' に変更
  models: {
    gemini: 'gemini-2.0-flash-exp' as const,
    openai: 'gpt-4.1-mini' as const,
  },
} as const;
```

## 利用可能なモデル

### Gemini モデル

- `gemini-2.0-flash-exp` (デフォルト)
- `gemini-2.5-flash-preview`

### OpenAI モデル

- `gpt-4.1-mini` (デフォルト)
- `gpt-4o-mini`
- `gpt-4o`

## 環境変数の設定

### Gemini使用時

```bash
export GOOGLE_GENERATIVE_AI_API_KEY="your-api-key-here"
```

### OpenAI使用時

```bash
export OPENAI_API_KEY="your-api-key-here"
```

## 特定のモデルに変更

デフォルトモデルを変更したい場合は、`models` オブジェクトを編集：

```typescript
models: {
  gemini: 'gemini-2.5-flash-preview' as const,  // Geminiのデフォルトを変更
  openai: 'gpt-4o' as const                     // OpenAIのデフォルトを変更
}
```

## 現在の設定確認

現在使用中のモデルを確認：

```typescript
import { getCurrentModelInfo } from './model-config';
console.log(getCurrentModelInfo());
// 出力例: { provider: 'gemini', model: 'gemini-2.0-flash-exp', description: 'GEMINI: gemini-2.0-flash-exp' }
```

## 影響を受けるエージェント

以下のすべてのエージェントが一括で切り替わります：

- RecruitAgent (求人検索エージェント)
- ChecklistAgent (チェックリスト生成エージェント)
- JobMatcherAgent (求人マッチングエージェント)

## トラブルシューティング

### APIキーエラー

環境変数が正しく設定されているか確認してください：

```bash
# Gemini使用時
echo $GOOGLE_GENERATIVE_AI_API_KEY

# OpenAI使用時
echo $OPENAI_API_KEY
```

### モデル名エラー

利用可能なモデル名のリストを確認：

```typescript
import { AVAILABLE_MODELS } from './model-config';
console.log(AVAILABLE_MODELS);
```

## 注意事項

- モデル変更後は、アプリケーションの再起動が必要です
- 各モデルで出力形式や品質が異なる場合があります
- APIキーの料金体系も確認してください
