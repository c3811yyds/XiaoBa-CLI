import { afterEach, beforeEach, describe, test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  hasRuntimeProfileRollback,
  previewRuntimeProfileEdit,
  rollbackRuntimeProfileEdit,
  saveRuntimeProfileEdit,
} from '../src/runtime/runtime-profile-editor';

describe('RuntimeProfileEditor', () => {
  let testRoot: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaoba-runtime-profile-editor-'));
    process.chdir(testRoot);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (testRoot && fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  test('previews safe editable fields without writing the profile file', () => {
    const configPath = path.join(testRoot, 'runtime-profile.json');
    const preview = previewRuntimeProfileEdit({
      displayName: 'Editor Bot',
      workingDirectory: 'workspace',
      tools: { enabled: ['read_file', 'execute_shell'] },
      skills: { enabled: false },
    }, {
      configPath,
      runtimeRoot: testRoot,
      env: {},
    });

    assert.equal(fs.existsSync(configPath), false);
    assert.equal(preview.configPath, configPath);
    assert.equal(preview.profile.displayName, 'Editor Bot');
    assert.equal(preview.profile.workingDirectory, path.join(testRoot, 'workspace'));
    assert.deepStrictEqual(preview.profile.tools.enabled, ['read_file', 'execute_shell']);
    assert.equal(preview.profile.skills.enabled, false);
    assert.deepStrictEqual(preview.diff.map(item => item.path), [
      'displayName',
      'workingDirectory',
      'tools.enabled',
      'skills.enabled',
    ]);
  });

  test('reports invalid tool names before save', () => {
    const preview = previewRuntimeProfileEdit({
      tools: { enabled: ['read_file', 'missing_tool'] },
    }, {
      configPath: path.join(testRoot, 'runtime-profile.json'),
      runtimeRoot: testRoot,
      env: {},
    });

    assert.equal(preview.validation.valid, false);
    assert.deepStrictEqual(preview.validation.issues, [{
      path: 'tools.enabled[1]',
      message: 'Unknown runtime tool: missing_tool',
      value: 'missing_tool',
    }]);
    assert.throws(
      () => saveRuntimeProfileEdit({
        tools: { enabled: ['read_file', 'missing_tool'] },
      }, {
        configPath: path.join(testRoot, 'runtime-profile.json'),
        runtimeRoot: testRoot,
        env: {},
      }),
      /Invalid runtime profile/,
    );
  });

  test('save writes a schema file and rollback restores the previous file', () => {
    const configPath = path.join(testRoot, 'runtime-profile.json');
    fs.writeFileSync(configPath, JSON.stringify({
      schemaVersion: 1,
      profile: {
        displayName: 'Before Bot',
        tools: { enabled: ['read_file'] },
      },
    }), 'utf-8');

    const saved = saveRuntimeProfileEdit({
      displayName: 'After Bot',
      tools: { enabled: ['read_file', 'execute_shell'] },
    }, {
      configPath,
      runtimeRoot: testRoot,
      env: {},
    });

    assert.equal(saved.ok, true);
    assert.equal(hasRuntimeProfileRollback({ configPath }), true);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(configPath, 'utf-8')), {
      schemaVersion: 1,
      profile: {
        displayName: 'After Bot',
        tools: { enabled: ['read_file', 'execute_shell'] },
      },
    });

    const rollback = rollbackRuntimeProfileEdit({ configPath });

    assert.deepStrictEqual(rollback, {
      ok: true,
      restored: true,
      deleted: false,
      configPath,
    });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(configPath, 'utf-8')), {
      schemaVersion: 1,
      profile: {
        displayName: 'Before Bot',
        tools: { enabled: ['read_file'] },
      },
    });
    assert.equal(hasRuntimeProfileRollback({ configPath }), false);
  });

  test('save refuses existing profile files with non-editable or secret fields', () => {
    const configPath = path.join(testRoot, 'runtime-profile.json');
    fs.writeFileSync(configPath, JSON.stringify({
      schemaVersion: 1,
      profile: {
        displayName: 'Unsafe Bot',
        surface: 'catscompany',
        tools: {
          enabled: ['read_file'],
          apiKey: 'tool-secret',
        },
        skills: {
          enabled: true,
          secret: 'skill-secret',
        },
        model: {
          apiUrl: 'https://user:pass@example.test/v1?token=secret',
          apiKey: 'secret-key',
        },
      },
      secretOutsideProfile: 'top-level-secret',
    }), 'utf-8');

    assert.throws(
      () => saveRuntimeProfileEdit({
        displayName: 'Safe Bot',
      }, {
        configPath,
        runtimeRoot: testRoot,
        env: {},
      }),
      /Runtime profile contains invalid or unsafe config: profile\.model\.apiKey/,
    );
    assert.equal(fs.existsSync(`${configPath}.rollback.json`), false);
    assert.equal(fs.readFileSync(configPath, 'utf-8').includes('secret-key'), true);
    assert.equal(fs.readFileSync(configPath, 'utf-8').includes('tool-secret'), true);
    assert.equal(fs.readFileSync(configPath, 'utf-8').includes('top-level-secret'), true);
  });

  test('save strips non-editable fields from the draft even during preview', () => {
    const configPath = path.join(testRoot, 'runtime-profile.json');
    fs.writeFileSync(configPath, JSON.stringify({
      schemaVersion: 1,
      profile: {
        displayName: 'Before Bot',
        surface: 'catscompany',
        logging: { uploadEnabled: true },
        tools: { enabled: ['read_file'] },
      },
    }), 'utf-8');

    const preview = previewRuntimeProfileEdit({
      displayName: 'After Bot',
    }, {
      configPath,
      runtimeRoot: testRoot,
      env: {},
    });

    assert.deepStrictEqual(preview.draft, {
      schemaVersion: 1,
      profile: {
        displayName: 'After Bot',
        tools: { enabled: ['read_file'] },
      },
    });
  });

  test('save refuses malformed editable fields before writing rollback state', () => {
    const configPath = path.join(testRoot, 'runtime-profile.json');
    fs.writeFileSync(configPath, JSON.stringify({
      schemaVersion: 1,
      profile: {
        displayName: { apiKey: 'secret-in-display-name' },
        tools: {
          enabled: [{ apiKey: 'secret-in-tool-list' }],
        },
      },
    }), 'utf-8');

    assert.throws(
      () => saveRuntimeProfileEdit({
        workingDirectory: 'workspace',
      }, {
        configPath,
        runtimeRoot: testRoot,
        env: {},
      }),
      /Runtime profile contains invalid or unsafe config: profile\.displayName, profile\.tools\.enabled\[0\]/,
    );
    assert.equal(fs.existsSync(`${configPath}.rollback.json`), false);
    assert.equal(fs.readFileSync(configPath, 'utf-8').includes('secret-in-display-name'), true);
    assert.equal(fs.readFileSync(configPath, 'utf-8').includes('secret-in-tool-list'), true);
  });

  test('rollback removes a newly-created profile file', () => {
    const configPath = path.join(testRoot, 'profiles', 'runtime-profile.json');

    saveRuntimeProfileEdit({
      displayName: 'Created Bot',
    }, {
      configPath,
      runtimeRoot: testRoot,
      env: {},
    });

    assert.equal(fs.existsSync(configPath), true);

    const rollback = rollbackRuntimeProfileEdit({ configPath });

    assert.deepStrictEqual(rollback, {
      ok: true,
      restored: false,
      deleted: true,
      configPath,
    });
    assert.equal(fs.existsSync(configPath), false);
  });
});
