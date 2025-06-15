import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';

// モデル設定タイプ
export type ModelProvider = 'gemini' | 'openai';

// デフォルト設定
const DEFAULT_CONFIG = {
  provider: 'openai' as ModelProvider,
  models: {
    gemini: 'gemini-2.5-flash-preview-05-20',
    openai: 'gpt-4.1-mini',
  },
} as const;

// 環境変数から設定を取得
const getModelConfig = () => {
  const provider = (process.env.MODEL_PROVIDER ??
    DEFAULT_CONFIG.provider) as ModelProvider;
  const modelName = process.env.MODEL_NAME ?? DEFAULT_CONFIG.models[provider];

  return { provider, modelName };
};

// モデルインスタンスを取得する関数
export const getCurrentModel = () => {
  const { provider, modelName } = getModelConfig();

  switch (provider) {
    case 'gemini':
      return google(modelName);
    case 'openai':
      return openai(modelName);
    default:
      throw new Error(`Unknown model provider: ${String(provider)}`);
  }
};
