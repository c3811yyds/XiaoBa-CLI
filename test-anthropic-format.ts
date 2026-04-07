/**
 * 测试：验证 Anthropic API 对 tool_result + image 的格式要求
 * 
 * 根据 Anthropic 文档，user 消息中的 content 应该是：
 * 1. 所有 tool_result 在前
 * 2. 其他 content (text/image) 在后
 * 
 * 当前代码的问题：
 * [tool_result_1, image_1, tool_result_2, image_2]
 * 
 * 正确格式应该是：
 * [tool_result_1, tool_result_2, image_1, image_2]
 */

console.log('Anthropic API 格式要求测试\n');

// 当前代码生成的格式（错误）
const wrongFormat = [
  { type: 'tool_result', tool_use_id: 'id1', content: '已读取图片1' },
  { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'xxx' } },
  { type: 'tool_result', tool_use_id: 'id2', content: '已读取图片2' },
  { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'yyy' } },
];

console.log('❌ 当前格式（错误）:');
wrongFormat.forEach((block, i) => {
  console.log(`  [${i}] ${block.type}`);
});

// 正确的格式
const correctFormat = [
  { type: 'tool_result', tool_use_id: 'id1', content: '已读取图片1' },
  { type: 'tool_result', tool_use_id: 'id2', content: '已读取图片2' },
  { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'xxx' } },
  { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'yyy' } },
];

console.log('\n✅ 正确格式:');
correctFormat.forEach((block, i) => {
  console.log(`  [${i}] ${block.type}`);
});

console.log('\n问题分析:');
console.log('当前 anthropic-provider.ts 的 flushToolResults() 函数:');
console.log('  1. 遍历每个 tool_result');
console.log('  2. 提取 text blocks -> 创建 tool_result block');
console.log('  3. 提取 image blocks -> 立即 push 到 contentBlocks');
console.log('  4. 结果：tool_result 和 image 交替出现');
console.log('');
console.log('修复方案:');
console.log('  1. 先收集所有 tool_result blocks');
console.log('  2. 再收集所有 image blocks');
console.log('  3. 最后合并：[...toolResults, ...images]');
