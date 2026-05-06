/**
 * Speaker Identity 重构测试
 *
 * 覆盖盲区：
 * 1. writeMessage 新签名 (speaker: string, isSelf: boolean) 的所有调用点
 * 2. AgentSession 三个 writeMessage 调用点的 speaker/isSelf 正确性
 * 3. getAgentName / getOwnerName getter
 * 4. 各平台 session 的 speaker 传递
 * 5. enqueue 路径的 speaker/isSelf
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { GauzMemService } from '../src/utils/gauzmem-service';
import { AgentSession, AgentServices } from '../src/core/agent-session';
import { SkillManager } from '../src/skills/skill-manager';

// ─── 辅助 ──────────────────────────────────────────────

/** 捕获 writeMessage 的完整参数（含 isSelf） */
interface WriteCall {
  text: string;
  speaker: string;
  isSelf: boolean;
  platformId: string;
  runId?: string;
}

function mockGauzMem(overrides: {
  isAvailable?: () => boolean;
  writeMessage?: (...args: any[]) => Promise<void>;
  recallWithMetadata?: (...args: any[]) => Promise<any>;
  getAgentName?: () => string;
  getOwnerName?: () => string;
}) {
  const gauzMem = GauzMemService.getInstance();
  const originals: Record<string, any> = {};
  for (const [key, fn] of Object.entries(overrides)) {
    originals[key] = (gauzMem as any)[key]?.bind(gauzMem);
    (gauzMem as any)[key] = fn;
  }
  return () => {
    for (const [key, fn] of Object.entries(originals)) {
      (gauzMem as any)[key] = fn;
    }
  };
}

function buildMockServices(): AgentServices {
  return {
    aiService: {
      async chat() { return { content: 'mock reply' }; },
      async chatStream() { return { content: 'mock reply' }; },
    } as any,
    toolManager: {
      getToolDefinitions() { return []; },
      async executeTool() { throw new Error('should not be called'); },
    } as any,
    skillManager: new SkillManager(),
  };
}

// ═══════════════════════════════════════════════════════
// 1. writeMessage 签名验证
// ═══════════════════════════════════════════════════════

test('writeMessage receives isSelf=false for user messages', async () => {
  const calls: WriteCall[] = [];
  const restore = mockGauzMem({
    isAvailable: () => true,
    writeMessage: async (text: string, speaker: string, isSelf: boolean, platformId: string, runId?: string) => {
      calls.push({ text, speaker, isSelf, platformId, runId });
    },
    recallWithMetadata: async () => null,
    getOwnerName: () => '张三',
    getAgentName: () => 'xiaoba',
  });

  try {
    const session = new AgentSession('cli', buildMockServices());
    await session.handleMessage('你好');
    await new Promise(r => setTimeout(r, 50));

    // 第一条：用户消息
    const userCall = calls[0];
    assert.equal(userCall.speaker, '张三', 'user message speaker should be ownerName');
    assert.equal(userCall.isSelf, false, 'user message isSelf should be false');
    assert.equal(userCall.text, '你好');
  } finally {
    restore();
  }
});

test('writeMessage receives isSelf=true for agent messages', async () => {
  const calls: WriteCall[] = [];
  const restore = mockGauzMem({
    isAvailable: () => true,
    writeMessage: async (text: string, speaker: string, isSelf: boolean, platformId: string, runId?: string) => {
      calls.push({ text, speaker, isSelf, platformId, runId });
    },
    recallWithMetadata: async () => null,
    getOwnerName: () => '张三',
    getAgentName: () => 'xiaoba',
  });

  try {
    const session = new AgentSession('cli', buildMockServices());
    await session.handleMessage('你好');
    await new Promise(r => setTimeout(r, 50));

    // 第二条：agent 回复
    const agentCall = calls[1];
    assert.equal(agentCall.speaker, 'xiaoba', 'agent message speaker should be agentName');
    assert.equal(agentCall.isSelf, true, 'agent message isSelf should be true');
  } finally {
    restore();
  }
});

// ═══════════════════════════════════════════════════════
// 2. ownerName fallback 逻辑
// ═══════════════════════════════════════════════════════

test('user message speaker falls back to "user" when ownerName is empty', async () => {
  const calls: WriteCall[] = [];
  const restore = mockGauzMem({
    isAvailable: () => true,
    writeMessage: async (text: string, speaker: string, isSelf: boolean, platformId: string, runId?: string) => {
      calls.push({ text, speaker, isSelf, platformId, runId });
    },
    recallWithMetadata: async () => null,
    getOwnerName: () => '',  // empty ownerName
    getAgentName: () => 'xiaoba',
  });

  try {
    const session = new AgentSession('cli', buildMockServices());
    await session.handleMessage('test');
    await new Promise(r => setTimeout(r, 50));

    assert.equal(calls[0].speaker, 'user', 'should fallback to "user" when ownerName is empty');
    assert.equal(calls[0].isSelf, false);
  } finally {
    restore();
  }
});

// ═══════════════════════════════════════════════════════
// 3. enqueue 路径
// ═══════════════════════════════════════════════════════

test('enqueue writes user message with isSelf=false', async () => {
  const calls: WriteCall[] = [];
  const restore = mockGauzMem({
    isAvailable: () => true,
    writeMessage: async (text: string, speaker: string, isSelf: boolean, platformId: string, runId?: string) => {
      calls.push({ text, speaker, isSelf, platformId, runId });
    },
    getOwnerName: () => '李四',
    getAgentName: () => 'xiaoba',
  });

  try {
    const session = new AgentSession('cli', buildMockServices());
    session.enqueue('排队消息');
    await new Promise(r => setTimeout(r, 50));

    assert.equal(calls.length, 1);
    assert.equal(calls[0].text, '排队消息');
    assert.equal(calls[0].speaker, '李四');
    assert.equal(calls[0].isSelf, false, 'enqueue should always be isSelf=false');
    assert.equal(calls[0].platformId, 'cli');
  } finally {
    restore();
  }
});

test('enqueue falls back to "user" when ownerName is empty', async () => {
  const calls: WriteCall[] = [];
  const restore = mockGauzMem({
    isAvailable: () => true,
    writeMessage: async (text: string, speaker: string, isSelf: boolean, platformId: string, runId?: string) => {
      calls.push({ text, speaker, isSelf, platformId, runId });
    },
    getOwnerName: () => '',
    getAgentName: () => 'xiaoba',
  });

  try {
    const session = new AgentSession('cli', buildMockServices());
    session.enqueue('test');
    await new Promise(r => setTimeout(r, 50));

    assert.equal(calls[0].speaker, 'user');
  } finally {
    restore();
  }
});

// ═══════════════════════════════════════════════════════
// 4. 各平台 session 的 speaker + isSelf
// ═══════════════════════════════════════════════════════

test('feishu session: correct speaker, isSelf, platformId', async () => {
  const calls: WriteCall[] = [];
  const restore = mockGauzMem({
    isAvailable: () => true,
    writeMessage: async (text: string, speaker: string, isSelf: boolean, platformId: string, runId?: string) => {
      calls.push({ text, speaker, isSelf, platformId, runId });
    },
    recallWithMetadata: async () => null,
    getOwnerName: () => '飞书用户',
    getAgentName: () => 'xiaoba',
  });

  try {
    const session = new AgentSession('user:feishu-123', buildMockServices());
    await session.handleMessage('飞书消息');
    await new Promise(r => setTimeout(r, 50));

    // user message
    assert.equal(calls[0].speaker, '飞书用户');
    assert.equal(calls[0].isSelf, false);
    assert.equal(calls[0].platformId, 'feishu');
    assert.equal(calls[0].runId, 'user:feishu-123');

    // agent message
    assert.equal(calls[1].speaker, 'xiaoba');
    assert.equal(calls[1].isSelf, true);
    assert.equal(calls[1].platformId, 'feishu');
  } finally {
    restore();
  }
});

test('catscompany session: correct speaker, isSelf, platformId', async () => {
  const calls: WriteCall[] = [];
  const restore = mockGauzMem({
    isAvailable: () => true,
    writeMessage: async (text: string, speaker: string, isSelf: boolean, platformId: string, runId?: string) => {
      calls.push({ text, speaker, isSelf, platformId, runId });
    },
    recallWithMetadata: async () => null,
    getOwnerName: () => '猫公司用户',
    getAgentName: () => 'xiaoba',
  });

  try {
    const session = new AgentSession('cc_user:cats-456', buildMockServices());
    await session.handleMessage('猫公司消息');
    await new Promise(r => setTimeout(r, 50));

    assert.equal(calls[0].speaker, '猫公司用户');
    assert.equal(calls[0].isSelf, false);
    assert.equal(calls[0].platformId, 'catscompany');

    assert.equal(calls[1].speaker, 'xiaoba');
    assert.equal(calls[1].isSelf, true);
    assert.equal(calls[1].platformId, 'catscompany');
  } finally {
    restore();
  }
});

test('group session: correct speaker, isSelf, platformId', async () => {
  const calls: WriteCall[] = [];
  const restore = mockGauzMem({
    isAvailable: () => true,
    writeMessage: async (text: string, speaker: string, isSelf: boolean, platformId: string, runId?: string) => {
      calls.push({ text, speaker, isSelf, platformId, runId });
    },
    recallWithMetadata: async () => null,
    getOwnerName: () => '群成员A',
    getAgentName: () => 'xiaoba',
  });

  try {
    const session = new AgentSession('group:feishu-group-789', buildMockServices());
    await session.handleMessage('群聊消息');
    await new Promise(r => setTimeout(r, 50));

    assert.equal(calls[0].speaker, '群成员A');
    assert.equal(calls[0].isSelf, false);
    assert.equal(calls[0].platformId, 'feishu');
    assert.equal(calls[0].runId, 'group:feishu-group-789');

    assert.equal(calls[1].speaker, 'xiaoba');
    assert.equal(calls[1].isSelf, true);
  } finally {
    restore();
  }
});

// ═══════════════════════════════════════════════════════
// 5. getAgentName / getOwnerName
// ═══════════════════════════════════════════════════════

test('getAgentName returns configured agent name', () => {
  const gauzMem = GauzMemService.getInstance();
  const name = gauzMem.getAgentName();
  // Default from env or 'xiaoba'
  assert.equal(typeof name, 'string');
  assert.ok(name.length > 0, 'agentName should not be empty');
});

test('getOwnerName returns configured owner name', () => {
  const gauzMem = GauzMemService.getInstance();
  const name = gauzMem.getOwnerName();
  assert.equal(typeof name, 'string');
  // ownerName can be empty string (default)
});

// ═══════════════════════════════════════════════════════
// 6. 端到端：完整 speaker identity 链路
// ═══════════════════════════════════════════════════════

test('e2e: multi-turn conversation preserves correct speaker identity per message', async () => {
  const calls: WriteCall[] = [];
  const restore = mockGauzMem({
    isAvailable: () => true,
    writeMessage: async (text: string, speaker: string, isSelf: boolean, platformId: string, runId?: string) => {
      calls.push({ text, speaker, isSelf, platformId, runId });
    },
    recallWithMetadata: async () => null,
    getOwnerName: () => '张三',
    getAgentName: () => 'xiaoba',
  });

  try {
    const session = new AgentSession('cli', buildMockServices());

    await session.handleMessage('第一轮');
    await session.handleMessage('第二轮');
    await new Promise(r => setTimeout(r, 50));

    // 4 calls: user1, agent1, user2, agent2
    assert.equal(calls.length, 4);

    // All user messages: speaker=张三, isSelf=false
    assert.equal(calls[0].speaker, '张三');
    assert.equal(calls[0].isSelf, false);
    assert.equal(calls[2].speaker, '张三');
    assert.equal(calls[2].isSelf, false);

    // All agent messages: speaker=xiaoba, isSelf=true
    assert.equal(calls[1].speaker, 'xiaoba');
    assert.equal(calls[1].isSelf, true);
    assert.equal(calls[3].speaker, 'xiaoba');
    assert.equal(calls[3].isSelf, true);
  } finally {
    restore();
  }
});

test('e2e: enqueue + handleMessage both use correct speaker identity', async () => {
  const calls: WriteCall[] = [];
  const restore = mockGauzMem({
    isAvailable: () => true,
    writeMessage: async (text: string, speaker: string, isSelf: boolean, platformId: string, runId?: string) => {
      calls.push({ text, speaker, isSelf, platformId, runId });
    },
    recallWithMetadata: async () => null,
    getOwnerName: () => '王五',
    getAgentName: () => 'xiaoba',
  });

  try {
    const session = new AgentSession('cli', buildMockServices());

    // enqueue (user message only, no agent reply)
    session.enqueue('排队消息');
    await new Promise(r => setTimeout(r, 50));

    // handleMessage (user + agent)
    await session.handleMessage('正常消息');
    await new Promise(r => setTimeout(r, 50));

    // enqueue: 1 call (user)
    // handleMessage: 2 calls (user + agent)
    assert.equal(calls.length, 3);

    // enqueue call
    assert.equal(calls[0].speaker, '王五');
    assert.equal(calls[0].isSelf, false);

    // handleMessage user call
    assert.equal(calls[1].speaker, '王五');
    assert.equal(calls[1].isSelf, false);

    // handleMessage agent call
    assert.equal(calls[2].speaker, 'xiaoba');
    assert.equal(calls[2].isSelf, true);
  } finally {
    restore();
  }
});
