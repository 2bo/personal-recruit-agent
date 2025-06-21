import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { PinoLogger } from '@mastra/loggers';
import { JobSearchAgent } from './agents/job-search-agent';
import { ChecklistAgent } from './agents/checklist-agent';
import { JobMatcherAgent } from './agents/job-matcher-agent';
import { recruitWorkflow } from './workflows/recruit-workflow';

// ストレージインスタンスを作成（全エージェント共通）
const storage = new LibSQLStore({
  url: 'file:./mastra.db',
});

// ロガーインスタンスを作成
const logger = new PinoLogger({
  name: 'PersonalRecruitAgent',
  level: 'debug', // DEBUGレベルに変更してメモリ操作を詳細ログ出力
});

export const mastra = new Mastra({
  storage,
  logger,
  agents: { JobSearchAgent, ChecklistAgent, JobMatcherAgent },
  workflows: { recruitWorkflow },
});
