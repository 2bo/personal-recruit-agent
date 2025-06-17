import { z } from 'zod';

// 求人マッチング結果のスキーマ定義
export const matchResultSchema = z.object({
  job_description_id: z.string(),
  title: z.string(),
  url: z.string().describe('求人のURL'),
  companyName: z.string().describe('会社名'),
  salaryMin: z.number().describe('最低給与'),
  salaryMax: z.number().describe('最高給与'),
  positionName: z.string().describe('職種'),
  matchingScore: z.number().min(0).max(100).describe('適合率（0-100%）'),
  matchingReason: z.string().describe('適合理由'),
  success: z.boolean().describe('処理の成功可否'),
});

// 型定義をエクスポート
export type MatchResult = z.infer<typeof matchResultSchema>;
