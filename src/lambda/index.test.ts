import { handler } from './index';

// EventBridge用のモックイベント
const mockEvent = {
  source: 'aws.events',
  'detail-type': 'Scheduled Event',
  detail: {
    userRequirements:
      'Node.js、TypeScript経験があるバックエンドエンジニア職。リモートワーク可能で年収600万円以上希望。',
  },
};

// Lambda関数をテスト実行
const testLambda = async () => {
  console.log('Lambda関数をテスト実行中...');
  console.log('入力:', mockEvent.detail);

  try {
    const result = await handler(mockEvent);
    console.log('実行結果:', result);
  } catch (error) {
    console.error('エラー:', error);
  }
};

void testLambda();
