import type { CatsCoAuthSnapshot } from '../catscompany/local-config';
import { normalizeReasoningEffort } from '../utils/reasoning-effort';
import type { ReasoningEffort } from '../types';

const CLOUD_MODEL_REQUEST_TIMEOUT_MS = 10_000;

export interface CloudBotModelSelection {
  modelId: string;
  reasoningEffort?: ReasoningEffort;
  revision: number;
}

export interface CloudBotModelClientOptions {
  botId: string;
  auth: CatsCoAuthSnapshot;
  fetchImpl?: typeof fetch;
}

export async function pullCloudBotModelSelection(
  options: CloudBotModelClientOptions,
): Promise<CloudBotModelSelection | undefined> {
  const response = await cloudModelRequest(options, 'GET', '/api/bot/model-config');
  if (response === undefined) return undefined;
  if (response?.configured !== true) return undefined;
  const responseBotId = String(response?.uid ?? '').trim();
  const modelId = String(response?.desired?.model_id || '').trim();
  const revision = Number(response?.desired?.revision);
  const rawReasoning = String(response?.desired?.reasoning_effort || '').trim();
  const reasoningEffort = rawReasoning ? normalizeReasoningEffort(rawReasoning) : undefined;
  if (responseBotId !== String(options.botId).trim() || !modelId || !Number.isInteger(revision) || revision < 0) {
    throw new Error('CatsCo cloud returned an invalid bot model configuration.');
  }
  if (rawReasoning && !reasoningEffort) {
    throw new Error(`CatsCo cloud returned an unsupported reasoning effort: ${rawReasoning}`);
  }
  return { modelId, revision, ...(reasoningEffort ? { reasoningEffort } : {}) };
}

export async function acknowledgeCloudBotModelSelection(
  options: CloudBotModelClientOptions,
  selection: CloudBotModelSelection,
  applyError = '',
): Promise<void> {
  await cloudModelRequest(options, 'POST', '/api/bot/model-config/ack', {
    revision: selection.revision,
    model_id: selection.modelId,
    reasoning_effort: selection.reasoningEffort || '',
    ...(applyError ? { error: applyError } : {}),
  });
}

async function cloudModelRequest(
  options: CloudBotModelClientOptions,
  method: string,
  apiPath: string,
  body?: unknown,
): Promise<any | undefined> {
  const apiKey = String(options.auth.apiKey || '').trim();
  const httpBaseUrl = String(options.auth.httpBaseUrl || '').trim().replace(/\/+$/, '');
  if (!apiKey || !httpBaseUrl) return undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLOUD_MODEL_REQUEST_TIMEOUT_MS);
  try {
    const response = await (options.fetchImpl ?? fetch)(`${httpBaseUrl}${apiPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ApiKey ${apiKey}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if ([404, 405, 501].includes(response.status)) return undefined;
    const text = await response.text();
    let data: any = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }
    if (!response.ok) {
      throw new Error(String(data?.error || data?.message || `CatsCo cloud model request failed: ${response.status}`));
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}
