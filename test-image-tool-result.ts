/**
 * 测试：read_file 返回图片时，tool result 的格式是否正确
 */

import { ContentBlock } from './src/types';

// 模拟 read_file 返回的图片数据
const toolResult = {
  _imageForNewMessage: true,
  imageBlock: {
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/jpeg',
      data: '/9j/4AAQSkZJRg...(省略)',
    },
    filePath: '/Users/zhuhanyuan/Downloads/xiaoba-demo-images/开始对话.png',
  },
  filePath: '/Users/zhuhanyuan/Downloads/xiaoba-demo-images/开始对话.png',
};

// conversation-runner 中的处理逻辑
const messages: any[] = [];

if (typeof toolResult === 'object' && toolResult && '_imageForNewMessage' in toolResult) {
  const imageData = toolResult as any;
  messages.push({
    role: 'tool',
    content: [
      { type: 'text', text: `已读取图片: ${imageData.filePath}` },
      imageData.imageBlock,
    ],
    tool_call_id: 'toolu_01SqONYFkZxSK7XJ7AnNkgU8',
    name: 'read_file',
  });
}

console.log('=== Tool Result Message ===');
console.log(JSON.stringify(messages[0], null, 2));

// 模拟 anthropic-provider 的转换
const msg = messages[0];
const content = Array.isArray(msg.content)
  ? msg.content.map((block: any) =>
      block.type === 'text'
        ? { type: 'text' as const, text: block.text }
        : { type: 'image' as const, source: block.source }
    )
  : msg.content || '';

console.log('\n=== Anthropic Format ===');
console.log(JSON.stringify({
  type: 'tool_result',
  tool_use_id: msg.tool_call_id,
  content
}, null, 2));

// 检查问题
console.log('\n=== 问题检查 ===');
const imageBlock = msg.content[1];
console.log('imageBlock.type:', imageBlock.type);
console.log('imageBlock.source:', imageBlock.source ? '存在' : '不存在');
console.log('imageBlock.filePath:', imageBlock.filePath);

// 问题：imageBlock 包含了 filePath 字段，这不是标准的 Anthropic ImageBlock
// Anthropic 只接受 { type: 'image', source: {...} }
// 但我们的 imageBlock 是 { type: 'image', source: {...}, filePath: '...' }
