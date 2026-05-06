/**
 * COO 消息集成测试
 *
 * 模拟真实 CatsCompany 消息流：
 *   用户消息 → AgentSession.handleMessage() → ConversationRunner → AI(mock) → send_message tool → 用户可见输出
 *
 * 不需要真实 LLM 或 CatsCompany 服务器，通过 mock AIService 控制 AI 回复，
 * 验证完整管线行为。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentSession, AgentServices } from '../src/core/agent-session';
import { ToolManager } from '../src/tools/tool-manager';
import { SkillManager } from '../src/skills/skill-manager';
import { SendMessageTool } from '../src/tools/send-message-tool';
import { ChatResponse, Message } from '../src/types';

// ─── Mock AIService ───

/** 创建一个 mock AIService，按顺序返回预设的 ChatResponse */
function createMockAI(responses: ChatResponse[]) {
  let callIndex = 0;
  const receivedMessages: Message[][] = [];

  return {
    ai: {
      chat: async (messages: Message[]) => {
        receivedMessages.push([...messages]);
        return responses[callIndex++] ?? { content: '', toolCalls: [] };
      },
      chatStream: async (messages: Message[]) => {
        receivedMessages.push([...messages]);
        return responses[callIndex++] ?? { content: '', toolCalls: [] };
      },
    } as any,
    getReceivedMessages: () => receivedMessages,
  };
}

/** 构建一个包含 send_message 工具调用的 ChatResponse */
function sendMessageResponse(text: string): ChatResponse {
  return {
    content: null,
    toolCalls: [{
      id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'function',
      function: {
        name: 'send_message',
        arguments: JSON.stringify({ message: text }),
      },
    }],
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  };
}

/** 构建一个纯文本（无工具调用）的最终回复 */
function finalResponse(text: string = 'ok'): ChatResponse {
  return {
    content: text,
    toolCalls: [],
    usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
  };
}

// ─── Helper: 构建 AgentSession + 捕获 send_message ───

interface TestHarness {
  session: AgentSession;
  sentMessages: string[];
  getReceivedMessages: () => Message[][];
}

function createTestSession(responses: ChatResponse[]): TestHarness {
  const mock = createMockAI(responses);
  const toolManager = new ToolManager();
  const skillManager = new SkillManager();

  const services: AgentServices = {
    aiService: mock.ai,
    toolManager,
    skillManager,
  };

  // CatsCompany surface: cc_user: prefix
  const session = new AgentSession('cc_user:test-coo', services);

  // 捕获 send_message 输出
  const sentMessages: string[] = [];
  const sendTool = toolManager.getTool<SendMessageTool>('send_message')!;
  sendTool.bindSession('cc_user:test-coo', 'test-topic', async (_topic, text) => {
    sentMessages.push(text);
  });

  return { session, sentMessages, getReceivedMessages: mock.getReceivedMessages };
}

// ─── 测试场景 ───

test('CatsCompany surface: system prompt contains COO identity', async () => {
  const { getReceivedMessages } = createTestSession([
    sendMessageResponse('你好，我是你的 COO'),
    finalResponse(),
  ]);

  const session = createTestSession([
    sendMessageResponse('你好'),
    finalResponse(),
  ]);
  await session.session.handleMessage('你好');

  const firstCall = session.getReceivedMessages()[0];
  const systemMsg = firstCall.find(m => m.role === 'system' && m.content?.includes('COO'));
  assert.ok(systemMsg, 'System prompt should contain COO identity');
});

test('CatsCompany surface: system prompt has send_message instruction', async () => {
  const harness = createTestSession([
    sendMessageResponse('收到'),
    finalResponse(),
  ]);
  await harness.session.handleMessage('测试');

  const firstCall = harness.getReceivedMessages()[0];
  const surfaceMsg = firstCall.find(m =>
    m.role === 'system' && m.content?.includes('[surface:catscompany]')
  );
  assert.ok(surfaceMsg, 'Should inject CatsCompany surface context');
  assert.ok(
    surfaceMsg!.content!.includes('send_message'),
    'Surface context should mention send_message as the visible output channel'
  );
});

test('send_message tool delivers text to user', async () => {
  const harness = createTestSession([
    sendMessageResponse('这是 COO 的回复'),
    finalResponse(),
  ]);

  await harness.session.handleMessage('帮我看看任务进度');

  assert.equal(harness.sentMessages.length, 1);
  assert.equal(harness.sentMessages[0], '这是 COO 的回复');
});

test('multi-turn: AI calls send_message then uses another tool then sends again', async () => {
  const harness = createTestSession([
    // Turn 1: AI calls send_message
    sendMessageResponse('正在查看...'),
    // Turn 2: AI calls send_message again with result
    sendMessageResponse('任务 T-001 进度 80%'),
    // Turn 3: final (no tool call)
    finalResponse(),
  ]);

  await harness.session.handleMessage('任务进度如何？');

  assert.equal(harness.sentMessages.length, 2);
  assert.equal(harness.sentMessages[0], '正在查看...');
  assert.equal(harness.sentMessages[1], '任务 T-001 进度 80%');
});

test('busy protection: concurrent handleMessage returns busy message', async () => {
  // AI that takes a while (simulated by slow response)
  let resolveFirst: (v: ChatResponse) => void;
  const slowPromise = new Promise<ChatResponse>(r => { resolveFirst = r; });

  const toolManager = new ToolManager();
  const services: AgentServices = {
    aiService: {
      chat: async () => slowPromise,
      chatStream: async () => slowPromise,
    } as any,
    toolManager,
    skillManager: new SkillManager(),
  };

  const session = new AgentSession('cc_user:busy-test', services);
  const sendTool = toolManager.getTool<SendMessageTool>('send_message')!;
  sendTool.bindSession('cc_user:busy-test', 'topic', async () => {});

  // Start first message (will block on AI)
  const first = session.handleMessage('第一条');

  // Second message should get busy response immediately
  const second = await session.handleMessage('第二条');
  assert.equal(second, '正在处理上一条消息，请稍候...');

  // Resolve first to clean up
  resolveFirst!({ content: 'done', toolCalls: [] });
  await first;
});

test('session history: user message is persisted after handleMessage', async () => {
  const harness = createTestSession([
    sendMessageResponse('好的'),
    finalResponse(),
  ]);

  await harness.session.handleMessage('记住这件事');

  const messages = harness.session.getMessages();
  const userMsg = messages.find(m => m.role === 'user' && m.content === '记住这件事');
  assert.ok(userMsg, 'User message should be in session history');
});

test('Feishu surface: different session key prefix gets feishu context', async () => {
  const mock = createMockAI([
    sendMessageResponse('飞书回复'),
    finalResponse(),
  ]);
  const toolManager = new ToolManager();
  const services: AgentServices = {
    aiService: mock.ai,
    toolManager,
    skillManager: new SkillManager(),
  };

  const session = new AgentSession('user:feishu-test', services);
  const sendTool = toolManager.getTool<SendMessageTool>('send_message')!;
  sendTool.bindSession('user:feishu-test', 'chat-id', async () => {});

  await session.handleMessage('你好');

  const firstCall = mock.getReceivedMessages()[0];
  const surfaceMsg = firstCall.find(m =>
    m.role === 'system' && m.content?.includes('[surface:feishu]')
  );
  assert.ok(surfaceMsg, 'Feishu session should get feishu surface context');
});

test('error in AI does not corrupt session state', async () => {
  const toolManager = new ToolManager();
  let callCount = 0;
  const services: AgentServices = {
    aiService: {
      chat: async () => {
        if (callCount++ === 0) throw new Error('API down');
        return { content: 'recovered', toolCalls: [] };
      },
      chatStream: async () => {
        if (callCount++ === 0) throw new Error('API down');
        return { content: 'recovered', toolCalls: [] };
      },
    } as any,
    toolManager,
    skillManager: new SkillManager(),
  };

  const session = new AgentSession('cc_user:error-test', services);
  const sendTool = toolManager.getTool<SendMessageTool>('send_message')!;
  sendTool.bindSession('cc_user:error-test', 'topic', async () => {});

  // First call fails
  const result1 = await session.handleMessage('会失败');
  assert.ok(result1.includes('出错'), 'Should return error message');

  // Session should not be stuck in busy state
  assert.equal(session.isBusy(), false, 'Session should not be busy after error');

  // Second call should work
  const result2 = await session.handleMessage('恢复了');
  assert.equal(result2, 'recovered');
});

console.log('COO message integration tests loaded');
