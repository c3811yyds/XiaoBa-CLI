import { afterEach, beforeEach, describe, test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getCatsAuthState } from '../src/dashboard/routes/api';

describe('Dashboard CatsCo env resolution', () => {
  let testRoot: string;
  let originalCwd: string;
  const envKeys = [
    'CATSCO_SERVER_URL',
    'CATSCO_HTTP_BASE_URL',
    'CATSCO_API_KEY',
    'CATSCO_USER_TOKEN',
    'CATSCO_USER_UID',
    'CATSCOMPANY_SERVER_URL',
    'CATSCOMPANY_HTTP_BASE_URL',
    'CATSCOMPANY_API_KEY',
    'CATSCOMPANY_USER_TOKEN',
    'CATSCOMPANY_USER_UID',
  ];
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    originalCwd = process.cwd();
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaoba-dashboard-catsco-env-'));
    process.chdir(testRoot);

    for (const key of envKeys) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.chdir(originalCwd);
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
    if (testRoot && fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  test('uses exported CATSCO aliases before legacy values in .env', () => {
    fs.writeFileSync(path.join(testRoot, '.env'), [
      'CATSCOMPANY_SERVER_URL=wss://legacy-file.example/v0/channels',
      'CATSCOMPANY_HTTP_BASE_URL=https://legacy-file.example',
      'CATSCOMPANY_API_KEY=legacy-file-key',
      'CATSCOMPANY_USER_TOKEN=legacy-file-token',
      'CATSCOMPANY_USER_UID=100',
      '',
    ].join('\n'));

    process.env.CATSCO_SERVER_URL = 'wss://catsco-process.example/v0/channels';
    process.env.CATSCO_HTTP_BASE_URL = 'https://catsco-process.example';
    process.env.CATSCO_API_KEY = 'catsco-process-key';
    process.env.CATSCO_USER_TOKEN = 'catsco-process-token';
    process.env.CATSCO_USER_UID = '200';

    const state = getCatsAuthState();

    assert.equal(state.serverUrl, 'wss://catsco-process.example/v0/channels');
    assert.equal(state.httpBaseUrl, 'https://catsco-process.example');
    assert.equal(state.apiKey, 'catsco-process-key');
    assert.equal(state.token, 'catsco-process-token');
    assert.equal(state.uid, '200');
  });

  test('falls back to legacy .env values when CATSCO aliases are absent', () => {
    fs.writeFileSync(path.join(testRoot, '.env'), [
      'CATSCOMPANY_SERVER_URL=wss://legacy-file.example/v0/channels',
      'CATSCOMPANY_HTTP_BASE_URL=https://legacy-file.example',
      'CATSCOMPANY_API_KEY=legacy-file-key',
      'CATSCOMPANY_USER_TOKEN=legacy-file-token',
      '',
    ].join('\n'));

    const state = getCatsAuthState();

    assert.equal(state.serverUrl, 'wss://legacy-file.example/v0/channels');
    assert.equal(state.httpBaseUrl, 'https://legacy-file.example');
    assert.equal(state.apiKey, 'legacy-file-key');
    assert.equal(state.token, 'legacy-file-token');
  });
});
