import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';

// モデル定数
export const MODELS = {
  // OpenAI モデル
  GPT_4_1_MINI: openai('gpt-4.1-mini'),
  GPT_4O_MINI: openai('gpt-4o-mini'),
  GPT_4O: openai('gpt-4o'),

  // Gemini モデル
  GEMINI_2_5_FLASH: google('gemini-2.5-flash'),
} as const;
