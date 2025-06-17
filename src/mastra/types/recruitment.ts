import { z } from 'zod';

// 求人マッチング結果のスキーマ定義
export const matchResultSchema = z.object({
  job_description_id: z.string(),
  title: z.string(),
  url: z.string().describe('求人のURL'),
  matchingScore: z.number().min(0).max(100).describe('適合率（0-100%）'),
  matchingReason: z.string().describe('適合理由'),
  success: z.boolean().describe('処理の成功可否'),
});

// 型定義をエクスポート
export type MatchResult = z.infer<typeof matchResultSchema>;
