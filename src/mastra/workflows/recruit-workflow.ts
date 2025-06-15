import { createWorkflow, createStep } from '@mastra/core';
import { z } from 'zod';
import { ChecklistAgent } from '../agents/checklist-agent';
import { JobSearchAgent } from '../agents/job-search-agent';
import { JobMatcherAgent } from '../agents/job-matcher-agent';

const checklistStep = createStep({
  id: 'create-checklist',
  inputSchema: z.object({ userRequirements: z.string() }),
  outputSchema: z.object({ requirementsList: z.string() }),
  execute: async ({ inputData, mastra }) => {
    const result = await ChecklistAgent.generate(inputData.userRequirements);
    const logger = mastra.getLogger();
    logger.info('チェックリスト生成結果:', result.text);
    return { requirementsList: result.text };
  },
});

// Job配列を直接返すスキーマ
const jobSchema = z.object({
  job_description_id: z.string().describe('求人の一意な識別子'),
  title: z.string().describe('求人のタイトル'),
  updated_at: z.string().describe('求人の最終更新日時'),
});

const jobSearchResultSchema = z.object({
  jobs: z.array(jobSchema).describe('検索結果の求人リスト'),
});

const jobSearchStep = createStep({
  id: 'search-jobs',
  inputSchema: z.object({ requirementsList: z.string() }),
  outputSchema: z.array(jobSchema), // Job[]を直接返す
  execute: async ({ inputData, mastra }) => {
    const result = await JobSearchAgent.generate(
      `以下の要件に基づいて求人を検索してください。目標は10件以上の求人を見つけることです。\n\n要件:\n${inputData.requirementsList}`,
      { experimental_output: jobSearchResultSchema, maxSteps: 5 }
    );
    // 重複した求人を除外してJob[]配列を直接返す
    const uniqueJobs = Array.from(
      new Map(
        result.object.jobs.map(job => [job.job_description_id, job])
      ).values()
    );
    const logger = mastra.getLogger();
    logger.info('求人検索結果:', uniqueJobs);
    return uniqueJobs;
  },
});

const matchResultSchema = z.object({
  job_description_id: z.string(),
  title: z.string(),
  url: z.string().describe('求人のURL'),
  matchingScore: z.number().min(0).max(100).describe('適合率（0-100%）'),
  matchingReason: z.string().describe('適合理由'),
  success: z.boolean().describe('処理の成功可否'),
});

const jobMatchingStep = createStep({
  id: 'job-matching',
  inputSchema: jobSchema,
  outputSchema: matchResultSchema,
  // eslint-disable-next-line @typescript-eslint/unbound-method
  execute: async ({ inputData, getStepResult, mastra }) => {
    const checklistResult = getStepResult(checklistStep);
    const requirementsList = checklistResult.requirementsList;
    const logger = mastra.getLogger();

    try {
      const result = await JobMatcherAgent.generate(
        `以下の求人要件と求人の適合度を分析してください。\n\n求人要件:\n${requirementsList}\n\n求人情報:\n- 求人ID: ${inputData.job_description_id}`,
        { experimental_output: matchResultSchema.omit({ success: true }) }
      );

      logger.info(
        `求人ID ${inputData.job_description_id} のマッチング結果:`,
        result.object
      );

      return { ...result.object, success: true };
    } catch (error) {
      logger.error(
        `求人ID ${inputData.job_description_id} の分析でエラー:`,
        error
      );
      return {
        job_description_id: inputData.job_description_id,
        title: inputData.title,
        url: '',
        matchingScore: 0,
        matchingReason: 'エラーにより分析できませんでした',
        success: false,
      };
    }
  },
});

export const filterMatchingResults = createStep({
  id: 'filter-matching-results',
  inputSchema: z.array(matchResultSchema),
  outputSchema: z.array(matchResultSchema),
  // eslint-disable-next-line @typescript-eslint/require-await
  execute: async ({ inputData, mastra }) => {
    // 成功したマッチング結果のみをフィルタリング
    const filteredResults = inputData.filter(result => result.success);

    // 適合率が80%以上のものを抽出
    const highMatchingResults = filteredResults.filter(
      result => result.matchingScore >= 80
    );

    // 適合率でソート（降順）
    highMatchingResults.sort((a, b) => b.matchingScore - a.matchingScore);

    const logger = mastra.getLogger();
    logger.info('フィルタリング後のマッチング結果:', highMatchingResults);

    return highMatchingResults;
  },
});

export const recruitWorkflow = createWorkflow({
  id: 'recruit-workflow',
  steps: [checklistStep, jobSearchStep, jobMatchingStep, filterMatchingResults],
  inputSchema: z.object({
    userRequirements: z
      .string()
      .describe('ユーザーの求人要件や希望を含むテキスト'),
  }),
  outputSchema: z.object({
    matchingResults: z.array(
      z.object({
        job_description_id: z.string(),
        title: z.string(),
        matchingScore: z.number(),
        analysis: z.string(),
      })
    ),
  }),
});

recruitWorkflow
  .then(checklistStep)
  .then(jobSearchStep)
  .foreach(jobMatchingStep, { concurrency: 5 }) // 最大5件同時並列実行
  .then(filterMatchingResults)
  .commit();
