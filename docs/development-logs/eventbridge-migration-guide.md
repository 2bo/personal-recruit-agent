# EventBridge移行ガイド：API GatewayからEventBridge Cronへの移行

## 概要

このドキュメントは、Personal Recruit AgentのLambda関数をAPI Gatewayトリガーから、EventBridge（旧CloudWatch Events）によるcron実行に移行した際の対応をまとめたものです。

## 背景と移行理由

### 移行前の構成

- **トリガー**: API Gateway
- **実行方式**: 手動実行またはHTTPリクエスト経由
- **イベント形式**: `APIGatewayProxyEvent`

### 移行理由

- **定期実行の必要性**: 毎日夜20時の自動実行を実現
- **運用効率**: 手動実行から自動化への移行
- **コスト最適化**: API Gatewayの不要なリクエスト課金を削減

## 技術的変更点

### 1. Lambda関数のイベント処理変更

#### 修正前（API Gateway形式）

```typescript
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // リクエストボディからパラメータ取得
    const body = JSON.parse(event.body || '{}');
    const userRequirements = body.userRequirements;

    // ワークフロー実行
    const result = await run.start({ inputData: parsedInput.data });

    // HTTP レスポンス形式で返却
    return {
      statusCode: 200,
      body: JSON.stringify(result),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
```

#### 修正後（EventBridge形式）

```typescript
// EventBridge用の型定義
interface EventBridgeEvent {
  source: string;
  'detail-type': string;
  detail: {
    userRequirements?: string;
    conditions?: Record<string, unknown>;
  };
}

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

    // ワークフロー実行
    const result = await run.start({ inputData: parsedInput.data });

    // 結果を直接返却（HTTP レスポンス不要）
    console.log('Recruitment workflow completed successfully');
    return result;
  } catch (error) {
    console.error('Recruitment workflow failed:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Recruitment workflow failed: ${errorMessage}`);
  }
};
```

### 2. テストファイルの更新

#### 修正前（API Gateway形式テスト）

```typescript
describe('Lambda Handler', () => {
  it('should handle API Gateway event', async () => {
    const event = {
      body: JSON.stringify({
        userRequirements: 'TypeScript、フルリモート、年収600万円以上',
      }),
      headers: {},
      // ... その他のAPI Gatewayプロパティ
    } as APIGatewayProxyEvent;

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
  });
});
```

#### 修正後（EventBridge形式テスト）

```typescript
describe('Lambda Handler', () => {
  it('should handle EventBridge event', async () => {
    const event = {
      source: 'personal.recruit.agent',
      'detail-type': 'Job Search Request',
      detail: {
        userRequirements: 'TypeScript、フルリモート、年収600万円以上',
      },
    };

    const result = await handler(event);
    expect(result).toBeDefined();
  });
});
```

### 3. EventBridgeルールの設定

#### AWS Console での設定手順

1. **EventBridgeコンソールでルール作成**

   ```
   ルール名: personal-recruit-agent-daily-schedule
   説明: Personal Recruit Agent の毎日実行スケジュール
   ```

2. **スケジュール式の設定**

   ```
   スケジュール式: cron(0 20 * * ? *)
   説明: 毎日 20:00 UTC（日本時間 05:00）に実行
   ```

3. **ターゲット設定**

   ```
   ターゲットタイプ: AWS Lambda function
   関数名: personal-recruit-agent-container
   ```

4. **入力設定**
   ```json
   {
     "source": "personal.recruit.agent",
     "detail-type": "Scheduled Job Search",
     "detail": {
       "userRequirements": "TypeScript、Next.js、React、フルリモート、副業OK、年収700万円以上、自社開発"
     }
   }
   ```

#### AWS CLI での設定例

```bash
# EventBridge ルールの作成
aws events put-rule \
  --name personal-recruit-agent-daily \
  --schedule-expression "cron(0 20 * * ? *)" \
  --description "Personal Recruit Agent daily execution" \
  --region ap-northeast-1

# Lambda関数をターゲットに追加
aws events put-targets \
  --rule personal-recruit-agent-daily \
  --targets "Id"="1","Arn"="arn:aws:lambda:ap-northeast-1:ACCOUNT_ID:function:personal-recruit-agent-container" \
  --region ap-northeast-1

# Lambda関数にEventBridgeからの実行権限を付与
aws lambda add-permission \
  --function-name personal-recruit-agent-container \
  --statement-id personal-recruit-agent-eventbridge \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn "arn:aws:events:ap-northeast-1:ACCOUNT_ID:rule/personal-recruit-agent-daily" \
  --region ap-northeast-1
```

## 実装上の課題と解決策

### 1. イベント構造の違い

**課題**: API GatewayとEventBridgeでイベント構造が大きく異なる

**解決策**:

- EventBridge専用の型定義を作成
- フレキシブルなパラメータ取得ロジック（`detail.userRequirements` または `detail.conditions.userRequirements`）
- エラーハンドリングの簡素化（HTTP ステータスコード不要）

### 2. レスポンス形式の変更

**課題**: API Gatewayは構造化されたHTTPレスポンスが必要、EventBridgeは不要

**解決策**:

```typescript
// 修正前: HTTP レスポンス必須
return {
  statusCode: 200,
  body: JSON.stringify(result),
};

// 修正後: 結果を直接返却
return result;
```

### 3. パラメータ渡し方法

**課題**: EventBridgeでの動的パラメータ設定

**解決策**: EventBridgeルールの設定で`detail`オブジェクト内にパラメータを埋め込み

```json
{
  "detail": {
    "userRequirements": "具体的な求人条件",
    "conditions": {
      "priority": "high",
      "department": "engineering"
    }
  }
}
```

## テスト実行とデバッグ

### 1. AWS Consoleでの手動テスト

**Lambda コンソールでのテストイベント設定**:

```json
{
  "source": "personal.recruit.agent",
  "detail-type": "Manual Test",
  "detail": {
    "userRequirements": "TypeScript、React、フルリモート、年収600万円以上"
  }
}
```

**実行手順**:

1. Lambda コンソール → 関数選択
2. 「テスト」タブ → 「新しいテストイベント作成」
3. EventBridge形式のJSONを入力
4. 「テスト」実行

### 2. CloudWatch Logsでの実行確認

**ログ出力例**:

```
[INFO] チェックリスト生成結果: ## 求人検索チェックリスト...
[INFO] 求人検索結果: [{job_description_id: "12345", title: "TypeScript エンジニア"...}]
[INFO] 求人ID 12345 のマッチング結果: {matchingScore: 85, ...}
[INFO] フィルタリング後のマッチング結果: [...]
[INFO] Slack通知結果: {notificationSent: true, ...}
```

### 3. EventBridgeルールの状態確認

```bash
# ルールの状態確認
aws events describe-rule \
  --name personal-recruit-agent-daily \
  --region ap-northeast-1

# ターゲットの確認
aws events list-targets-by-rule \
  --rule personal-recruit-agent-daily \
  --region ap-northeast-1
```

## 本番運用での設定

### 1. 実際の cron 設定

**毎日夜20時実行（JST）**:

```
cron(0 11 * * ? *)  # UTC 11:00 = JST 20:00
```

**注意事項**:

- EventBridgeはUTC時間で動作
- 日本時間との時差（9時間）を考慮
- サマータイム非適用（日本は通年+9時間）

### 2. エラー通知の設定

**CloudWatch アラーム設定**:

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "PersonalRecruitAgent-ExecutionFailed" \
  --alarm-description "Personal Recruit Agent execution failure" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --dimensions Name=FunctionName,Value=personal-recruit-agent-container \
  --evaluation-periods 1
```

### 3. リトライ設定

**デッドレターキューの設定**:

```typescript
// ワークフロー内でのリトライ設定
retryConfig: {
  attempts: 1,
  delay: 60000,  // 60秒待機
}
```

## 移行後の利点

### 1. 運用効率の向上

- **自動実行**: 手動実行から完全自動化
- **定期性**: 毎日決まった時間での確実な実行
- **保守性**: イベント設定の集中管理

### 2. コスト最適化

- **API Gateway不要**: リクエスト課金の削減
- **EventBridge**: 無料枠内での利用（月100万リクエストまで無料）

### 3. 柔軟性の向上

- **パラメータ調整**: EventBridgeルール設定での条件変更
- **複数スケジュール**: 異なる条件での複数ルール設定可能
- **一時停止**: ルールの有効/無効切り替え

## トラブルシューティング

### よくある問題と解決策

**1. Lambda関数が実行されない**

```bash
# 権限確認
aws lambda get-policy --function-name personal-recruit-agent-container

# EventBridge実行履歴確認
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/personal-recruit-agent-container"
```

**2. パラメータが正しく渡されない**

- EventBridgeルールの入力設定を確認
- Lambda関数内のイベント処理ロジックをデバッグ
- CloudWatch Logsでイベント内容を確認

**3. Timezone関連の問題**

- cron式がUTC基準であることを確認
- 日本時間との時差計算を再確認

## まとめ

EventBridgeへの移行により、以下が実現できました：

1. **完全自動化**: API Gateway の手動実行から EventBridge cron での自動実行
2. **運用効率向上**: 毎日夜20時の確実な実行
3. **コスト最適化**: API Gateway 課金の削減
4. **保守性向上**: EventBridge コンソールでの集中管理

技術的には、イベント構造の変更とレスポンス形式の簡素化が主な変更点でした。この移行により、Personal Recruit Agent は安定した定期実行システムとして稼働しています。

## 参考情報

### EventBridge Cron 式の例

```
cron(0 12 * * ? *)     # 毎日 12:00 UTC
cron(0 9 ? * MON-FRI *) # 平日 9:00 UTC
cron(0 0 1 * ? *)      # 毎月1日 0:00 UTC
cron(0/15 * * * ? *)   # 15分毎
```

### 関連AWSサービス

- **Amazon EventBridge**: イベントルーティングサービス
- **AWS Lambda**: サーバーレス実行環境
- **CloudWatch Logs**: ログ管理サービス
- **CloudWatch Alarms**: メトリクス監視サービス
