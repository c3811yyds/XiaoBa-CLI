import { afterEach, describe, test } from 'node:test';
import * as assert from 'node:assert';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  isNativeFeishuGroupTrigger,
  selectNativeFeishuGroupContext,
} from '../src/catscompany/agent-context-history';
import { CatsClient } from '../src/catscompany/client';
import { CatsCompanyBot } from '../src/catscompany';

function nativeMetadata(options: {
  triggered?: boolean;
  speaker?: string;
  source?: string;
  bindingId?: number;
} = {}) {
  return {
    source_channel: options.source ?? 'feishu',
    channel_native_group_binding_id: options.bindingId ?? 17,
    channel_native_group_triggered: options.triggered ?? false,
    catsco_identity: {
      actor: {
        display_name: options.speaker ?? '陈大为',
        user_id: 'usr7',
      },
    },
  };
}

describe('CatsCompany native Feishu group context', () => {
  const servers: Server[] = [];

  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
  });

  test('recognizes only a triggered native Feishu group message', () => {
    assert.equal(isNativeFeishuGroupTrigger({
      chatType: 'group',
      seq: 12,
      metadata: nativeMetadata({ triggered: true }),
    }), true);
    assert.equal(isNativeFeishuGroupTrigger({
      chatType: 'group',
      seq: 12,
      metadata: nativeMetadata(),
    }), false);
    assert.equal(isNativeFeishuGroupTrigger({
      chatType: 'p2p',
      seq: 12,
      metadata: nativeMetadata({ triggered: true }),
    }), false);
  });

  test('replays eligible member messages after the persisted cursor', () => {
    const context = selectNativeFeishuGroupContext([
      {
        seq_id: 1,
        content: '更早的讨论',
        context_eligible: true,
        context_role: 'user',
        metadata: { catsco_identity: nativeMetadata().catsco_identity },
      },
      {
        seq_id: 2,
        content: '@机器人 总结一下',
        context_eligible: true,
        context_role: 'user',
        metadata: { catsco_identity: nativeMetadata().catsco_identity },
      },
      {
        seq_id: 3,
        content: '上一轮回复',
        context_eligible: true,
        context_role: 'assistant',
        metadata: { catsco_identity: nativeMetadata().catsco_identity },
      },
      {
        seq_id: 4,
        content: '给我发一个 txt 文件',
        context_eligible: true,
        context_role: 'user',
        metadata: { catsco_identity: nativeMetadata({ speaker: '陈大为' }).catsco_identity },
      },
      {
        seq_id: 5,
        content_blocks: [{ type: 'text', text: '里面写一句诗' }],
        context_eligible: true,
        context_role: 'user',
        metadata: { catsco_identity: nativeMetadata({ speaker: '林益' }).catsco_identity },
      },
      {
        seq_id: 6,
        content: 'working...',
        context_eligible: false,
        context_role: 'assistant',
        metadata: { catsco_identity: nativeMetadata().catsco_identity },
      },
      {
        seq_id: 3,
        content: '游标之前的消息',
        context_eligible: true,
        context_role: 'user',
        metadata: { catsco_identity: nativeMetadata().catsco_identity },
      },
    ], 3);

    assert.deepEqual(context, [
      '[发言人: 陈大为]\n给我发一个 txt 文件',
      '[发言人: 林益]\n里面写一句诗',
    ]);
  });

  test('requests stable history before the current trigger with bot credentials', async () => {
    let requestUrl = '';
    let authorization = '';
    const server = createServer((request, response) => {
      requestUrl = request.url || '';
      authorization = String(request.headers.authorization || '');
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ messages: [], topic_id: 'grp_9', agent_uid: 42 }));
    });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    const client = new CatsClient({
      serverUrl: 'ws://127.0.0.1:1/v0/channels',
      httpBaseUrl: `http://127.0.0.1:${address.port}`,
      apiKey: 'cc_bot_secret',
    });

    await client.fetchAgentContextHistory('grp_9', 88, 50);

    assert.equal(authorization, 'ApiKey cc_bot_secret');
    const parsed = new URL(requestUrl, 'http://localhost');
    assert.equal(parsed.pathname, '/api/messages');
    assert.equal(parsed.searchParams.get('topic_id'), 'grp_9');
    assert.equal(parsed.searchParams.get('agent_context'), '1');
    assert.equal(parsed.searchParams.get('before_id'), '88');
    assert.equal(parsed.searchParams.get('limit'), '50');
  });

  test('injects restored ordinary messages before processing the trigger turn', async () => {
    const bot = Object.create(CatsCompanyBot.prototype) as any;
    const injected: string[] = [];
    const savedCursors: Array<[string, number]> = [];
    bot.bot = {
      fetchAgentContextHistory: async (topic: string, beforeId: number) => {
        assert.equal(topic, 'grp_9');
        assert.equal(beforeId, 88);
        return {
          messages: [{
            seq_id: 87,
            content: '回答我上面的问题',
            context_eligible: true,
            context_role: 'user',
            metadata: { catsco_identity: nativeMetadata({ speaker: '林益' }).catsco_identity },
          }],
        };
      },
    };

    await bot.hydrateNativeFeishuGroupContext({
      injectContext: (message: string) => injected.push(message),
      getRemoteContextCursor: () => 80,
      saveRemoteContextCursor: (source: string, cursor: number) => savedCursors.push([source, cursor]),
    }, {
      topic: 'grp_9',
      chatType: 'group',
      seq: 88,
      metadata: nativeMetadata({ triggered: true }),
    }, 'cc_group:grp_9');

    assert.deepEqual(injected, ['[发言人: 林益]\n回答我上面的问题']);
    assert.deepEqual(savedCursors, [['catscompany.agent_context', 88]]);
  });
});
