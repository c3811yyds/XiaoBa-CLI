import { describe, test } from 'node:test';
import * as assert from 'node:assert';
import { resolveCatsCoCommandConfig } from '../src/commands/catscompany';
import { ChatConfig } from '../src/types';

describe('CatsCo command config resolution', () => {
  const baseConfig: ChatConfig = {
    catscompany: {
      serverUrl: 'wss://legacy-config.example/v0/channels',
      apiKey: 'legacy-config-key',
      httpBaseUrl: 'https://legacy-config.example',
      sessionTTL: 123,
    },
  };

  test('prefers CATSCO env aliases over legacy env and user config', () => {
    const resolved = resolveCatsCoCommandConfig(baseConfig, {
      CATSCO_SERVER_URL: 'wss://catsco.example/v0/channels',
      CATSCO_API_KEY: 'catsco-key',
      CATSCO_HTTP_BASE_URL: 'https://catsco.example',
      CATSCOMPANY_SERVER_URL: 'wss://legacy-env.example/v0/channels',
      CATSCOMPANY_API_KEY: 'legacy-env-key',
      CATSCOMPANY_HTTP_BASE_URL: 'https://legacy-env.example',
    });

    assert.deepEqual(resolved.missing, []);
    assert.equal(resolved.config?.serverUrl, 'wss://catsco.example/v0/channels');
    assert.equal(resolved.config?.apiKey, 'catsco-key');
    assert.equal(resolved.config?.httpBaseUrl, 'https://catsco.example');
    assert.equal(resolved.config?.sessionTTL, 123);
  });

  test('falls back to CATSCOMPANY env aliases', () => {
    const resolved = resolveCatsCoCommandConfig({}, {
      CATSCOMPANY_SERVER_URL: 'wss://legacy-env.example/v0/channels',
      CATSCOMPANY_API_KEY: 'legacy-env-key',
    });

    assert.deepEqual(resolved.missing, []);
    assert.equal(resolved.config?.serverUrl, 'wss://legacy-env.example/v0/channels');
    assert.equal(resolved.config?.apiKey, 'legacy-env-key');
  });

  test('falls back to legacy user config key', () => {
    const resolved = resolveCatsCoCommandConfig(baseConfig, {});

    assert.deepEqual(resolved.missing, []);
    assert.equal(resolved.config?.serverUrl, 'wss://legacy-config.example/v0/channels');
    assert.equal(resolved.config?.apiKey, 'legacy-config-key');
  });

  test('reports missing required connection values', () => {
    const resolved = resolveCatsCoCommandConfig({}, {
      CATSCO_HTTP_BASE_URL: 'https://catsco.example',
    });

    assert.deepEqual(resolved.missing, ['serverUrl', 'apiKey']);
    assert.equal(resolved.config, undefined);
  });
});
