import {
  ExternalAgentControl,
  ExternalAgentKind,
  ExternalAgentResult,
  ExternalAgentRunOptions,
  TaskPacket,
} from './types';
import { ensureExternalAgentTaskDirectory, serializeTaskPacket } from './task-directory';
import { ProcessRunner } from './process-runner';

export interface CodingAgentAdapterOptions {
  id: string;
  kind: ExternalAgentKind;
  displayName: string;
  command: string;
  args?: string[];
  enabled?: boolean;
  capabilities?: string[];
  timeoutMs?: number;
  runner?: ProcessRunner;
}

export class CodingAgentAdapter implements ExternalAgentControl {
  readonly id: string;
  readonly kind: ExternalAgentKind;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly capabilities: string[];

  private readonly command: string;
  private readonly args: string[];
  private readonly timeoutMs?: number;
  private readonly runner: ProcessRunner;

  constructor(options: CodingAgentAdapterOptions) {
    this.id = options.id;
    this.kind = options.kind;
    this.displayName = options.displayName;
    this.enabled = options.enabled ?? true;
    this.capabilities = options.capabilities ?? ['coding-task'];
    this.command = options.command;
    this.args = options.args ?? [];
    this.timeoutMs = options.timeoutMs;
    this.runner = options.runner ?? new ProcessRunner();
  }

  async runTask(
    task: TaskPacket,
    options: ExternalAgentRunOptions = {},
  ): Promise<ExternalAgentResult> {
    if (!this.enabled) {
      throw new Error(`External agent "${this.id}" is disabled`);
    }

    const startedAt = new Date();
    const workingDirectory = ensureExternalAgentTaskDirectory(task);
    const result = await this.runner.run({
      id: task.id,
      command: this.command,
      args: this.args,
      cwd: workingDirectory,
      input: serializeTaskPacket(task),
      timeoutMs: options.timeoutMs ?? this.timeoutMs,
      signal: options.signal,
    });
    const ok = result.exitCode === 0 && !result.timedOut;

    return {
      taskId: task.id,
      agentId: this.id,
      ok,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      workingDirectory,
      exitCode: result.exitCode,
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr,
      summary: summarizeProcessResult(result.stdout, result.stderr, ok),
    };
  }

  async cancel(taskId: string): Promise<void> {
    await this.runner.cancel(taskId);
  }
}

function summarizeProcessResult(stdout: string, stderr: string, ok: boolean): string {
  const text = (stdout || stderr || '').trim();
  if (!text) return ok ? 'External agent finished without output.' : 'External agent failed without output.';
  return text.split('\n').slice(0, 8).join('\n');
}
