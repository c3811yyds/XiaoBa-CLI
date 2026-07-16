import { describe, test } from 'node:test';
import * as assert from 'node:assert';
import {
  isNativeFeishuGroupTrigger,
  selectNativeFeishuGroupContext,
} from '../src/catscompany/agent-context-history';
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

  test('does not replay an earlier message that already triggered the agent', () => {
    const context = selectNativeFeishuGroupContext([{
      id: 7,
      seq_id: 7,
      content: '@机器人 总结上面的讨论',
      context_eligible: true,
      context_role: 'user',
      agent_uid: 42,
      agent_id: 'usr42',
      metadata: nativeMetadata({ triggered: true }),
    }], 0);

    assert.deepEqual(context, []);
  });

  test('injects restored ordinary messages before processing the trigger turn', async () => {
    const bot = Object.create(CatsCompanyBot.prototype) as any;
    const injected: string[] = [];
    const savedCursors: Array<[string, number]> = [];
    bot.bot = {
      getAgentContextHistory: async (topic: string, options: { beforeId?: number }) => {
        assert.equal(topic, 'grp_9');
        assert.equal(options.beforeId, 88);
        return {
          messages: [{
            id: 87,
            seq_id: 87,
            content: '回答我上面的问题',
            context_eligible: true,
            context_role: 'user',
            agent_uid: 42,
            agent_id: 'usr42',
            metadata: { catsco_identity: nativeMetadata({ speaker: '林益' }).catsco_identity },
          }],
          topic_id: 'grp_9',
          agent_uid: 42,
          has_more: false,
          next_before_id: 0,
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

  test('does not inject history twice after a complete cloud restore', async () => {
    const bot = Object.create(CatsCompanyBot.prototype) as any;
    let fetchCount = 0;
    const savedCursors: Array<[string, number]> = [];
    bot.bot = {
      getAgentContextHistory: async () => {
        fetchCount++;
        throw new Error('should not fetch after cloud restore');
      },
    };

    await bot.hydrateNativeFeishuGroupContext({
      injectContext: () => assert.fail('restored history must not be injected twice'),
      getRemoteContextCursor: () => 0,
      saveRemoteContextCursor: (source: string, cursor: number) => savedCursors.push([source, cursor]),
    }, {
      topic: 'grp_9',
      chatType: 'group',
      seq: 88,
      metadata: nativeMetadata({ triggered: true }),
    }, 'cc_group:grp_9', 'restored');

    assert.equal(fetchCount, 0);
    assert.deepEqual(savedCursors, [['catscompany.agent_context', 88]]);
  });
});
