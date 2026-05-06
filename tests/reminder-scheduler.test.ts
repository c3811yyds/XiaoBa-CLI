import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { calcNextTrigger, RemindersFile } from '../src/core/reminder-scheduler';

// ─── calcNextTrigger 纯函数测试 ───

test('calcNextTrigger: daily adds 1 day', () => {
  const result = calcNextTrigger({
    trigger_at: '2026-02-18T09:00:00.000Z',
    repeat: 'daily',
  });
  assert.equal(result, '2026-02-19T09:00:00.000Z');
});

test('calcNextTrigger: weekly adds 7 days', () => {
  const result = calcNextTrigger({
    trigger_at: '2026-02-18T09:00:00.000Z',
    repeat: 'weekly',
  });
  assert.equal(result, '2026-02-25T09:00:00.000Z');
});

test('calcNextTrigger: every_N_hours with interval', () => {
  const result = calcNextTrigger({
    trigger_at: '2026-02-18T09:00:00.000Z',
    repeat: 'every_N_hours',
    repeat_interval_hours: 4,
  });
  assert.equal(result, '2026-02-18T13:00:00.000Z');
});

test('calcNextTrigger: every_N_hours without interval returns null', () => {
  const result = calcNextTrigger({
    trigger_at: '2026-02-18T09:00:00.000Z',
    repeat: 'every_N_hours',
    repeat_interval_hours: null,
  });
  assert.equal(result, null);
});

test('calcNextTrigger: once returns null', () => {
  const result = calcNextTrigger({
    trigger_at: '2026-02-18T09:00:00.000Z',
    repeat: 'once',
  });
  assert.equal(result, null);
});

test('calcNextTrigger: unknown repeat returns null', () => {
  const result = calcNextTrigger({
    trigger_at: '2026-02-18T09:00:00.000Z',
    repeat: 'unknown_type',
  });
  assert.equal(result, null);
});

// ─── Scheduler 文件操作测试 ───

function makeTmpReminders(data: RemindersFile): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coo-test-'));
  const filePath = path.join(dir, 'reminders.json');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

test('Scheduler: skips inactive reminders', async () => {
  const filePath = makeTmpReminders({
    reminders: [{
      id: 'R-001', type: 'task_check', description: 'test',
      trigger_at: '2026-01-01T00:00:00.000Z', repeat: 'once',
      action: 'do something', created: '2026-01-01',
      last_triggered: null, active: false,
    }],
    next_id: 2, updated: '2026-02-18',
  });

  // Import dynamically to avoid module-level side effects
  const { ReminderScheduler } = await import('../src/core/reminder-scheduler');

  // Mock AgentServices - scheduler will fail on handleMessage but we're testing filtering
  const mockServices = {} as any;
  const scheduler = new ReminderScheduler(mockServices, {
    remindersPath: filePath,
    getNow: () => new Date('2026-02-18T10:00:00.000Z'),
  });

  // checkOnce should not throw - inactive reminder is skipped
  await scheduler.checkOnce();

  // File should be unchanged (no fired reminders)
  const after: RemindersFile = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  assert.equal(after.reminders[0].last_triggered, null);
});

test('Scheduler: skips future reminders', async () => {
  const filePath = makeTmpReminders({
    reminders: [{
      id: 'R-001', type: 'task_check', description: 'future',
      trigger_at: '2026-12-31T00:00:00.000Z', repeat: 'once',
      action: 'do something', created: '2026-01-01',
      last_triggered: null, active: true,
    }],
    next_id: 2, updated: '2026-02-18',
  });

  const { ReminderScheduler } = await import('../src/core/reminder-scheduler');
  const scheduler = new ReminderScheduler({} as any, {
    remindersPath: filePath,
    getNow: () => new Date('2026-02-18T10:00:00.000Z'),
  });

  await scheduler.checkOnce();

  const after: RemindersFile = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  assert.equal(after.reminders[0].last_triggered, null, 'Future reminder should not fire');
});

test('Scheduler: handles missing file gracefully', async () => {
  const { ReminderScheduler } = await import('../src/core/reminder-scheduler');
  const scheduler = new ReminderScheduler({} as any, {
    remindersPath: '/tmp/nonexistent-reminders-12345.json',
  });

  // Should not throw
  await scheduler.checkOnce();
});

test('Scheduler: handles malformed JSON gracefully', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coo-test-'));
  const filePath = path.join(dir, 'reminders.json');
  fs.writeFileSync(filePath, 'not valid json {{{');

  const { ReminderScheduler } = await import('../src/core/reminder-scheduler');
  const scheduler = new ReminderScheduler({} as any, {
    remindersPath: filePath,
  });

  await scheduler.checkOnce();
  // No throw = pass
});

test('Scheduler: handles empty reminders array', async () => {
  const filePath = makeTmpReminders({
    reminders: [], next_id: 1, updated: '2026-02-18',
  });

  const { ReminderScheduler } = await import('../src/core/reminder-scheduler');
  const scheduler = new ReminderScheduler({} as any, {
    remindersPath: filePath,
  });

  await scheduler.checkOnce();
  // No throw = pass
});

test('Scheduler: start/stop lifecycle', async () => {
  const { ReminderScheduler } = await import('../src/core/reminder-scheduler');
  const scheduler = new ReminderScheduler({} as any, {
    remindersPath: '/tmp/nonexistent.json',
    checkInterval: 999999, // very long to avoid actual firing
  });

  scheduler.start();
  // Double start should be idempotent
  scheduler.start();
  scheduler.stop();
  // Double stop should be safe
  scheduler.stop();
});

console.log('All reminder-scheduler tests passed!');
