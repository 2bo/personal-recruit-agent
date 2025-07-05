import { createWorkflow, createStep } from '@mastra/core';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { ChecklistAgent } from '../agents/checklist-agent';
import { JobSearchAgent } from '../agents/job-search-agent';
import { JobMatcherAgent } from '../agents/job-matcher-agent';
import { sendSlackNotification } from '../utils/slack-sender';
import { formatJobResultsForSlack } from '../formatters/job-slack-formatter';
import { matchResultSchema } from '../types/recruitment';

// ワークフロー全体で共有するセッションID
const workflowSessionIds = {
  resourceId: 'anonymous-job-seeker',
  threadId: randomUUID(),
};

const checklistStep = createStep({
  id: 'create-checklist',
  inputSchema: z.object({
    userRequirements: z.string(),
  }),
  outputSchema: z.object({
    requirementsList: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const result = await ChecklistAgent.generate(inputData.userRequirements, {
      threadId: workflowSessionIds.threadId,
      resourceId: workflowSessionIds.resourceId,
    });
    const logger = mastra.getLogger();
    logger.info('チェックリスト生成結果:', result.text);
    logger.debug('セッションID:', workflowSessionIds);

    return {
      requirementsList: result.text,
    };
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
  inputSchema: z.object({
    requirementsList: z.string(),
  }),
  outputSchema: z.array(jobSchema), // Job[]を直接返す
  execute: async ({ inputData, mastra }) => {
    const result = await JobSearchAgent.generate(
      `以下のチェックリストに基づいて求人を検索してください。

${inputData.requirementsList}`,
      {
        experimental_output: jobSearchResultSchema,
        maxSteps: 10,
        threadId: workflowSessionIds.threadId,
        resourceId: workflowSessionIds.resourceId,
      }
    );
    // 重複した求人を除外してJob[]配列を直接返す
    const jobs = result.object.jobs;
    const uniqueJobs = Array.from(
      new Map(jobs.map(job => [job.job_description_id, job])).values()
    );
    const logger = mastra.getLogger();
    logger.info('求人検索結果:', uniqueJobs);

    return uniqueJobs;
  },
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
        `以下のチェックリストと求人の適合度を分析してください。

## チェックリスト:
${requirementsList}

## 分析対象求人:
- 求人ID: ${inputData.job_description_id}
- タイトル: ${inputData.title}`,
        {
          experimental_output: matchResultSchema.omit({ success: true }),
          threadId: workflowSessionIds.threadId,
          resourceId: workflowSessionIds.resourceId,
        }
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
        companyName: '',
        salaryMin: 0,
        salaryMax: 0,
        positionName: '',
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

const slackNotificationStep = createStep({
  id: 'slack-notification',
  inputSchema: z.array(matchResultSchema),
  outputSchema: z.object({
    notified: z.boolean(),
    message: z.string(),
    resultCount: z.number(),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra.getLogger();

    // 結果が空の場合は通知しない
    if (inputData.length === 0) {
      logger.info('マッチング結果が空のため、Slack通知をスキップしました');
      return {
        notified: false,
        message: 'No results to notify',
        resultCount: 0,
      };
    }

    try {
      // 求人結果をSlackメッセージ形式にフォーマット
      const slackMessage = formatJobResultsForSlack(inputData, {
        useRichFormat: true,
      });

      // フォーマット結果がnullの場合（空の結果）は既にハンドル済み
      if (!slackMessage) {
        logger.info('求人結果が空のため、Slack通知をスキップしました');
        return {
          notified: false,
          message: 'No results to notify',
          resultCount: 0,
        };
      }

      // Slack通知を実行
      const result = await sendSlackNotification(slackMessage);

      logger.info('Slack通知結果:', result);

      return {
        notified: result.notificationSent,
        message: result.message,
        resultCount: inputData.length,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('Slack通知でエラーが発生しました:', errorMessage);

      return {
        notified: false,
        message: `Slack通知エラー: ${errorMessage}`,
        resultCount: inputData.length,
      };
    }
  },
});

export const recruitWorkflow = createWorkflow({
  id: 'recruit-workflow',
  steps: [
    checklistStep,
    jobSearchStep,
    jobMatchingStep,
    filterMatchingResults,
    slackNotificationStep,
  ],
  inputSchema: z.object({
    userRequirements: z
      .string()
      .describe('ユーザーの求人要件や希望を含むテキスト'),
  }),
  outputSchema: z.object({
    notified: z.boolean(),
    message: z.string(),
    resultCount: z.number(),
  }),
});

recruitWorkflow
  .then(checklistStep)
  .then(jobSearchStep)
  .foreach(jobMatchingStep, { concurrency: 1 }) // モデルのTPM制限に合わせて設定する
  .then(filterMatchingResults)
  .then(slackNotificationStep)
  .commit();
