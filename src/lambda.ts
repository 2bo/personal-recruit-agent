import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { mastra } from './mastra';

const RecruitmentInputSchema = z.object({
  userRequirements: z.string(),
});

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing request body' }),
    };
  }

  try {
    const parsedInput = RecruitmentInputSchema.safeParse(
      JSON.parse(event.body)
    );

    if (!parsedInput.success) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: 'Invalid input',
          errors: parsedInput.error.issues,
        }),
      };
    }

    const workflow = mastra.getWorkflow('recruitWorkflow');
    const run = workflow.createRun();
    const result = await run.start({ inputData: parsedInput.data });

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error(error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Internal server error',
        error: errorMessage,
      }),
    };
  }
};
