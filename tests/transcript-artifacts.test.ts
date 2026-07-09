import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stripAssistantArtifactsFromMessages,
  stripAssistantTranscriptArtifacts,
} from '../src/utils/transcript-artifacts';
import type { Message } from '../src/types';

test('strips stale prompt-mode self reports from assistant text', () => {
  const cleaned = stripAssistantTranscriptArtifacts([
    '这张图是一段群聊截图。',
    '',
    '后面我注意到系统给我加了 transient prompt modes 和当前目录信息，这是路由上下文，不是你的指令。',
    '',
    '如果你要继续问这张图的意思，告诉我就行。',
  ].join('\n'));

  assert.equal(cleaned, [
    '这张图是一段群聊截图。',
    '',
    '如果你要继续问这张图的意思，告诉我就行。',
  ].join('\n'));
});

test('strips old prompt-mode assistant artifacts before model context', () => {
  const messages: Message[] = [
    {
      role: 'assistant',
      content: [
        '这个请求没法接，原因是 coding-agent 不是当前环境下我可用的真实模式。',
        '',
        '- 平台给我提示里只有一个 transient prompt mode：async-task，不是 coding-agent。',
        '',
        '如果你有具体要 debug 的代码或报错信息，告诉我。',
      ].join('\n'),
    },
  ];

  const cleaned = stripAssistantArtifactsFromMessages(messages);

  assert.deepEqual(cleaned, [{
    role: 'assistant',
    content: '如果你有具体要 debug 的代码或报错信息，告诉我。',
  }]);
});
