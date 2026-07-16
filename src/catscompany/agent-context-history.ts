import type { ParsedCatsMessage } from './types';

type UnknownRecord = Record<string, unknown>;

export interface CatsAgentContextHistoryMessage {
  id?: number;
  seq_id?: number;
  from_uid?: number | string;
  content?: unknown;
  content_blocks?: unknown[];
  metadata?: UnknownRecord;
  context_role?: string;
  context_eligible?: boolean;
  context_reason?: string;
}

export interface CatsAgentContextHistoryResponse {
  messages: CatsAgentContextHistoryMessage[];
  topic_id?: string;
  agent_uid?: number | string;
  has_more?: boolean;
  next_before_id?: number;
}

export function isNativeFeishuGroupTrigger(
  msg: Pick<ParsedCatsMessage, 'chatType' | 'metadata' | 'seq'>,
): boolean {
  if (msg.chatType !== 'group' || msg.seq <= 0) return false;
  const metadata = asRecord(msg.metadata);
  return stringField(metadata, 'source_channel').toLowerCase() === 'feishu'
    && numberField(metadata, 'channel_native_group_binding_id') > 0
    && booleanField(metadata, 'channel_native_group_triggered');
}

/**
 * Returns record-only Feishu group messages since the previous model trigger.
 * The server has already removed tool/runtime messages and messages targeting
 * another participant; this client-side pass keeps replay bounded and idempotent.
 */
export function selectNativeFeishuGroupContext(
  history: CatsAgentContextHistoryMessage[],
  afterSeq = 0,
): string[] {
  const ordered = [...history].sort((a, b) => messageSeq(a) - messageSeq(b));
  return ordered
    .filter(message => messageSeq(message) > afterSeq)
    .filter(message => isEligibleParticipantMessage(message))
    .map(formatParticipantMessage)
    .filter((message): message is string => Boolean(message));
}

function isEligibleParticipantMessage(message: CatsAgentContextHistoryMessage): boolean {
  return message.context_eligible === true && message.context_role === 'user';
}

function formatParticipantMessage(message: CatsAgentContextHistoryMessage): string {
  const text = extractMessageText(message);
  if (!text) return '';
  const metadata = asRecord(message.metadata);
  const identity = asRecord(metadata.catsco_identity);
  const actor = asRecord(identity.actor);
  const speaker = stringField(actor, 'display_name')
    || stringField(actor, 'username')
    || stringField(actor, 'user_id')
    || String(message.from_uid || '').trim()
    || 'User';
  return `[发言人: ${speaker}]\n${text}`;
}

function extractMessageText(message: CatsAgentContextHistoryMessage): string {
  if (Array.isArray(message.content_blocks)) {
    const blockText = message.content_blocks
      .map(block => asRecord(block))
      .filter(block => stringField(block, 'type') === 'text')
      .map(block => stringField(block, 'text'))
      .filter(Boolean)
      .join('\n\n')
      .trim();
    if (blockText) return blockText;
  }
  if (typeof message.content === 'string') {
    const text = message.content.trim();
    if (!text) return '';
    try {
      const parsed = JSON.parse(text);
      return typeof parsed === 'string' ? parsed.trim() : text;
    } catch {
      return text;
    }
  }
  return '';
}

function messageSeq(message: CatsAgentContextHistoryMessage): number {
  return Number(message.seq_id || message.id || 0);
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function stringField(record: UnknownRecord, key: string): string {
  return typeof record[key] === 'string' ? String(record[key]).trim() : '';
}

function numberField(record: UnknownRecord, key: string): number {
  const value = Number(record[key]);
  return Number.isFinite(value) ? value : 0;
}

function booleanField(record: UnknownRecord, key: string): boolean {
  return record[key] === true || record[key] === 1 || record[key] === '1' || record[key] === 'true';
}
