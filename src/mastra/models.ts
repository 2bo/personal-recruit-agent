import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';

// モデル定数
export const MODELS = {
  // OpenAI モデル
  GPT_4_1_MINI: openai('gpt-4.1-mini'),
  GPT_4O_MINI: openai('gpt-4o-mini'),
  GPT_4O: openai('gpt-4o'),

  // Gemini モデル
  FLASH_EXP: google('gemini-2.0-flash-exp'),
  FLASH_PREVIEW: google('gemini-2.5-flash-preview'),
  FLASH_PREVIEW_05_20: google('gemini-2.5-flash-preview-05-20'),
} as const;
