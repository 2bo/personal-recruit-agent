import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from './index';

// テスト用のモックイベント
const mockEvent: APIGatewayProxyEvent = {
  body: JSON.stringify({
    userRequirements:
      'Node.js、TypeScript経験があるバックエンドエンジニア職。リモートワーク可能で年収600万円以上希望。',
  }),
  headers: {},
  multiValueHeaders: {},
  httpMethod: 'POST',
  isBase64Encoded: false,
  path: '/recruit',
  pathParameters: null,
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  stageVariables: null,
  requestContext: {
    accountId: 'test',
    resourceId: 'test',
    stage: 'test',
    requestId: 'test',
    identity: {
      cognitoIdentityPoolId: null,
      accountId: null,
      cognitoIdentityId: null,
      caller: null,
      apiKey: null,
      sourceIp: '127.0.0.1',
      cognitoAuthenticationType: null,
      cognitoAuthenticationProvider: null,
      userArn: null,
      userAgent: 'test',
      user: null,
      accessKey: null,
      apiKeyId: null,
      clientCert: null,
      principalOrgId: null,
    },
    resourcePath: '/recruit',
    httpMethod: 'POST',
    apiId: 'test',
    protocol: 'HTTP/1.1',
    requestTime: '01/Jan/2025:00:00:00 +0000',
    requestTimeEpoch: 1640995200,
    path: '/recruit',
    authorizer: {},
  },
  resource: '/recruit',
};

// Lambda関数をテスト実行
const testLambda = async () => {
  console.log('Lambda関数をテスト実行中...');
  if (mockEvent.body) {
    console.log('入力:', JSON.parse(mockEvent.body));
  }

  try {
    const result = await handler(mockEvent);
    console.log('ステータスコード:', result.statusCode);
    console.log('レスポンス:', JSON.parse(result.body));
  } catch (error) {
    console.error('エラー:', error);
  }
};

void testLambda();
