export const RUNTIME_FEEDBACK_PREFIX = '[运行时反馈]';

const DEFAULT_MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_MAX_HINT_LENGTH = 500;

export interface RuntimeFeedbackFormatOptions {
  actionHint?: string;
  maxLength?: number;
}

export function formatRuntimeFeedback(
  source: string,
  message: string,
  options: RuntimeFeedbackFormatOptions = {},
): string {
  const normalizedMessage = normalizeFeedbackText(message);
  if (!normalizedMessage) return '';

  const normalizedSource = normalizeFeedbackText(source) || 'runtime';
  const lines = [
    `${RUNTIME_FEEDBACK_PREFIX} ${normalizedSource}`,
    `错误: ${truncate(normalizedMessage, options.maxLength ?? DEFAULT_MAX_MESSAGE_LENGTH)}`,
  ];

  const actionHint = normalizeFeedbackText(options.actionHint || '');
  if (actionHint) {
    lines.push(`处理建议: ${truncate(actionHint, DEFAULT_MAX_HINT_LENGTH)}`);
  }

  return lines.join('\n');
}

export function fingerprintRuntimeFeedback(source: string, message: string): string {
  return [
    normalizeFeedbackText(source).toLowerCase() || 'runtime',
    normalizeFeedbackText(message).toLowerCase(),
  ].join(':');
}

export function isRuntimeFeedbackContent(content: unknown): content is string {
  return typeof content === 'string' && content.startsWith(RUNTIME_FEEDBACK_PREFIX);
}

function normalizeFeedbackText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}... [truncated]`;
}
