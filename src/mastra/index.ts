import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { PinoLogger } from '@mastra/loggers';
import { JobSearchAgent } from './agents/job-search-agent';
import { ChecklistAgent } from './agents/checklist-agent';
import { JobMatcherAgent } from './agents/job-matcher-agent';
import { recruitWorkflowSample } from './workflows/recruit-workflow-sample';

// ストレージインスタンスを作成
const storage = new LibSQLStore({
  // インメモリーストレージを使用（開発用）
  url: 'file:./database.db:',
});

// ロガーインスタンスを作成
const logger = new PinoLogger({
  name: 'PersonalRecruitAgent',
  level: 'info',
});

export const mastra = new Mastra({
  storage,
  logger,
  agents: { JobSearchAgent, ChecklistAgent, JobMatcherAgent },
  workflows: { recruitWorkflowSample },
});
