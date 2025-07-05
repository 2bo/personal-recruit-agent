import { z } from 'zod';
import { mastra } from '../mastra';

// EventBridge用の型定義
interface EventBridgeEvent {
  source: string;
  'detail-type': string;
  detail: {
    userRequirements?: string;
    conditions?: Record<string, unknown>;
  };
}

const RecruitmentInputSchema = z.object({
  userRequirements: z.string(),
});

export const handler = async (event: EventBridgeEvent) => {
  try {
    // EventBridgeからの詳細情報を取得
    const detail = event.detail;

    // userRequirementsを取得（detail直下またはconditions内）
    const userRequirements =
      detail.userRequirements ??
      (detail.conditions?.userRequirements as string);

    if (!userRequirements) {
      throw new Error('userRequirements is required');
    }

    const parsedInput = RecruitmentInputSchema.safeParse({
      userRequirements,
    });

    if (!parsedInput.success) {
      throw new Error(
        `Invalid input: ${parsedInput.error.issues.map(i => i.message).join(', ')}`
      );
    }

    const workflow = mastra.getWorkflow('recruitWorkflow');
    const run = workflow.createRun();
    const result = await run.start({ inputData: parsedInput.data });

    console.log('Recruitment workflow completed successfully');
    return result;
  } catch (error) {
    console.error('Recruitment workflow failed:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Recruitment workflow failed: ${errorMessage}`);
  }
};
