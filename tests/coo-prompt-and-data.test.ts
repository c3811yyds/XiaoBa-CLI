import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

// ─── System Prompt COO 身份测试 ───

test('system-prompt.md defines COO identity', () => {
  const content = fs.readFileSync(path.join(__dirname, '../prompts/system-prompt.md'), 'utf-8');
  assert.ok(content.includes('COO'), 'Should define COO role');
  assert.ok(content.includes('使命'), 'Should have mission section');
  assert.ok(content.includes('不可自行修改'), 'Mission should be immutable');
});

test('system-prompt.md has self-evolution rules', () => {
  const content = fs.readFileSync(path.join(__dirname, '../prompts/system-prompt.md'), 'utf-8');
  assert.ok(content.includes('自演化'), 'Should have self-evolution section');
  assert.ok(content.includes('SKILL.md'), 'Should reference SKILL.md as editable');
});

test('system-prompt.md has core principles', () => {
  const content = fs.readFileSync(path.join(__dirname, '../prompts/system-prompt.md'), 'utf-8');
  assert.ok(content.includes('不阻塞'), 'Should have non-blocking principle');
  assert.ok(content.includes('数据驱动'), 'Should have data-driven principle');
  assert.ok(content.includes('最小干预'), 'Should have minimal intervention');
  assert.ok(content.includes('透明'), 'Should have transparency principle');
});

test('system-prompt.md references COO data files', () => {
  const content = fs.readFileSync(path.join(__dirname, '../prompts/system-prompt.md'), 'utf-8');
  assert.ok(content.includes('task_pool.json'), 'Should reference task_pool');
  assert.ok(content.includes('members.json'), 'Should reference members');
  assert.ok(content.includes('reminders.json'), 'Should reference reminders');
});

test('system-prompt.md has information flow mission', () => {
  const content = fs.readFileSync(path.join(__dirname, '../prompts/system-prompt.md'), 'utf-8');
  assert.ok(content.includes('信息流动'), 'Should mention information flow');
  assert.ok(content.includes('交叉比对'), 'Should mention cross-comparison');
  assert.ok(content.includes('决策提炼'), 'Should mention decision extraction');
});

// ─── PromptManager COO 构建测试 ───

test('PromptManager.buildSystemPrompt produces COO prompt', async () => {
  const { PromptManager } = require('../src/utils/prompt-manager');
  const prompt = await PromptManager.buildSystemPrompt([]);
  assert.ok(prompt.includes('COO'), 'Built prompt should contain COO');
  assert.ok(prompt.includes('使命'), 'Built prompt should contain mission');
});

test('PromptManager.buildSystemPrompt replaces placeholders', async () => {
  const { PromptManager } = require('../src/utils/prompt-manager');
  const prompt = await PromptManager.buildSystemPrompt([]);
  // Should not contain raw placeholders
  assert.ok(!prompt.includes('{{agent_name}}'), 'Should replace agent_name placeholder');
  assert.ok(!prompt.includes('{{user_name}}'), 'Should replace user_name placeholder');
});

test('PromptManager default fallback is COO', () => {
  const { PromptManager } = require('../src/utils/prompt-manager');
  // Access private method via prototype trick
  const fallback = (PromptManager as any).getDefaultSystemPrompt();
  assert.ok(fallback.includes('COO'), 'Default fallback should be COO');
  assert.ok(fallback.includes('信息流动'), 'Default should mention information flow');
});

test('PromptManager includes environment info', async () => {
  const { PromptManager } = require('../src/utils/prompt-manager');
  const prompt = await PromptManager.buildSystemPrompt([]);
  assert.ok(prompt.includes('当前日期'), 'Should include current date');
});

// ─── COO SKILL.md 操作手册测试 ───

test('SKILL.md is operational manual format', () => {
  const content = fs.readFileSync(path.join(__dirname, '../skills/coo/SKILL.md'), 'utf-8');
  assert.ok(content.includes('操作手册'), 'Should be titled as operational manual');
  assert.ok(content.includes('可根据实际需要修改'), 'Should state it is self-modifiable');
  assert.ok(!content.includes('invocable:'), 'Should not have YAML frontmatter');
});

test('SKILL.md has cross-comparison logic', () => {
  const content = fs.readFileSync(path.join(__dirname, '../skills/coo/SKILL.md'), 'utf-8');
  assert.ok(content.includes('交叉比对'), 'Should have cross-comparison section');
  assert.ok(content.includes('方向冲突'), 'Should detect direction conflicts');
  assert.ok(content.includes('可复用机会'), 'Should detect reuse opportunities');
});

test('SKILL.md data structures are marked as evolvable', () => {
  const content = fs.readFileSync(path.join(__dirname, '../skills/coo/SKILL.md'), 'utf-8');
  assert.ok(content.includes('可演化'), 'Task structure should be marked evolvable');
  assert.ok(content.includes('可根据实际需要扩展'), 'Data files should be extensible');
});

// ─── MISSION.md 测试 ───

test('MISSION.md exists and defines core purpose', () => {
  const content = fs.readFileSync(path.join(__dirname, '../skills/coo/MISSION.md'), 'utf-8');
  assert.ok(content.includes('信息流动'), 'Should define information flow as core');
  assert.ok(content.includes('决策归人'), 'Should state decisions belong to humans');
});

// ─── COO 数据文件测试 ───

test('members.json has CEO initialized', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../skills/coo/data/members.json'), 'utf-8'));
  assert.ok(data.members.length > 0, 'Should have at least one member');
  assert.equal(data.members[0].role, 'CEO', 'First member should be CEO');
});

test('task_pool.json has valid structure', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../skills/coo/data/task_pool.json'), 'utf-8'));
  assert.ok(Array.isArray(data.tasks), 'Should have tasks array');
  assert.ok(typeof data.next_id === 'number', 'Should have next_id');
});

test('reminders.json has valid structure', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../skills/coo/data/reminders.json'), 'utf-8'));
  assert.ok(Array.isArray(data.reminders), 'Should have reminders array');
  assert.ok(typeof data.next_id === 'number', 'Should have next_id');
});

console.log('All COO prompt & data tests passed!');
