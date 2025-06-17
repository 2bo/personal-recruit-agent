import { IncomingWebhookSendArguments } from '@slack/webhook';
import {
  Block,
  KnownBlock,
  SectionBlock,
  HeaderBlock,
  ContextBlock,
  DividerBlock,
} from '@slack/types';
import { MatchResult } from '../types/recruitment';

export interface JobSlackFormatterOptions {
  useRichFormat?: boolean;
  channel?: string;
}

/**
 * 求人マッチング結果をSlackメッセージ形式にフォーマットする
 */
export const formatJobResultsForSlack = (
  matchingResults: MatchResult[],
  options: JobSlackFormatterOptions = {}
): IncomingWebhookSendArguments | null => {
  const { useRichFormat = true, channel } = options;

  // 結果が空の場合はnullを返す（通知しない）
  if (matchingResults.length === 0) {
    return null;
  }

  const messageArgs: IncomingWebhookSendArguments = {
    text: `求人マッチング結果 (${matchingResults.length.toString()}件)`, // フォールバック用テキスト
  };

  if (channel) {
    messageArgs.channel = channel;
  }

  if (useRichFormat) {
    // Block Kit形式を使用
    messageArgs.blocks = formatJobResultBlocks(matchingResults);
  } else {
    // プレーンテキスト形式を使用
    messageArgs.text = formatJobResultText(matchingResults);
  }

  return messageArgs;
};

/**
 * プレーンテキスト形式で求人結果をフォーマット
 */
export const formatJobResultText = (matchingResults: MatchResult[]): string => {
  if (matchingResults.length === 0) {
    return '';
  }

  const resultCount = matchingResults.length;
  const header = `🎯 求人マッチング結果 (${resultCount.toString()}件見つかりました)`;

  const jobEntries = matchingResults.map((result, index) => {
    const rankEmoji = getRankEmoji(index);
    const scoreEmoji = getScoreEmoji(result.matchingScore);

    return `${rankEmoji} 【${result.matchingScore.toString()}%マッチ】${result.title}
💼 求人ID: ${result.job_description_id}
${scoreEmoji} マッチ率: ${result.matchingScore.toString()}%
📝 マッチ理由: ${result.matchingReason}
👀 詳細: ${result.url || '詳細URLなし'}`;
  });

  const timestamp = new Date().toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const footer = `
📊 検索統計:
- 推奨求人数: ${resultCount.toString()}件 (マッチ率80%以上)
- 実行時刻: ${timestamp}`;

  return `${header}

${jobEntries.join('\n\n')}${footer}`;
};

/**
 * Block Kit形式で求人結果をフォーマット
 */
export const formatJobResultBlocks = (
  matchingResults: MatchResult[]
): (Block | KnownBlock)[] => {
  if (matchingResults.length === 0) {
    return [];
  }

  const resultCount = matchingResults.length;
  const blocks: (Block | KnownBlock)[] = [];

  // ヘッダーブロック
  const headerBlock: HeaderBlock = {
    type: 'header',
    text: {
      type: 'plain_text',
      text: `🎯 求人マッチング結果 (${resultCount.toString()}件)`,
      emoji: true,
    },
  };
  blocks.push(headerBlock);

  // 各求人のブロック
  matchingResults.forEach((result, index) => {
    const rankEmoji = getRankEmoji(index);
    const scoreEmoji = getScoreEmoji(result.matchingScore);

    // 求人情報セクション
    const jobInfoSection: SectionBlock = {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${rankEmoji} *【${result.matchingScore.toString()}%マッチ】${result.title}*\n💼 求人ID: ${result.job_description_id}\n${scoreEmoji} マッチ率: ${result.matchingScore.toString()}%`,
      },
    };
    blocks.push(jobInfoSection);

    // マッチ理由セクション
    const reasonSection: SectionBlock = {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `📝 *マッチ理由:*\n${result.matchingReason}`,
      },
    };

    // URLがある場合はボタンを追加
    if (result.url) {
      reasonSection.accessory = {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '詳細を見る',
          emoji: true,
        },
        url: result.url,
        action_id: `view_job_${result.job_description_id}`,
      };
    }

    blocks.push(reasonSection);

    // 区切り線（最後以外）
    if (index < matchingResults.length - 1) {
      const divider: DividerBlock = {
        type: 'divider',
      };
      blocks.push(divider);
    }
  });

  // フッターブロック
  const timestamp = new Date().toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const contextBlock: ContextBlock = {
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `📊 推奨求人数: ${resultCount.toString()}件 (マッチ率80%以上) | 実行時刻: ${timestamp}`,
      },
    ],
  };
  blocks.push(contextBlock);

  return blocks;
};

/**
 * 順位に応じた絵文字を取得
 */
const getRankEmoji = (index: number): string => {
  switch (index) {
    case 0:
      return '🏆';
    case 1:
      return '🥈';
    case 2:
      return '🥉';
    default:
      return '📋';
  }
};

/**
 * スコアに応じた絵文字を取得
 */
const getScoreEmoji = (score: number): string => {
  if (score >= 95) return '🔥';
  if (score >= 90) return '⭐';
  if (score >= 85) return '✅';
  return '👍';
};
