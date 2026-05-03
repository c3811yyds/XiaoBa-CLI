#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const legacyTests = [
  'tests/coo-message-integration.test.ts',
  'tests/coo-prompt-and-data.test.ts',
  'tests/coo-scenario.test.ts',
  'tests/gauzmem-speaker-identity.test.ts',
  'tests/reminder-scheduler.test.ts',
].sort();

const args = process.argv.slice(2);
const suite = args.find(arg => !arg.startsWith('--')) || 'runtime';
const listOnly = args.includes('--list');

const allTests = (await glob('tests/**/*.test.ts', {
  cwd: rootDir,
  nodir: true,
})).map(normalizeTestPath).sort();

const legacySet = new Set(legacyTests);
const runtimeTests = allTests.filter(file => !legacySet.has(file));

const suites = {
  runtime: runtimeTests,
  legacy: legacyTests,
  all: allTests,
};

if (!Object.hasOwn(suites, suite)) {
  console.error(`Unknown test suite "${suite}". Expected one of: ${Object.keys(suites).join(', ')}`);
  process.exit(1);
}

const missingLegacyTests = legacyTests.filter(file => !fs.existsSync(path.join(rootDir, file)));
if (missingLegacyTests.length > 0) {
  console.error('Legacy test suite references missing files. Update scripts/run-tests.mjs:');
  for (const file of missingLegacyTests) console.error(`- ${file}`);
  process.exit(1);
}

const selectedTests = suites[suite];
console.log(`[test] suite=${suite} files=${selectedTests.length}`);

if (listOnly) {
  for (const file of selectedTests) console.log(file);
  process.exit(0);
}

if (selectedTests.length === 0) {
  console.log(`[test] suite=${suite} has no files`);
  process.exit(0);
}

const tsxCli = require.resolve('tsx/cli');
const child = spawn(process.execPath, [tsxCli, '--test', ...selectedTests], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[test] terminated by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});

child.on('error', error => {
  console.error(`[test] failed to start: ${error.message}`);
  process.exit(1);
});

function normalizeTestPath(file) {
  return file.replace(/\\/g, '/');
}
