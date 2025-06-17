import {
  IncomingWebhook,
  IncomingWebhookSendArguments,
  IncomingWebhookResult,
} from '@slack/webhook';

export interface SlackNotificationOptions {
  channel?: string;
  webhookUrl?: string;
}

export interface SlackNotificationResult {
  success: boolean;
  message: string;
  notificationSent: boolean;
  slackResponse?: IncomingWebhookResult;
}

/**
 * 汎用的なSlack通知送信関数
 * @param messageOrArgs - 送信するメッセージ（文字列またはIncomingWebhookSendArguments）
 * @param options - 通知オプション（チャンネル、Webhook URL等）
 */
export const sendSlackNotification = async (
  messageOrArgs: string | IncomingWebhookSendArguments,
  options: SlackNotificationOptions = {}
): Promise<SlackNotificationResult> => {
  const { channel, webhookUrl: customWebhookUrl } = options;

  // 環境変数またはオプションからWebhook URLを取得
  const webhookUrl = customWebhookUrl ?? process.env.SLACK_WEBHOOK_URL;
  const defaultChannel = process.env.SLACK_DEFAULT_CHANNEL ?? '#general';

  if (!webhookUrl) {
    return {
      success: false,
      message:
        'SLACK_WEBHOOK_URL 環境変数が設定されていないか、webhookUrlオプションが提供されていません',
      notificationSent: false,
    };
  }

  try {
    // IncomingWebhookインスタンスを作成
    const webhook = new IncomingWebhook(webhookUrl);

    // メッセージペイロードを構築
    let messageArgs: IncomingWebhookSendArguments;

    if (typeof messageOrArgs === 'string') {
      // 文字列の場合はシンプルなテキストメッセージとして送信
      messageArgs = {
        text: messageOrArgs,
        channel: channel ?? defaultChannel,
      };
    } else {
      // IncomingWebhookSendArgumentsオブジェクトの場合はそのまま使用
      messageArgs = {
        ...messageOrArgs,
        channel: messageOrArgs.channel ?? channel ?? defaultChannel,
      };
    }

    // Slack Webhook経由でメッセージを送信
    const result = await webhook.send(messageArgs);

    return {
      success: true,
      message: 'Slack通知が成功しました',
      notificationSent: true,
      slackResponse: result,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Slack通知でエラーが発生しました: ${errorMessage}`,
      notificationSent: false,
    };
  }
};
