import { afterEach, beforeEach, describe, test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import axios from 'axios';
import { LogUploader } from '../src/utils/log-uploader';

describe('LogUploader', () => {
  let testRoot: string;
  let logsDir: string;
  let originalPost: typeof axios.post;

  beforeEach(() => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaoba-log-uploader-'));
    logsDir = path.join(testRoot, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    originalPost = axios.post;
  });

  afterEach(() => {
    (axios as any).post = originalPost;
    if (testRoot && fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  test('uses session_id from log content instead of filename', async () => {
    const date = '2026-04-30';
    const platform = 'chat';
    const filename = 'chat_user_ou_demo.jsonl';
    const fileDir = path.join(logsDir, 'sessions', platform, date);
    fs.mkdirSync(fileDir, { recursive: true });

    const entries = [
      {
        entry_type: 'runtime',
        timestamp: '2026-04-30T08:00:00.000Z',
        session_id: 'user:ou_demo',
        session_type: platform,
        level: 'INFO',
        message: 'runtime entry',
      },
      {
        entry_type: 'turn',
        turn: 1,
        timestamp: '2026-04-30T08:01:00.000Z',
        session_id: 'user:ou_demo',
        session_type: platform,
        user: { text: 'hello' },
        assistant: { text: 'world', tool_calls: [] },
        tokens: { prompt: 1, completion: 1 },
      },
    ];
    fs.writeFileSync(
      path.join(fileDir, filename),
      entries.map(entry => JSON.stringify(entry)).join('\n') + '\n',
    );

    const requests: Array<{ url: string; payload: any }> = [];
    (axios as any).post = async (url: string, payload: any) => {
      requests.push({ url, payload });
      return { data: { success: true } };
    };

    const uploader = new LogUploader('https://example.com', logsDir);
    const uploaded = await (uploader as any).uploadFile(platform, date, filename);

    assert.equal(uploaded, 2);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].payload.session_id, 'user:ou_demo');
    assert.equal(requests[0].payload.agent_id, 'user:ou_demo');

    const state = JSON.parse(fs.readFileSync(path.join(logsDir, '.upload-state.json'), 'utf-8'));
    assert.equal(state['chat/2026-04-30/user:ou_demo'].uploadedTurns, 2);
  });

  test('migrates upload state from legacy filename-derived keys', async () => {
    const date = '2026-04-30';
    const platform = 'chat';
    const filename = 'chat_user_ou_demo.jsonl';
    const fileDir = path.join(logsDir, 'sessions', platform, date);
    fs.mkdirSync(fileDir, { recursive: true });

    const entries = [
      {
        entry_type: 'turn',
        turn: 1,
        timestamp: '2026-04-30T08:01:00.000Z',
        session_id: 'user:ou_demo',
        session_type: platform,
        user: { text: 'first' },
        assistant: { text: 'one', tool_calls: [] },
        tokens: { prompt: 1, completion: 1 },
      },
      {
        entry_type: 'turn',
        turn: 2,
        timestamp: '2026-04-30T08:02:00.000Z',
        session_id: 'user:ou_demo',
        session_type: platform,
        user: { text: 'second' },
        assistant: { text: 'two', tool_calls: [] },
        tokens: { prompt: 1, completion: 1 },
      },
    ];
    fs.writeFileSync(
      path.join(fileDir, filename),
      entries.map(entry => JSON.stringify(entry)).join('\n') + '\n',
    );
    fs.writeFileSync(
      path.join(logsDir, '.upload-state.json'),
      JSON.stringify({
        'chat/2026-04-30/chat_user_ou_demo': {
          lastUploadTime: '2026-04-30T08:10:00.000Z',
          uploadedTurns: 1,
        },
      }),
    );

    const requests: Array<{ url: string; payload: any }> = [];
    (axios as any).post = async (url: string, payload: any) => {
      requests.push({ url, payload });
      return { data: { success: true } };
    };

    const uploader = new LogUploader('https://example.com', logsDir);
    const uploaded = await (uploader as any).uploadFile(platform, date, filename);

    assert.equal(uploaded, 1);
    assert.equal(requests.length, 1);
    assert.deepStrictEqual(requests[0].payload.logs, [entries[1]]);

    const state = JSON.parse(fs.readFileSync(path.join(logsDir, '.upload-state.json'), 'utf-8'));
    assert.equal(state['chat/2026-04-30/user:ou_demo'].uploadedTurns, 2);
    assert.equal(state['chat/2026-04-30/chat_user_ou_demo'], undefined);
  });
});
