import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { PinoLogger } from '@mastra/loggers';
import { JobSearchAgent } from './agents/job-search-agent';
import { ChecklistAgent } from './agents/checklist-agent';
import { JobMatcherAgent } from './agents/job-matcher-agent';
import { recruitWorkflow } from './workflows/recruit-workflow';

const storage = new LibSQLStore({
  url: ':memory:',
});

const logger = new PinoLogger({
  name: 'PersonalRecruitAgent',
  level: 'info',
});

export const mastra = new Mastra({
  storage,
  logger,
  agents: { JobSearchAgent, ChecklistAgent, JobMatcherAgent },
  workflows: { recruitWorkflow },
});
