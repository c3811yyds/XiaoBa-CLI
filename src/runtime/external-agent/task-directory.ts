import * as fs from 'fs';
import * as path from 'path';
import { TaskPacket } from './types';

const DEFAULT_EXTERNAL_AGENT_DIR = '.xiaoba/external-agents';

export function resolveExternalAgentTaskDirectory(task: TaskPacket): string {
  if (task.workingDirectory) {
    return path.resolve(task.workingDirectory);
  }

  return path.resolve(
    task.repositoryRoot,
    DEFAULT_EXTERNAL_AGENT_DIR,
    sanitizeTaskId(task.id),
  );
}

export function ensureExternalAgentTaskDirectory(task: TaskPacket): string {
  const taskDirectory = resolveExternalAgentTaskDirectory(task);
  fs.mkdirSync(taskDirectory, { recursive: true });
  return taskDirectory;
}

export function serializeTaskPacket(task: TaskPacket): string {
  return JSON.stringify({
    id: task.id,
    goal: task.goal,
    repositoryRoot: path.resolve(task.repositoryRoot),
    workingDirectory: resolveExternalAgentTaskDirectory(task),
    instructions: task.instructions,
    expectedOutputs: task.expectedOutputs ?? [],
    requiredTests: task.requiredTests ?? [],
    metadata: task.metadata ?? {},
  }, null, 2);
}

function sanitizeTaskId(taskId: string): string {
  const safe = taskId
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return safe || 'task';
}
