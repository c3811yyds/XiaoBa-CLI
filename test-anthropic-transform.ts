/**
 * 测试：检查 anthropic-provider 转换后的数据是否符合 API 规范
 */

// 模拟 imageBlock（包含 filePath）
const imageBlock = {
  type: 'image',
  source: {
    type: 'base64',
    media_type: 'image/jpeg',
    data: 'fake-base64-data',
  },
  filePath: '/path/to/image.png',
};

// 模拟 anthropic-provider 的转换逻辑
const block = imageBlock;
const transformed = block.type === 'text'
  ? { type: 'text' as const, text: (block as any).text }
  : { type: 'image' as const, source: block.source };

console.log('=== 原始 block ===');
console.log(JSON.stringify(imageBlock, null, 2));

console.log('\n=== 转换后 ===');
console.log(JSON.stringify(transformed, null, 2));

console.log('\n=== 检查 ===');
console.log('transformed 有 filePath?', 'filePath' in transformed);
console.log('transformed 的 keys:', Object.keys(transformed));

// 问题分析：
// 转换后的对象只有 { type, source }，没有 filePath
// 这是正确的！

// 但是，如果在某个地方直接使用了原始的 imageBlock，
// 而不是转换后的对象，就会把 filePath 发送给 Anthropic API

console.log('\n=== 可能的问题场景 ===');
console.log('如果直接使用 imageBlock:', JSON.stringify(imageBlock, null, 2));
console.log('Anthropic API 会拒绝，因为 ImageBlockParam 不应该有 filePath 字段');
