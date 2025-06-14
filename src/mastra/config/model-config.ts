import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';

// モデル設定タイプ
export type ModelProvider = 'gemini' | 'openai';
export type ModelName =
  | 'gemini-2.0-flash-exp'
  | 'gemini-2.5-flash-preview'
  | 'gpt-4o-mini'
  | 'gpt-4o'
  | 'gpt-4.1-mini';

// 現在のモデル設定（ここを変更するだけで全エージェントのモデルが切り替わります）
export const MODEL_CONFIG = {
  // 'gemini' または 'openai' に切り替え
  provider: 'openai' as ModelProvider,

  // 各プロバイダーのデフォルトモデル
  models: {
    gemini: 'gemini-2.0-flash-exp' as const,
    openai: 'gpt-4.1-mini' as const,
  },
} as const;

// モデルインスタンスを取得する関数
export function getCurrentModel() {
  const { provider, models } = MODEL_CONFIG;

  switch (provider) {
    case 'gemini':
      return google(models.gemini);
    case 'openai':
      return openai(models.openai);
    default:
      throw new Error(`Unknown model provider: ${String(provider)}`);
  }
}

// 利用可能なモデルの一覧
export const AVAILABLE_MODELS = {
  gemini: ['gemini-2.0-flash-exp', 'gemini-2.5-flash-preview'] as const,
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'] as const,
} as const;

// モデルを動的に変更する関数（開発・テスト用）
export function createModelInstance(
  provider: ModelProvider,
  modelName: string
) {
  switch (provider) {
    case 'gemini':
      return google(modelName);
    case 'openai':
      return openai(modelName);
    default:
      throw new Error(`Unknown model provider: ${String(provider)}`);
  }
}

// 環境変数のチェック
export function checkModelEnvironment() {
  const { provider } = MODEL_CONFIG;

  switch (provider) {
    case 'gemini':
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        console.warn('Warning: GOOGLE_GENERATIVE_AI_API_KEY is not set');
      }
      break;
    case 'openai':
      if (!process.env.OPENAI_API_KEY) {
        console.warn('Warning: OPENAI_API_KEY is not set');
      }
      break;
  }
}

// 現在の設定を表示
export function getCurrentModelInfo() {
  const { provider, models } = MODEL_CONFIG;
  const currentModel = models[provider];

  return {
    provider,
    model: currentModel,
    description: `${provider.toUpperCase()}: ${currentModel}`,
  };
}
