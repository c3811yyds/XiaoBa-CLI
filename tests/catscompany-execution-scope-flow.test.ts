import { describe, test } from 'node:test';
import * as assert from 'node:assert';
import { CatsCompanyBot } from '../src/catscompany';
import { createCatsCoMessageEnvelope, createExecutionScope } from '../src/catscompany/message-envelope';

function canonicalMetadata(actorUserId: string, topicId: string, agentId = 'usr43', bodyId = 'body-main') {
  return {
    catsco_identity: {
      actor: { user_id: actorUserId },
      agent: { agent_id: agentId, body_id: bodyId },
      topic: { topic_id: topicId, type: topicId.startsWith('grp_') ? 'group' : 'p2p', channel_seq: 12 },
      permissions: { source: 'server_canonical_message' },
    },
  };
}

function expectedCatsCoSessionKey(actorUserId: string, topicId: string, agentId = 'usr43') {
  const topicType = topicId.startsWith('grp_') ? 'group' : 'p2p';
  if (topicType === 'group') return `cc_group:${topicId}`;
  void actorUserId;
  return `session:v2:catscompany:${topicType}:${encodeURIComponent(topicId)}:agent:${encodeURIComponent(agentId)}`;
}

function deviceGrant(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'user_device_grant',
    source: 'catscompany',
    grantId: 'device-grant-1',
    status: 'active',
    identityTrust: 'server_canonical',
    identitySource: 'metadata.catsco_identity',
    deviceId: 'alice-laptop',
    deviceDisplayName: 'Alice Laptop',
    deviceBodyId: 'body-device',
    deviceInstallationId: 'install-device',
    ownerUserId: 'usr7',
    sessionKey: 'session:v2:catscompany:p2p:p2p_7_43:agent:usr43',
    topicId: 'p2p_7_43',
    topicType: 'p2p',
    actorUserId: 'usr7',
    agentId: 'usr43',
    agentBodyId: 'body-main',
    operations: ['read_file', 'send_file'],
    createdAt: 1_000,
    expiresAt: 601_000,
    ...overrides,
  };
}

function metadataWithDeviceGrants(actorUserId: string, topicId: string, grants: unknown[], agentId = 'usr43', bodyId = 'body-main') {
  const metadata = canonicalMetadata(actorUserId, topicId, agentId, bodyId);
  (metadata.catsco_identity as any).device_grants = grants;
  return metadata;
}

function metadataWithDeviceSelection(actorUserId: string, topicId: string, selection: Record<string, unknown>, agentId = 'usr43', bodyId = 'body-main') {
  const metadata = metadataWithDeviceGrants(actorUserId, topicId, [deviceGrant()], agentId, bodyId);
  (metadata.catsco_identity as any).device_selection = {
    kind: 'user_device_selection',
    source: 'catscompany',
    status: 'selected',
    sessionKey: expectedCatsCoSessionKey(actorUserId, topicId, agentId),
    topicId,
    topicType: topicId.startsWith('grp_') ? 'group' : 'p2p',
    actorUserId,
    agentId,
    selectedDevice: {
      deviceId: 'alice-laptop',
      displayName: 'Alice Laptop',
      bodyId: 'body-device',
      installationId: 'install-device',
      operations: ['read_file', 'send_file'],
    },
    ...selection,
  };
  return metadata;
}

function createHarness(options: {
  busy?: boolean;
  existingSession?: boolean;
  restoreStatus?: 'local_present' | 'restored' | 'empty' | 'skipped' | 'failed';
} = {}) {
  const bot = Object.create(CatsCompanyBot.prototype) as any;
  const handledTurns: Array<{ userMessage: unknown; options: any }> = [];
  const sessionKeys: string[] = [];
  const sessionInputs: any[] = [];
  const replies: string[] = [];
  const clearedSessionMarkers: string[] = [];
  let busy = options.busy ?? false;

  const session = {
    isBusy: () => busy,
    setBusy: (next: boolean) => {
      busy = next;
    },
    handleMessage: async (userMessage: unknown, handleOptions: any) => {
      handledTurns.push({ userMessage, options: handleOptions });
      return { visibleToUser: false, text: '' };
    },
    handleCommand: async (command: string) => command.toLowerCase() === 'clear'
      ? { handled: true, reply: '历史已清空' }
      : { handled: false },
    handleRuntimeObservation: async () => ({ visibleToUser: false, text: '' }),
  };

  bot.sessionManager = {
    getOrCreate: (input: any) => {
      sessionInputs.push(input);
      sessionKeys.push(typeof input === 'string' ? input : input.sessionKey);
      return session;
    },
    get: () => options.existingSession === false ? null : session,
  };
  bot.sender = {
    downloadFile: async () => null,
    sendTyping: () => undefined,
    reply: async (_topic: string, text: string) => { replies.push(text); },
    sendFile: async () => undefined,
    sendText: async () => undefined,
    sendThinking: async () => undefined,
    sendToolUse: async () => undefined,
    sendToolResult: async () => undefined,
  };
  bot.pendingAttachments = new Map();
  bot.messageQueue = new Map();
  bot.botUid = 'usr43';
  bot.cloudSessionRestorePromises = new Map();
  bot.cloudSessionRestorer = {
    restoreIfMissing: async () => ({
      status: options.restoreStatus || 'empty',
      restoredMessages: 0,
      fetchedMessages: 0,
      compressed: false,
    }),
    markLocalSessionCleared: (sessionKey: string) => clearedSessionMarkers.push(sessionKey),
  };

  return {
    bot,
    handledTurns,
    sessionKeys,
    sessionInputs,
    session,
    replies,
    clearedSessionMarkers,
  };
}

describe('CatsCompany execution scope flow', () => {
  test('does not create a blank session when first cloud recovery fails', async () => {
    const { bot, handledTurns, sessionKeys, replies } = createHarness({
      existingSession: false,
      restoreStatus: 'failed',
    });

    await (bot as any).onMessage({
      topic: 'p2p_7_43',
      senderId: 'usr7',
      text: '继续之前的工作',
      content: '继续之前的工作',
      metadata: canonicalMetadata('usr7', 'p2p_7_43'),
      isGroup: false,
      seq: 12,
    });

    assert.deepEqual(sessionKeys, []);
    assert.equal(handledTurns.length, 0);
    assert.match(replies[0] || '', /没有新建空白上下文/);
  });

  test('regular clear writes an empty sentinel while clear --all keeps files deleted', async () => {
    const regular = createHarness();
    await (regular.bot as any).onMessage({
      topic: 'p2p_7_43',
      senderId: 'usr7',
      text: '/clear',
      content: '/clear',
      metadata: canonicalMetadata('usr7', 'p2p_7_43'),
      isGroup: false,
      seq: 12,
    });
    assert.deepEqual(regular.clearedSessionMarkers, [
      'session:v2:catscompany:p2p:p2p_7_43:agent:usr43',
    ]);

    const all = createHarness();
    await (all.bot as any).onMessage({
      topic: 'p2p_7_43',
      senderId: 'usr7',
      text: '/clear --all',
      content: '/clear --all',
      metadata: canonicalMetadata('usr7', 'p2p_7_43'),
      isGroup: false,
      seq: 13,
    });
    assert.deepEqual(all.clearedSessionMarkers, []);
  });

  test('text that only resembles a clear command remains a normal user message', async () => {
    const { bot, handledTurns, clearedSessionMarkers } = createHarness();

    await (bot as any).onMessage({
      topic: 'p2p_7_43',
      senderId: 'usr7',
      text: ' /clear',
      content: ' /clear',
      metadata: canonicalMetadata('usr7', 'p2p_7_43'),
      isGroup: false,
      seq: 14,
    });

    assert.equal(handledTurns.length, 1);
    assert.deepEqual(clearedSessionMarkers, []);
  });

  test('passes canonical execution scope from websocket message into session turn', async () => {
    const { bot, handledTurns, sessionKeys, sessionInputs } = createHarness();

    await (bot as any).onMessage({
      topic: 'p2p_7_43',
      senderId: 'usr7',
      text: '查合同',
      content: '查合同',
      metadata: canonicalMetadata('usr7', 'p2p_7_43'),
      isGroup: false,
      seq: 12,
    });

    assert.deepEqual(sessionKeys, ['session:v2:catscompany:p2p:p2p_7_43:agent:usr43']);
    assert.equal(sessionInputs[0].version, 2);
    assert.equal(sessionInputs[0].legacySessionKey, 'cc_user:usr7');
    assert.equal(sessionInputs[0].legacyRestoreKey, 'cc_user:usr7');
    assert.equal(sessionInputs[0].legacyCleanupKey, 'cc_user:usr7');
    assert.equal(handledTurns.length, 1);
    assert.equal(handledTurns[0].options.sessionRoute.sessionKey, 'session:v2:catscompany:p2p:p2p_7_43:agent:usr43');
    assert.equal(handledTurns[0].options.executionScope.sessionKey, 'session:v2:catscompany:p2p:p2p_7_43:agent:usr43');
    assert.equal(handledTurns[0].options.executionScope.legacySessionKey, 'cc_user:usr7');
    assert.equal(handledTurns[0].options.executionScope.legacyRestoreKey, 'cc_user:usr7');
    assert.equal(handledTurns[0].options.executionScope.legacyCleanupKey, 'cc_user:usr7');
    assert.equal(handledTurns[0].options.executionScope.actorUserId, 'usr7');
    assert.equal(handledTurns[0].options.executionScope.agentId, 'usr43');
    assert.equal(handledTurns[0].options.executionScope.agentBodyId, 'body-main');
    assert.equal(handledTurns[0].options.executionScope.isTrusted, true);
  });

  test('keeps execution scope when a busy CatsCompany turn is queued then drained', async () => {
    const { bot, handledTurns, sessionKeys, session } = createHarness({ busy: true });

    await (bot as any).onMessage({
      topic: 'p2p_8_43',
      senderId: 'usr8',
      text: '继续查',
      content: '继续查',
      metadata: canonicalMetadata('usr8', 'p2p_8_43'),
      isGroup: false,
      seq: 12,
    });

    assert.equal(handledTurns.length, 0);
    session.setBusy(false);
    await (bot as any).drainMessageQueue('session:v2:catscompany:p2p:p2p_8_43:agent:usr43');

    assert.deepEqual(sessionKeys, [
      'session:v2:catscompany:p2p:p2p_8_43:agent:usr43',
      'session:v2:catscompany:p2p:p2p_8_43:agent:usr43',
    ]);
    assert.equal(handledTurns.length, 1);
    assert.equal(handledTurns[0].options.executionScope.actorUserId, 'usr8');
    assert.equal(handledTurns[0].options.executionScope.topicId, 'p2p_8_43');
    assert.equal(handledTurns[0].options.executionScope.isTrusted, true);
  });

  test('group turn uses legacy group session key while preserving actor in scope', async () => {
    const { bot, handledTurns, sessionKeys } = createHarness();

    await (bot as any).onMessage({
      topic: 'grp_80',
      senderId: 'usr7',
      text: '@usr43 看一下',
      content: '@usr43 看一下',
      metadata: canonicalMetadata('usr7', 'grp_80'),
      isGroup: true,
      seq: 12,
    });

    assert.deepEqual(sessionKeys, ['cc_group:grp_80']);
    assert.equal(handledTurns.length, 1);
    assert.equal(handledTurns[0].options.sessionRoute.sessionKey, 'cc_group:grp_80');
    assert.equal(handledTurns[0].options.sessionRoute.legacySessionKey, 'cc_group:grp_80');
    assert.equal(handledTurns[0].options.sessionRoute.legacyRestoreKey, 'cc_group:grp_80');
    assert.equal(handledTurns[0].options.sessionRoute.legacyCleanupKey, 'cc_group:grp_80');
    assert.equal(handledTurns[0].options.executionScope.sessionKey, 'cc_group:grp_80');
    assert.equal(handledTurns[0].options.executionScope.legacySessionKey, 'cc_group:grp_80');
    assert.equal(handledTurns[0].options.executionScope.legacyRestoreKey, 'cc_group:grp_80');
    assert.equal(handledTurns[0].options.executionScope.legacyCleanupKey, 'cc_group:grp_80');
    assert.equal(handledTurns[0].options.executionScope.topicType, 'group');
    assert.equal(handledTurns[0].options.executionScope.topicId, 'grp_80');
    assert.equal(handledTurns[0].options.executionScope.actorUserId, 'usr7');
  });

  test('passes server canonical device grants into CatsCompany session turn', async () => {
    const { bot, handledTurns } = createHarness();

    await (bot as any).onMessage({
      topic: 'p2p_7_43',
      senderId: 'usr7',
      text: '读一下本机文件',
      content: '读一下本机文件',
      metadata: metadataWithDeviceGrants('usr7', 'p2p_7_43', [deviceGrant()]),
      isGroup: false,
      seq: 12,
    });

    assert.equal(handledTurns.length, 1);
    assert.equal(handledTurns[0].options.deviceGrants?.length, 1);
    assert.equal(handledTurns[0].options.deviceGrants[0].deviceId, 'alice-laptop');
    assert.deepEqual(handledTurns[0].options.deviceGrants[0].operations, ['read_file', 'send_file']);
  });

  test('passes group device grants into CatsCompany session turn', async () => {
    const { bot, handledTurns } = createHarness();

    await (bot as any).onMessage({
      topic: 'grp_80',
      senderId: 'usr7',
      text: '在我的桌面创建文件夹',
      content: '在我的桌面创建文件夹',
      metadata: metadataWithDeviceGrants('usr7', 'grp_80', [
        deviceGrant({
          sessionKey: expectedCatsCoSessionKey('usr7', 'grp_80'),
          topicId: 'grp_80',
          topicType: 'group',
        }),
      ]),
      isGroup: true,
      seq: 12,
    });

    assert.equal(handledTurns.length, 1);
    assert.equal(handledTurns[0].options.executionScope.sessionKey, expectedCatsCoSessionKey('usr7', 'grp_80'));
    assert.equal(handledTurns[0].options.executionScope.topicId, 'grp_80');
    assert.equal(handledTurns[0].options.deviceGrants?.length, 1);
    assert.equal(handledTurns[0].options.deviceGrants[0].sessionKey, expectedCatsCoSessionKey('usr7', 'grp_80'));
    assert.equal(handledTurns[0].options.deviceGrants[0].topicId, 'grp_80');
    assert.equal(handledTurns[0].options.deviceGrants[0].actorUserId, 'usr7');
  });

  test('passes server canonical device selection into CatsCompany session turn', async () => {
    const { bot, handledTurns } = createHarness();

    await (bot as any).onMessage({
      topic: 'p2p_7_43',
      senderId: 'usr7',
      text: '读一下本机文件',
      content: '读一下本机文件',
      metadata: metadataWithDeviceSelection('usr7', 'p2p_7_43', {
        selectionSource: 'explicit_mention',
      }),
      isGroup: false,
      seq: 12,
    });

    assert.equal(handledTurns.length, 1);
    assert.equal(handledTurns[0].options.deviceSelection?.status, 'selected');
    assert.equal(handledTurns[0].options.deviceSelection?.selectionSource, 'explicit_mention');
    assert.equal(handledTurns[0].options.deviceSelection?.selectedDeviceId, 'alice-laptop');
    assert.equal(handledTurns[0].options.deviceSelection?.selectedDeviceDisplayName, 'Alice Laptop');
    assert.equal(handledTurns[0].options.deviceSelection?.selectedDeviceBodyId, 'body-device');
    assert.deepEqual(handledTurns[0].options.deviceSelection?.selectedDeviceOperations, ['read_file', 'send_file']);
  });

  test('drops device selection that does not match the canonical execution scope', async () => {
    const { bot, handledTurns } = createHarness();

    await (bot as any).onMessage({
      topic: 'p2p_7_43',
      senderId: 'usr7',
      text: '读一下本机文件',
      content: '读一下本机文件',
      metadata: metadataWithDeviceSelection('usr7', 'p2p_7_43', {
        actorUserId: 'usr8',
      }),
      isGroup: false,
      seq: 12,
    });

    assert.equal(handledTurns.length, 1);
    assert.equal(handledTurns[0].options.deviceSelection, undefined);
  });

  test('drops device grants that do not match the canonical execution scope', async () => {
    const { bot, handledTurns } = createHarness();

    await (bot as any).onMessage({
      topic: 'p2p_7_43',
      senderId: 'usr7',
      text: '读一下本机文件',
      content: '读一下本机文件',
      metadata: metadataWithDeviceGrants('usr7', 'p2p_7_43', [
        deviceGrant({ actorUserId: 'usr8' }),
        deviceGrant({ agentBodyId: 'body-other' }),
      ]),
      isGroup: false,
      seq: 12,
    });

    assert.equal(handledTurns.length, 1);
    assert.equal(handledTurns[0].options.deviceGrants, undefined);
  });

  test('does not merge queued CatsCo group input from another actor into the current actor scope', () => {
    const { bot } = createHarness();
    const aliceScope = createExecutionScope(createCatsCoMessageEnvelope({
      topic: 'grp_80',
      isGroup: true,
      senderId: 'alice',
      text: 'alice asks',
      metadata: canonicalMetadata('alice', 'grp_80'),
      botUid: 'usr43',
    }));
    const bobScope = createExecutionScope(createCatsCoMessageEnvelope({
      topic: 'grp_80',
      isGroup: true,
      senderId: 'bob',
      text: 'bob asks',
      metadata: canonicalMetadata('bob', 'grp_80'),
      botUid: 'usr43',
    }));

    assert.equal(aliceScope.sessionKey, bobScope.sessionKey);

    bot.messageQueue.set(bobScope.sessionKey, [{
      userMessage: 'bob follow-up',
      topic: 'grp_80',
      senderId: 'bob',
      seq: 13,
      executionScope: bobScope,
      receivedAt: Date.now(),
      source: 'user',
    }]);

    assert.equal((bot as any).consumeQueuedUserInput(aliceScope.sessionKey, aliceScope), null);
    assert.equal(bot.messageQueue.get(bobScope.sessionKey)?.length, 1);

    const pendingForBob = (bot as any).consumeQueuedUserInput(bobScope.sessionKey, bobScope);
    assert.equal(pendingForBob, 'bob follow-up');
    assert.equal(bot.messageQueue.has(bobScope.sessionKey), false);
  });

  test('preserves device grants when queued CatsCompany user input is merged', () => {
    const { bot } = createHarness();
    const scope = createExecutionScope(createCatsCoMessageEnvelope({
      topic: 'p2p_7_43',
      senderId: 'usr7',
      text: 'first',
      metadata: canonicalMetadata('usr7', 'p2p_7_43'),
      botUid: 'usr43',
    }));

    bot.messageQueue.set(scope.sessionKey, [{
      userMessage: '补充读取文件',
      topic: 'p2p_7_43',
      senderId: 'usr7',
      seq: 13,
      executionScope: scope,
      deviceGrants: [deviceGrant()],
      receivedAt: Date.now(),
      source: 'user',
    }]);

    const pending = (bot as any).consumeQueuedUserInput(scope.sessionKey, scope);
    assert.equal(typeof pending, 'object');
    assert.equal(pending.content, '补充读取文件');
    assert.equal(pending.deviceGrants.length, 1);
    assert.equal(pending.deviceGrants[0].deviceId, 'alice-laptop');
  });

  test('preserves latest device selection when queued CatsCompany user input is merged', () => {
    const { bot } = createHarness();
    const scope = createExecutionScope(createCatsCoMessageEnvelope({
      topic: 'p2p_7_43',
      senderId: 'usr7',
      text: 'first',
      metadata: canonicalMetadata('usr7', 'p2p_7_43'),
      botUid: 'usr43',
    }));

    const selection = {
      kind: 'user_device_selection',
      source: 'catscompany',
      status: 'selected',
      sessionKey: scope.sessionKey,
      topicId: scope.topicId,
      topicType: scope.topicType,
      actorUserId: scope.actorUserId,
      agentId: scope.agentId,
      identityTrust: 'server_canonical',
      selectedDeviceId: 'alice-laptop',
      selectedDeviceDisplayName: 'Alice Laptop',
    };

    bot.messageQueue.set(scope.sessionKey, [{
      userMessage: '补充读取文件',
      topic: 'p2p_7_43',
      senderId: 'usr7',
      seq: 13,
      executionScope: scope,
      deviceSelection: selection,
      receivedAt: Date.now(),
      source: 'user',
    }]);

    const pending = (bot as any).consumeQueuedUserInput(scope.sessionKey, scope);
    assert.equal(typeof pending, 'object');
    assert.equal(pending.content, '补充读取文件');
    assert.equal(pending.deviceSelection.selectedDeviceId, 'alice-laptop');
  });
});
