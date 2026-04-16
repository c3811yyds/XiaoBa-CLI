import { describe, test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  loadRuntimeManifest,
  normalizeArch,
  normalizePlatform,
  resolveExtractedRoot,
  resolveRuntimeTarget,
  resolveRuntimeTargetKey,
  validateRuntimeManifest,
} from '../scripts/prepare-runtime.mjs';

describe('runtime manifest resolution', () => {
  test('normalizes platform and arch aliases', () => {
    assert.strictEqual(normalizePlatform('macos'), 'darwin');
    assert.strictEqual(normalizePlatform('windows'), 'win32');
    assert.strictEqual(normalizeArch('x86_64'), 'x64');
    assert.strictEqual(normalizeArch('aarch64'), 'arm64');
  });

  test('resolves runtime target keys from normalized values', () => {
    assert.strictEqual(resolveRuntimeTargetKey('darwin', 'aarch64'), 'darwin-arm64');
    assert.strictEqual(resolveRuntimeTargetKey('windows', 'x86_64'), 'win32-x64');
  });

  test('loads node and python targets from the manifest', () => {
    const manifest = loadRuntimeManifest();
    const nodeTarget = resolveRuntimeTarget(manifest, 'node', 'darwin', 'arm64');
    const pythonTarget = resolveRuntimeTarget(manifest, 'python', 'linux', 'x64');

    assert.strictEqual(nodeTarget.archiveType, 'tar.xz');
    assert.strictEqual(nodeTarget.targetSubdir, 'node');
    assert.ok(nodeTarget.sources.length >= 2);
    assert.ok(nodeTarget.sources[0].url.includes('node-v20.12.2-darwin-arm64'));

    assert.strictEqual(pythonTarget.archiveType, 'tar.gz');
    assert.strictEqual(pythonTarget.targetSubdir, 'python');
    assert.ok(pythonTarget.sources.length >= 2);
    assert.ok(pythonTarget.sources[0].url.includes('cpython-3.12.7%2B20241016-x86_64-unknown-linux-gnu'));
  });
});

describe('runtime manifest safety checks', () => {
  test('accepts the checked-in manifest', () => {
    const manifest = loadRuntimeManifest();
    assert.doesNotThrow(() => validateRuntimeManifest(manifest));
  });

  test('rejects an unapproved source host', () => {
    const manifest = {
      runtimes: {
        node: {
          targets: {
            'linux-x64': {
              archiveType: 'tar.xz',
              sources: [
                {
                  url: 'https://evil.example.com/node.tar.xz',
                  sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                },
              ],
            },
          },
        },
      },
    };

    assert.throws(
      () => validateRuntimeManifest(manifest),
      /Unapproved host/,
    );
  });

  test('rejects a source without a valid sha256', () => {
    const manifest = {
      runtimes: {
        node: {
          targets: {
            'linux-x64': {
              archiveType: 'tar.xz',
              sources: [
                {
                  url: 'https://nodejs.org/dist/v20.12.2/node-v20.12.2-linux-x64.tar.xz',
                  sha256: 'short',
                },
              ],
            },
          },
        },
      },
    };

    assert.throws(
      () => validateRuntimeManifest(manifest),
      /invalid sha256/,
    );
  });
});

describe('resolveExtractedRoot', () => {
  test('uses the single extracted directory by default', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaoba-extract-root-'));
    try {
      const nested = path.join(root, 'bundle');
      fs.mkdirSync(nested, { recursive: true });
      fs.writeFileSync(path.join(nested, 'marker.txt'), 'ok');
      assert.strictEqual(resolveExtractedRoot(root), nested);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('honors an explicit packageRoot when provided', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaoba-extract-root-'));
    try {
      const nested = path.join(root, 'python', 'bin');
      fs.mkdirSync(nested, { recursive: true });
      fs.writeFileSync(path.join(nested, 'python3'), '');
      assert.strictEqual(resolveExtractedRoot(root, 'python'), path.join(root, 'python'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
