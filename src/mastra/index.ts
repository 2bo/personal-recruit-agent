import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { RecruitAgent } from './agents/recruit-agent';
import { ChecklistAgent } from './agents/checklist-agent';

// ストレージインスタンスを作成
const storage = new LibSQLStore({
  // インメモリーストレージを使用（開発用）
  url: 'file:./database.db:',
});

export const mastra = new Mastra({
  storage,
  agents: { RecruitAgent, ChecklistAgent },
});
