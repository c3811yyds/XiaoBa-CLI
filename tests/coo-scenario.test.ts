import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ReminderScheduler, RemindersFile } from '../src/core/reminder-scheduler';

function makeTmpReminders(data: RemindersFile): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coo-sc-'));
  const fp = path.join(dir, 'reminders.json');
  fs.writeFileSync(fp, JSON.stringify(data, null, 2));
  return fp;
}

function readJson(fp: string): any {
  return JSON.parse(fs.readFileSync(fp, 'utf-8'));
}

function makeScheduler(fp: string, mockSession: any) {
  const s = new ReminderScheduler({} as any, {
    remindersPath: fp,
    getNow: () => new Date('2026-02-18T10:00:00.000Z'),
  });
  (s as any).session = mockSession;
  (s as any).getOrCreateSession = () => mockSession;
  return s;
}

const okSession = { isBusy: () => false, handleMessage: async () => 'ok' };

// ─── 场景 1: once → inactive ───

test('Scenario: once reminder becomes inactive after fire', async () => {
  const fp = makeTmpReminders({
    reminders: [{
      id: 'R-001', type: 'task_check', description: '检查进度',
      trigger_at: '2026-02-18T08:00:00.000Z', repeat: 'once',
      action: '检查', created: '2026-02-17', last_triggered: null, active: true,
    }],
    next_id: 2, updated: '2026-02-17',
  });

  await makeScheduler(fp, okSession).checkOnce();

  const after = readJson(fp);
  assert.equal(after.reminders[0].active, false);
  assert.ok(after.reminders[0].last_triggered);
});

// ─── 场景 2: daily → +1 day ───

test('Scenario: daily reminder advances trigger_at by 1 day', async () => {
  const fp = makeTmpReminders({
    reminders: [{
      id: 'R-002', type: 'daily_summary', description: '每日摘要',
      trigger_at: '2026-02-18T09:00:00.000Z', repeat: 'daily',
      action: '生成摘要', created: '2026-02-16', last_triggered: null, active: true,
    }],
    next_id: 3, updated: '2026-02-17',
  });

  await makeScheduler(fp, okSession).checkOnce();

  const after = readJson(fp);
  assert.equal(after.reminders[0].active, true);
  assert.equal(after.reminders[0].trigger_at, '2026-02-19T09:00:00.000Z');
});

// ─── 场景 3: busy → skip ───

test('Scenario: busy session skips reminder', async () => {
  const fp = makeTmpReminders({
    reminders: [{
      id: 'R-003', type: 'task_check', description: 'test',
      trigger_at: '2026-02-18T08:00:00.000Z', repeat: 'once',
      action: 'check', created: '2026-02-17', last_triggered: null, active: true,
    }],
    next_id: 4, updated: '2026-02-17',
  });

  const busySession = {
    isBusy: () => true,
    handleMessage: async () => { throw new Error('should not be called'); },
  };
  await makeScheduler(fp, busySession).checkOnce();

  const after = readJson(fp);
  assert.equal(after.reminders[0].last_triggered, null);
  assert.equal(after.reminders[0].active, true);
});

// ─── 场景 4: 混合 reminder ───

test('Scenario: mixed reminders - only due ones fire', async () => {
  const fp = makeTmpReminders({
    reminders: [
      { id: 'R-010', type: 'task_check', description: 'past due',
        trigger_at: '2026-02-17T08:00:00.000Z', repeat: 'once',
        action: 'check past', created: '2026-02-16', last_triggered: null, active: true },
      { id: 'R-011', type: 'task_check', description: 'future',
        trigger_at: '2026-12-31T08:00:00.000Z', repeat: 'once',
        action: 'check future', created: '2026-02-16', last_triggered: null, active: true },
      { id: 'R-012', type: 'task_check', description: 'inactive',
        trigger_at: '2026-01-01T08:00:00.000Z', repeat: 'once',
        action: 'check inactive', created: '2026-01-01',
        last_triggered: '2026-01-01T09:00:00.000Z', active: false },
    ],
    next_id: 13, updated: '2026-02-17',
  });

  const fired: string[] = [];
  const trackSession = {
    isBusy: () => false,
    handleMessage: async (msg: string) => { fired.push(msg); return 'ok'; },
  };
  await makeScheduler(fp, trackSession).checkOnce();

  assert.equal(fired.length, 1);
  assert.ok(fired[0].includes('R-010'));

  const after = readJson(fp);
  assert.equal(after.reminders[0].active, false);
  assert.equal(after.reminders[1].active, true);
  assert.equal(after.reminders[1].last_triggered, null);
  assert.equal(after.reminders[2].active, false);
});

// ─── 场景 5: every_N_hours ───

test('Scenario: every_N_hours advances by interval', async () => {
  const fp = makeTmpReminders({
    reminders: [{
      id: 'R-020', type: 'custom', description: '每4小时',
      trigger_at: '2026-02-18T06:00:00.000Z', repeat: 'every_N_hours',
      repeat_interval_hours: 4,
      action: '检查', created: '2026-02-18', last_triggered: null, active: true,
    }],
    next_id: 21, updated: '2026-02-18',
  });

  await makeScheduler(fp, okSession).checkOnce();

  const after = readJson(fp);
  assert.equal(after.reminders[0].active, true);
  assert.equal(after.reminders[0].trigger_at, '2026-02-18T10:00:00.000Z');
});

// ─── 场景 6: handleMessage 失败仍更新状态 ───

test('Scenario: handleMessage failure still updates reminder', async () => {
  const fp = makeTmpReminders({
    reminders: [{
      id: 'R-030', type: 'task_check', description: 'will fail',
      trigger_at: '2026-02-18T08:00:00.000Z', repeat: 'once',
      action: 'fail', created: '2026-02-18', last_triggered: null, active: true,
    }],
    next_id: 31, updated: '2026-02-18',
  });

  const failSession = {
    isBusy: () => false,
    handleMessage: async () => { throw new Error('AI down'); },
  };
  await makeScheduler(fp, failSession).checkOnce();

  const after = readJson(fp);
  assert.equal(after.reminders[0].active, false);
  assert.ok(after.reminders[0].last_triggered);
});
