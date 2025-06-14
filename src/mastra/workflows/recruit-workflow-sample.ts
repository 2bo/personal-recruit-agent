import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { ChecklistAgent } from '../agents/checklist-agent';
import { RecruitAgent } from '../agents/recruit-agent';
import { JobMatcherAgent } from '../agents/job-matcher-agent';

// ワークフロー設定（外部から変更可能）
export const WORKFLOW_CONFIG = {
  MATCH_THRESHOLD: 80, // マッチング率閾値（%）
  CONCURRENCY_LIMIT: 10, // 並列処理の最大数
  CHUNK_SIZE: 10, // チャンク処理のサイズ
  LOG_LEVEL: 'info' as const, // ログレベル
  ENABLE_DETAILED_LOGS: false, // 詳細ログの有効化
  ERROR_RETRY_COUNT: 0, // エラー時のリトライ回数
} as const;

// Logger型定義
interface Logger {
  error: (message: string) => void;
  info: (message: string) => void;
  debug: (message: string, details?: object) => void;
  warn: (message: string) => void;
}

// 統一エラーハンドリング
const handleStepError = (error: unknown, context: string, logger: Logger) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error(`${context}でエラー: ${errorMessage}`);
  return {
    error: errorMessage,
    context,
    timestamp: new Date().toISOString(),
  };
};

// 統一ログ出力
const logStepCompletion = (
  stepName: string,
  count: number,
  logger: Logger,
  details?: object
) => {
  logger.info(`${stepName}: ${String(count)}件処理`);
  if (details) {
    logger.debug(`${stepName} 詳細:`, details);
  }
};

// 統一Job型定義（全ステップで使用）
const jobSchema = z.object({
  job_description_id: z.string(),
  title: z.string(),
  url: z.string(),
  company: z.string(),
  updated_at: z.number(),
});

// チェックリスト生成ステップ（エージェントをそのまま使用）
const checklistStep = createStep({
  id: 'checklist-agent',
  inputSchema: z.object({
    prompt: z.string(),
  }),
  outputSchema: z.object({
    text: z.string(),
  }),
  execute: async ({ inputData }) => {
    const result = await ChecklistAgent.generate(inputData.prompt);
    return { text: result.text };
  },
});

// 求人検索結果のstructured outputスキーマ
const recruitOutputSchema = z.object({
  search_summary: z.object({
    total_found: z.number(),
    target_achieved: z.boolean(),
    search_phases_executed: z.number(),
  }),
  jobs: z.array(
    z.object({
      job_description_id: z.string(),
      title: z.string(),
      url: z.string().optional(),
      company: z.string().optional(),
      updated_at: z.number().optional(),
    })
  ),
});

// JobMatcherAgentの出力スキーマ
const jobMatchingOutputSchema = z.object({
  match_result: z.object({
    overall_match_rate: z.number(),
    is_recommended: z.boolean(),
    job_title: z.string(),
    company_name: z.string(),
    job_content_summary: z.string(),
    extracted_criteria: z.object({
      salary_requirements: z.string(),
      tech_stack_requirements: z.string(),
      work_style_requirements: z.string(),
      company_requirements: z.string(),
      other_requirements: z.string(),
    }),
    evaluation_scope: z.object({
      evaluated_categories: z.array(z.string()),
      excluded_categories: z.array(z.string()),
      weight_redistribution: z.string(),
    }),
    match_details: z.object({
      salary: z.object({
        rate: z.number(),
        calculation_basis: z.string(),
        details: z.string(),
      }),
      tech_stack: z.object({
        rate: z.number(),
        calculation_basis: z.string(),
        details: z.string(),
      }),
      work_style: z.object({
        rate: z.number(),
        calculation_basis: z.string(),
        details: z.string(),
      }),
      company: z.object({
        rate: z.number(),
        calculation_basis: z.string(),
        details: z.string(),
      }),
      others: z.object({
        rate: z.number(),
        calculation_basis: z.string(),
        details: z.string(),
      }),
    }),
    strengths: z.array(z.string()),
    considerations: z.array(z.string()),
    recommendation_reason: z.string(),
  }),
});

// 求人検索ステップ（structured outputを使用）
const recruitStep = createStep({
  id: 'recruit-agent',
  inputSchema: z.object({
    prompt: z.string(),
  }),
  outputSchema: z.object({
    jobs: z.array(jobSchema),
    search_summary: z.object({
      total_found: z.number(),
      target_achieved: z.boolean(),
      search_phases_executed: z.number(),
    }),
  }),
  execute: async ({ inputData }) => {
    const result = await RecruitAgent.generate(inputData.prompt, {
      experimental_output: recruitOutputSchema,
      maxSteps: 5,
    });

    const recruitResult = result.object;

    // 完全な求人情報を保持（データ損失を防ぐ）
    const jobs = recruitResult.jobs.map(job => ({
      job_description_id: job.job_description_id,
      title: job.title,
      url: job.url ?? '',
      company: job.company ?? '',
      updated_at: job.updated_at ?? 0,
    }));

    console.log('jobs', jobs);

    return {
      jobs,
      search_summary: recruitResult.search_summary,
    };
  },
});

// 重複削除ステップ
const deduplicateJobsStep = createStep({
  id: 'deduplicate-jobs',
  description: '求人の重複を削除し、ユニークな求人のみを抽出',
  inputSchema: z.object({
    jobs: z.array(jobSchema),
    search_summary: z.object({
      total_found: z.number(),
      target_achieved: z.boolean(),
      search_phases_executed: z.number(),
    }),
  }),
  outputSchema: z.object({
    search_summary: z.object({
      total_found: z.number(),
      unique_found: z.number(),
      duplicates_removed: z.number(),
      target_achieved: z.boolean(),
      search_phases_executed: z.number(),
    }),
    jobs: z.array(jobSchema),
  }),
  // eslint-disable-next-line @typescript-eslint/require-await
  execute: async ({ inputData, mastra }) => {
    const logger = mastra.getLogger() as Logger;
    const originalCount = inputData.jobs.length;

    // Map で重複削除（シンプル）
    const uniqueJobsMap = new Map(
      inputData.jobs.map(job => [job.job_description_id, job])
    );
    const uniqueJobs = Array.from(uniqueJobsMap.values());
    const duplicatesRemoved = originalCount - uniqueJobs.length;

    logStepCompletion(
      `重複削除: ${String(originalCount)}件 → ${String(uniqueJobs.length)}件 (${String(duplicatesRemoved)}件削除)`,
      uniqueJobs.length,
      logger
    );

    return {
      search_summary: {
        ...inputData.search_summary,
        unique_found: uniqueJobs.length,
        duplicates_removed: duplicatesRemoved,
      },
      jobs: uniqueJobs,
    };
  },
});

// 求人マッチング分析ステップ（全求人を順次処理）
const analyzeJobMatchingStep = createStep({
  id: 'analyze-job-matching',
  description: '全ての求人に対してマッチング分析を実行',
  inputSchema: z.object({
    checklist: z.string(),
    search_summary: z.object({
      total_found: z.number(),
      unique_found: z.number(),
      duplicates_removed: z.number(),
      target_achieved: z.boolean(),
      search_phases_executed: z.number(),
    }),
    jobs: z.array(jobSchema),
  }),
  outputSchema: z.object({
    checklist: z.string(),
    searchSummary: z.object({
      total_found: z.number(),
      unique_found: z.number(),
      duplicates_removed: z.number(),
      target_achieved: z.boolean(),
      search_phases_executed: z.number(),
    }),
    jobs: z.array(jobSchema),
    jobMatches: z.array(
      z.object({
        jobId: z.string(),
        success: z.boolean(),
        matchRate: z.number().optional(),
        matchResult: jobMatchingOutputSchema.shape.match_result.optional(),
        error: z.string().optional(),
      })
    ),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra.getLogger() as Logger;
    logStepCompletion(`マッチング分析開始`, inputData.jobs.length, logger);

    // 並列処理で各求人を分析
    const jobMatches = await Promise.allSettled(
      inputData.jobs.map(async job => {
        try {
          const matchingPrompt = `
求職者のチェックリスト:
${inputData.checklist}

求人ID: ${job.job_description_id}

この求人との適合性を分析してください。
`;

          const result = await JobMatcherAgent.generate(matchingPrompt, {
            experimental_output: jobMatchingOutputSchema,
          });

          const matchResult = result.object.match_result;

          return {
            jobId: job.job_description_id,
            success: true,
            matchRate: matchResult.overall_match_rate,
            matchResult,
          };
        } catch (error) {
          const errorInfo = handleStepError(
            error,
            `求人${job.job_description_id}のマッチング処理`,
            logger
          );

          return {
            jobId: job.job_description_id,
            success: false,
            error: errorInfo.error,
          };
        }
      })
    );

    // 結果を収集（成功・失敗両方含む）
    const processedMatches = jobMatches.map(result =>
      result.status === 'fulfilled'
        ? result.value
        : {
            jobId: 'unknown',
            success: false,
            error: String(result.reason),
          }
    );

    logStepCompletion(`マッチング分析`, processedMatches.length, logger);

    return {
      checklist: inputData.checklist,
      searchSummary: inputData.search_summary,
      jobs: inputData.jobs,
      jobMatches: processedMatches,
    };
  },
});

// 最終結果集約ステップ
const aggregateResultsStep = createStep({
  id: 'aggregate-results',
  description: '全ての結果を集約し、フィルタリング・ソートして最終出力を生成',
  inputSchema: z.object({
    checklist: z.string(),
    searchSummary: z.object({
      total_found: z.number(),
      unique_found: z.number(),
      duplicates_removed: z.number(),
      target_achieved: z.boolean(),
      search_phases_executed: z.number(),
    }),
    jobs: z.array(jobSchema),
    jobMatches: z.array(
      z.object({
        jobId: z.string(),
        success: z.boolean(),
        matchRate: z.number().optional(),
        matchResult: jobMatchingOutputSchema.shape.match_result.optional(),
        error: z.string().optional(),
      })
    ),
  }),
  outputSchema: z.object({
    executionSummary: z.object({
      checklistGenerated: z.boolean(),
      jobsFound: z.number(),
      uniqueJobsFound: z.number(),
      duplicatesRemoved: z.number(),
      jobsAnalyzed: z.number(),
      jobsWithErrors: z.number(),
      recommendedJobs: z.number(),
    }),
    checklist: z.string(),
    searchResults: z.object({
      total_found: z.number(),
      unique_found: z.number(),
      duplicates_removed: z.number(),
      target_achieved: z.boolean(),
      search_phases_executed: z.number(),
    }),
    recommendations: z.array(
      z.object({
        jobId: z.string(),
        title: z.string(),
        company_name: z.string(),
        url: z.string(),
        matchRate: z.number(),
        job_content_summary: z.string(),
        recommendation_reason: z.string(),
        strengths: z.array(z.string()),
        considerations: z.array(z.string()),
      })
    ),
  }),
  // eslint-disable-next-line @typescript-eslint/require-await
  execute: async ({ inputData, mastra }) => {
    const logger = mastra.getLogger() as Logger;

    // 求人情報のマップを作成（IDをキーとして高速アクセス）
    const jobsMap = new Map(
      inputData.jobs.map(job => [job.job_description_id, job])
    );

    // 成功した案件のみを抽出
    const successfulMatches = inputData.jobMatches.filter(
      job => job.success && job.matchRate !== undefined
    );

    // 設定値以上の案件のみをフィルタリングし、structured outputを活用
    const recommendations = successfulMatches
      .filter(job => (job.matchRate ?? 0) >= WORKFLOW_CONFIG.MATCH_THRESHOLD)
      .sort((a, b) => (b.matchRate ?? 0) - (a.matchRate ?? 0)) // マッチング率降順でソート
      .map(job => {
        const matchResult = job.matchResult;
        const jobInfo = jobsMap.get(job.jobId);

        if (!matchResult) {
          // フォールバック（通常は発生しない）
          return {
            jobId: job.jobId,
            title: jobInfo?.title ?? 'Unknown',
            company_name: jobInfo?.company ?? 'Unknown',
            url: jobInfo?.url ?? '',
            matchRate: job.matchRate ?? 0,
            job_content_summary: 'データが取得できませんでした',
            recommendation_reason: 'データが取得できませんでした',
            strengths: [],
            considerations: [],
          };
        }

        return {
          jobId: job.jobId,
          title: matchResult.job_title,
          company_name: matchResult.company_name,
          url: jobInfo?.url ?? '',
          matchRate: job.matchRate ?? 0,
          job_content_summary: matchResult.job_content_summary,
          recommendation_reason: matchResult.recommendation_reason,
          strengths: matchResult.strengths,
          considerations: matchResult.considerations,
        };
      });

    const executionSummary = {
      checklistGenerated: !!inputData.checklist,
      jobsFound: inputData.searchSummary.total_found,
      uniqueJobsFound: inputData.searchSummary.unique_found,
      duplicatesRemoved: inputData.searchSummary.duplicates_removed,
      jobsAnalyzed: successfulMatches.length,
      jobsWithErrors: inputData.jobMatches.length - successfulMatches.length,
      recommendedJobs: recommendations.length,
    };

    logStepCompletion(
      `ワークフロー完了: ${String(executionSummary.recommendedJobs)}件の推奨求人を特定`,
      executionSummary.recommendedJobs,
      logger
    );
    logStepCompletion(
      `実行統計: 検索${String(executionSummary.jobsFound)}件 → ユニーク${String(executionSummary.uniqueJobsFound)}件 → 分析成功${String(executionSummary.jobsAnalyzed)}件 → 推奨${String(executionSummary.recommendedJobs)}件`,
      executionSummary.recommendedJobs,
      logger
    );

    return {
      executionSummary,
      checklist: inputData.checklist,
      searchResults: inputData.searchSummary,
      recommendations,
    };
  },
});

// 統合ワークフローの定義
export const recruitWorkflowSample = createWorkflow({
  id: 'recruit-workflow-sample',
  description: '求人検索からマッチング分析までの統合ワークフロー',
  inputSchema: z.object({
    userRequirements: z.string().describe('ユーザーの求人条件（自由文）'),
  }),
  outputSchema: z.object({
    executionSummary: z.object({
      checklistGenerated: z.boolean(),
      jobsFound: z.number(),
      uniqueJobsFound: z.number(),
      duplicatesRemoved: z.number(),
      jobsAnalyzed: z.number(),
      jobsWithErrors: z.number(),
      recommendedJobs: z.number(),
    }),
    checklist: z.string(),
    searchResults: z.object({
      total_found: z.number(),
      unique_found: z.number(),
      duplicates_removed: z.number(),
      target_achieved: z.boolean(),
      search_phases_executed: z.number(),
    }),
    recommendations: z.array(
      z.object({
        jobId: z.string(),
        title: z.string(),
        company_name: z.string(),
        url: z.string(),
        matchRate: z.number(),
        job_content_summary: z.string(),
        recommendation_reason: z.string(),
        strengths: z.array(z.string()),
        considerations: z.array(z.string()),
      })
    ),
  }),
});

// ワークフロー実行の定義
recruitWorkflowSample
  // 1. チェックリスト生成
  .map({
    prompt: {
      initData: recruitWorkflowSample,
      path: 'userRequirements',
    },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  .then(checklistStep as any)
  // 2. 求人検索（チェックリストから直接）
  .map({
    prompt: {
      step: checklistStep,
      path: 'text',
    },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  .then(recruitStep as any)
  // 3. 重複削除
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  .then(deduplicateJobsStep as any)
  // 4. マッチング分析（チェックリストと求人リストを組み合わせ）
  .map({
    checklist: {
      step: checklistStep,
      path: 'text',
    },
    search_summary: {
      step: deduplicateJobsStep,
      path: 'search_summary',
    },
    jobs: {
      step: deduplicateJobsStep,
      path: 'jobs',
    },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  .then(analyzeJobMatchingStep as any)
  // 5. 結果集約（全ての情報を統合）
  .map({
    checklist: {
      step: analyzeJobMatchingStep,
      path: 'checklist',
    },
    searchSummary: {
      step: analyzeJobMatchingStep,
      path: 'searchSummary',
    },
    jobs: {
      step: analyzeJobMatchingStep,
      path: 'jobs',
    },
    jobMatches: {
      step: analyzeJobMatchingStep,
      path: 'jobMatches',
    },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  .then(aggregateResultsStep as any)
  .commit();
