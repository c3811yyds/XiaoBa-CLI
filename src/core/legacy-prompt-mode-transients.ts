export const LEGACY_TRANSIENT_PROMPT_MODES_LIST_PREFIX = '[transient_prompt_modes_list]';
export const LEGACY_TRANSIENT_FIXED_PROMPT_MODE_PREFIX = '[transient_fixed_prompt_mode]';
export const LEGACY_TRANSIENT_ACTIVE_PROMPT_MODE_PREFIX = '[transient_active_prompt_mode]';

const LEGACY_PROMPT_MODE_TRANSIENT_PREFIXES = [
  LEGACY_TRANSIENT_PROMPT_MODES_LIST_PREFIX,
  LEGACY_TRANSIENT_FIXED_PROMPT_MODE_PREFIX,
  LEGACY_TRANSIENT_ACTIVE_PROMPT_MODE_PREFIX,
];

export function isLegacyPromptModeTransientContent(content: string): boolean {
  return LEGACY_PROMPT_MODE_TRANSIENT_PREFIXES.some(prefix => content.startsWith(prefix));
}
