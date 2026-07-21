export const BRANCH_AGENTS_ENABLED_ENV = 'XIAOBA_BRANCH_AGENTS_ENABLED';
export const MEMORY_SIDECAR_ENABLED_ENV = 'XIAOBA_MEMORY_SIDECAR_ENABLED';

const DISABLED_VALUES = new Set(['false', '0', 'off', 'no', 'disabled']);

export function isBranchAgentsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isLegacySwitchEnabled(env[BRANCH_AGENTS_ENABLED_ENV]);
}

/**
 * Resolve the pre-config-file switches once while migrating an existing device.
 * After branch-agents.json exists, runtime code must not consult either value.
 */
export function resolveLegacyBranchAgentsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isLegacySwitchEnabled(env[BRANCH_AGENTS_ENABLED_ENV])
    && isLegacySwitchEnabled(env[MEMORY_SIDECAR_ENABLED_ENV]);
}

export function hasLegacyBranchAgentSwitch(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[BRANCH_AGENTS_ENABLED_ENV] !== undefined
    || env[MEMORY_SIDECAR_ENABLED_ENV] !== undefined;
}

function isLegacySwitchEnabled(raw: string | undefined): boolean {
  if (!raw || !raw.trim()) return true;
  return !DISABLED_VALUES.has(raw.trim().toLowerCase());
}

export function serializeBranchAgentsEnabled(enabled: boolean): string {
  return enabled ? 'true' : 'false';
}
