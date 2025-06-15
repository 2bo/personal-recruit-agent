import { createWorkflow, createStep } from '@mastra/core';
import { z } from 'zod';
import { ChecklistAgent } from '../agents/checklist-agent';
import { JobSearchAgent } from '../agents/job-search-agent';
import { JobMatcherAgent } from '../agents/job-matcher-agent';

const checklistStep = createStep({
  id: 'create-checklist',
  inputSchema: z.object({ userRequirements: z.string() }),
  outputSchema: z.object({ requirementsList: z.string() }),
  execute: async ({ inputData }) => {
    const result = await ChecklistAgent.generate(inputData.userRequirements);
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
  execute: async ({ inputData }) => {
    const result = await JobSearchAgent.generate(
      `以下の要件に基づいて求人を検索してください。目標は10件以上の求人を見つけることです。\n\n要件:\n${inputData.requirementsList}`,
      { experimental_output: jobSearchResultSchema, maxSteps: 20 }
    );
    // 重複した求人を除外してJob[]配列を直接返す
    const uniqueJobs = Array.from(
      new Map(
        result.object.jobs.map(job => [job.job_description_id, job])
      ).values()
    );
    return uniqueJobs;
  },
});

const matchResultSchema = z.object({
  job_description_id: z.string(),
  title: z.string(),
  url: z.string().describe('求人のURL'),
  matchingScore: z.number().min(0).max(100).describe('適合率（0-100%）'),
  matchingReason: z.string().describe('適合理由'),
});

const jobMatchingStep = createStep({
  id: 'job-matching',
  inputSchema: jobSchema,
  outputSchema: z.object({
    ...matchResultSchema.shape,
    success: z.boolean().describe('処理の成功可否'),
  }),
  // eslint-disable-next-line @typescript-eslint/unbound-method
  execute: async ({ inputData, getStepResult }) => {
    const checklistResult = getStepResult(checklistStep);
    const requirementsList = checklistResult.requirementsList;

    try {
      const result = await JobMatcherAgent.generate(
        `以下の求人要件と求人の適合度を分析してください。\n\n求人要件:\n${requirementsList}\n\n求人情報:\n- 求人ID: ${inputData.job_description_id}`,
        { experimental_output: matchResultSchema }
      );

      return { ...result.object, success: true };
    } catch (error) {
      console.error(
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

export const recruitWorkflow = createWorkflow({
  id: 'recruit-workflow',
  steps: [checklistStep, jobSearchStep, jobMatchingStep],
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
  .commit();
