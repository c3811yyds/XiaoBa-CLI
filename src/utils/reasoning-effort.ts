import type { ChatConfig, ReasoningEffort } from '../types';

export const REASONING_EFFORT_OPTIONS: ReasoningEffort[] = [
  'default',
  'high',
  'max',
  'disabled',
];

export const OPENAI_REASONING_EFFORT_OPTIONS: ReasoningEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
];

const NORMALIZABLE_REASONING_EFFORTS = [
  ...new Set([...REASONING_EFFORT_OPTIONS, ...OPENAI_REASONING_EFFORT_OPTIONS]),
];

type ReasoningModelFamily = 'deepseek' | 'glm' | 'gpt56';

export function normalizeReasoningEffort(value: unknown): ReasoningEffort | undefined {
  const text = String(value || '').trim().toLowerCase();
  return NORMALIZABLE_REASONING_EFFORTS.includes(text as ReasoningEffort)
    ? text as ReasoningEffort
    : undefined;
}

export function reasoningEffortOrDefault(value: unknown): ReasoningEffort {
  return normalizeReasoningEffort(value) ?? 'default';
}

export function applyOpenAIReasoningOptions(body: Record<string, unknown>, config: Pick<ChatConfig, 'model' | 'apiUrl' | 'reasoningEffort'>): void {
  const effort = normalizeReasoningEffort(config.reasoningEffort);
  if (!effort || effort === 'default') return;

  const family = inferReasoningModelFamily(config);
  if (!family) return;

  if (family === 'gpt56') {
    body.reasoning_effort = effort === 'max' ? 'xhigh' : effort === 'disabled' ? 'none' : effort;
    delete body.thinking;
    return;
  }

  if (effort === 'disabled') {
    body.thinking = { type: 'disabled' };
    delete body.reasoning_effort;
    return;
  }

  body.thinking = { type: 'enabled' };
  if (family === 'deepseek') {
    body.reasoning_effort = effort;
  }
}

export function applyAnthropicReasoningOptions(params: Record<string, unknown>, config: Pick<ChatConfig, 'model' | 'apiUrl' | 'reasoningEffort'>): void {
  const effort = normalizeReasoningEffort(config.reasoningEffort);
  if (!effort || effort === 'default') return;

  const family = inferReasoningModelFamily(config);
  if (!family) return;
  if (family === 'gpt56') return;

  if (effort === 'disabled') {
    params.thinking = { type: 'disabled' };
    delete params.output_config;
    return;
  }

  params.thinking = { type: 'enabled' };
  if (family === 'deepseek') {
    params.output_config = { effort };
  }
}

export function supportsReasoningSwitch(config: Pick<ChatConfig, 'model' | 'apiUrl'>): boolean {
  return Boolean(inferReasoningModelFamily(config));
}

export function supportsOpenAIReasoningReplay(config: Pick<ChatConfig, 'model' | 'apiUrl'>): boolean {
  return inferReasoningModelFamily(config) === 'deepseek';
}

function inferReasoningModelFamily(config: Pick<ChatConfig, 'model' | 'apiUrl'>): ReasoningModelFamily | undefined {
  const text = `${config.model || ''} ${config.apiUrl || ''}`.toLowerCase();
  if (/\bgpt-5\.6-(terra|sol|luna)\b/.test(text)) return 'gpt56';
  if (text.includes('deepseek')) return 'deepseek';
  if (/\bglm\b|glm-/.test(text)) return 'glm';
  return undefined;
}
