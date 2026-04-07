/**
 * 完整模拟 anthropic-provider 的转换流程
 */

// 1. 模拟 conversation-runner 创建的 tool result message
const toolMessage = {
  role: 'tool',
  content: [
    { type: 'text', text: '已读取图片: /path/to/image.png' },
    { 
      type: 'image', 
      source: { type: 'base64', media_type: 'image/jpeg', data: 'xxx' },
      filePath: '/path/to/image.png'  // ← 这个字段来自 createImageBlock
    }
  ],
  tool_call_id: 'toolu_123',
};

// 2. anthropic-provider 第 104-110 行的转换
const content = Array.isArray(toolMessage.content)
  ? toolMessage.content.map((block: any) =>
      block.type === 'text'
        ? { type: 'text' as const, text: block.text }
        : { type: 'image' as const, source: block.source }  // ← 只取 type 和 source
    )
  : toolMessage.content || '';

console.log('=== 步骤2：转换后的 content ===');
console.log(JSON.stringify(content, null, 2));

// 3. 放入 pendingToolResults
const pendingToolResults = [{
  type: 'tool_result',
  tool_use_id: toolMessage.tool_call_id,
  content
}];

// 4. flushToolResults 中的处理（第 62-87 行）
const toolResult = pendingToolResults[0];
const imageBlocks = toolResult.content.filter((b: any) => b.type === 'image');

console.log('\n=== 步骤4：filter 后的 imageBlocks ===');
console.log(JSON.stringify(imageBlocks, null, 2));

console.log('\n=== 检查 ===');
console.log('imageBlocks[0] 有 filePath?', 'filePath' in imageBlocks[0]);

console.log('\n=== 结论 ===');
if ('filePath' in imageBlocks[0]) {
  console.log('❌ BUG 确认：filePath 仍然存在！');
  console.log('原因：第 104-110 行的 map 创建了新对象，但没有过滤掉 filePath');
} else {
  console.log('✅ 没有问题：filePath 已被过滤');
}
