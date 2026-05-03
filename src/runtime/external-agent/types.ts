export type ExternalAgentKind = 'codex' | 'claude-code' | 'opencode' | 'custom';

export interface TaskPacket {
  id: string;
  goal: string;
  repositoryRoot: string;
  instructions?: string;
  workingDirectory?: string;
  expectedOutputs?: string[];
  requiredTests?: string[];
  metadata?: Record<string, unknown>;
}

export interface ExternalAgentReview {
  diffSummary?: string;
  tests?: string[];
  risks?: string[];
}

export interface ExternalAgentResult {
  taskId: string;
  agentId: string;
  ok: boolean;
  startedAt: string;
  completedAt: string;
  workingDirectory: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  summary: string;
  review?: ExternalAgentReview;
}

export interface ExternalAgentDescriptor {
  id: string;
  kind: ExternalAgentKind;
  displayName: string;
  enabled: boolean;
  capabilities: string[];
}

export interface ExternalAgentRunOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ExternalAgentControl extends ExternalAgentDescriptor {
  runTask(task: TaskPacket, options?: ExternalAgentRunOptions): Promise<ExternalAgentResult>;
  cancel?(taskId: string): Promise<void>;
}
