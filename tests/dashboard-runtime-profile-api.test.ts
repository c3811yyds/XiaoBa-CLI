import { afterEach, beforeEach, describe, test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import type { Server } from 'http';
import { createApiRouter } from '../src/dashboard/routes/api';

describe('dashboard runtime profile API', () => {
  let testRoot: string;
  let originalCwd: string;
  let originalProfilePath: string | undefined;
  let server: Server | undefined;
  let baseUrl: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalProfilePath = process.env.XIAOBA_RUNTIME_PROFILE_PATH;
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaoba-dashboard-profile-api-'));
    process.chdir(testRoot);
    process.env.XIAOBA_RUNTIME_PROFILE_PATH = path.join(testRoot, 'profiles', 'runtime-profile.json');

    const app = express();
    app.use(express.json());
    app.use('/api', createApiRouter({ getAll: () => [] } as any));
    server = await listen(app);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server did not bind to a TCP port');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>(resolve => server!.close(() => resolve()));
      server = undefined;
    }
    process.chdir(originalCwd);
    if (originalProfilePath === undefined) {
      delete process.env.XIAOBA_RUNTIME_PROFILE_PATH;
    } else {
      process.env.XIAOBA_RUNTIME_PROFILE_PATH = originalProfilePath;
    }
    if (testRoot && fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  test('GET edit state is readonly and does not create profile file', async () => {
    const response = await fetch(`${baseUrl}/api/runtime/profile/edit`);
    const data = await response.json() as any;

    assert.equal(response.status, 200);
    assert.equal(data.configPath, process.env.XIAOBA_RUNTIME_PROFILE_PATH);
    assert.equal(data.config.exists, false);
    assert.equal(data.rollbackAvailable, false);
    assert.equal(fs.existsSync(process.env.XIAOBA_RUNTIME_PROFILE_PATH!), false);
  });

  test('preview returns diff and validation without writing profile file', async () => {
    const response = await fetch(`${baseUrl}/api/runtime/profile/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Preview Bot',
        tools: { enabled: ['read_file', 'missing_tool'] },
      }),
    });
    const data = await response.json() as any;

    assert.equal(response.status, 200);
    assert.equal(data.profile.displayName, 'Preview Bot');
    assert.equal(data.validation.valid, false);
    assert.equal(data.validation.issues[0].path, 'tools.enabled[1]');
    assert.equal(data.diff.some((item: any) => item.path === 'displayName'), true);
    assert.equal(fs.existsSync(process.env.XIAOBA_RUNTIME_PROFILE_PATH!), false);
  });

  test('save writes profile file and rollback restores prior state', async () => {
    const saveResponse = await fetch(`${baseUrl}/api/runtime/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Saved Bot',
        workingDirectory: 'workspace',
        tools: { enabled: ['read_file', 'execute_shell'] },
        skills: { enabled: false },
      }),
    });
    const saveData = await saveResponse.json() as any;

    assert.equal(saveResponse.status, 200);
    assert.equal(saveData.ok, true);
    assert.equal(saveData.profile.displayName, 'Saved Bot');
    assert.equal(saveData.rollbackAvailable, true);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(process.env.XIAOBA_RUNTIME_PROFILE_PATH!, 'utf-8')), {
      schemaVersion: 1,
      profile: {
        displayName: 'Saved Bot',
        workingDirectory: 'workspace',
        tools: { enabled: ['read_file', 'execute_shell'] },
        skills: { enabled: false },
      },
    });

    const rollbackResponse = await fetch(`${baseUrl}/api/runtime/profile/rollback`, {
      method: 'POST',
    });
    const rollbackData = await rollbackResponse.json() as any;

    assert.equal(rollbackResponse.status, 200);
    assert.equal(rollbackData.ok, true);
    assert.equal(rollbackData.deleted, true);
    assert.equal(fs.existsSync(process.env.XIAOBA_RUNTIME_PROFILE_PATH!), false);
  });

  test('profile edit responses do not leak URL credentials', async () => {
    fs.mkdirSync(path.dirname(process.env.XIAOBA_RUNTIME_PROFILE_PATH!), { recursive: true });
    fs.writeFileSync(process.env.XIAOBA_RUNTIME_PROFILE_PATH!, JSON.stringify({
      schemaVersion: 1,
      profile: {
        model: {
          apiUrl: 'https://user:pass@profile.example.test/v1?token=secret',
          model: 'profile-model',
        },
      },
    }), 'utf-8');

    const response = await fetch(`${baseUrl}/api/runtime/profile/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'No Leak Bot' }),
    });
    const text = await response.text();
    const data = JSON.parse(text);

    assert.equal(response.status, 200);
    assert.equal(data.profile.model.apiUrl, undefined);
    assert.equal(data.draft.profile.model, undefined);
    assert.equal(text.includes('user:pass'), false);
    assert.equal(text.includes('token=secret'), false);
  });

  test('save refuses unsafe existing profile fields without writing rollback secrets', async () => {
    fs.mkdirSync(path.dirname(process.env.XIAOBA_RUNTIME_PROFILE_PATH!), { recursive: true });
    fs.writeFileSync(process.env.XIAOBA_RUNTIME_PROFILE_PATH!, JSON.stringify({
      schemaVersion: 1,
      profile: {
        displayName: 'Unsafe Bot',
        surface: 'catscompany',
        tools: {
          enabled: ['read_file'],
          token: 'tool-token',
        },
        model: {
          apiUrl: 'https://user:pass@profile.example.test/v1?token=secret',
          apiKey: 'secret-key',
        },
      },
      topLevelSecret: 'top-level-secret',
    }), 'utf-8');

    const response = await fetch(`${baseUrl}/api/runtime/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Safe Bot' }),
    });
    const data = await response.json() as any;

    assert.equal(response.status, 400);
    assert.match(data.error, /Runtime profile contains invalid or unsafe config: profile\.model\.apiKey/);
    assert.equal(fs.existsSync(`${process.env.XIAOBA_RUNTIME_PROFILE_PATH}.rollback.json`), false);
    assert.equal(fs.readFileSync(process.env.XIAOBA_RUNTIME_PROFILE_PATH!, 'utf-8').includes('secret-key'), true);
    assert.equal(fs.readFileSync(process.env.XIAOBA_RUNTIME_PROFILE_PATH!, 'utf-8').includes('tool-token'), true);
    assert.equal(fs.readFileSync(process.env.XIAOBA_RUNTIME_PROFILE_PATH!, 'utf-8').includes('top-level-secret'), true);
  });

  test('save refuses malformed editable fields without writing rollback secrets', async () => {
    fs.mkdirSync(path.dirname(process.env.XIAOBA_RUNTIME_PROFILE_PATH!), { recursive: true });
    fs.writeFileSync(process.env.XIAOBA_RUNTIME_PROFILE_PATH!, JSON.stringify({
      schemaVersion: 1,
      profile: {
        displayName: { apiKey: 'secret-in-display-name' },
        tools: {
          enabled: [{ apiKey: 'secret-in-tool-list' }],
        },
      },
    }), 'utf-8');

    const response = await fetch(`${baseUrl}/api/runtime/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workingDirectory: 'workspace' }),
    });
    const data = await response.json() as any;

    assert.equal(response.status, 400);
    assert.match(data.error, /Runtime profile contains invalid or unsafe config/);
    assert.equal(fs.existsSync(`${process.env.XIAOBA_RUNTIME_PROFILE_PATH}.rollback.json`), false);
    assert.equal(fs.readFileSync(process.env.XIAOBA_RUNTIME_PROFILE_PATH!, 'utf-8').includes('secret-in-display-name'), true);
    assert.equal(fs.readFileSync(process.env.XIAOBA_RUNTIME_PROFILE_PATH!, 'utf-8').includes('secret-in-tool-list'), true);
  });
});

function listen(app: express.Express): Promise<Server> {
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}
