/**
 * 测试：模拟真实的对话场景，包含历史消息 + 多张图片
 */

import * as fs from 'fs';

async function mockCreateImageBlock(filePath: string) {
  const sharp = require('sharp');
  const buffer = fs.readFileSync(filePath);
  let processed = await sharp(buffer)
    .resize(1568, 1568, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/jpeg',
      data: processed.toString('base64'),
    },
    filePath,
  };
}

async function testRealScenario() {
  console.log('模拟真实对话场景测试\n');
  
  // 1. 模拟恢复的历史消息（11条）
  const historyMessages = [
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '你好！有什么可以帮你的？' },
    { role: 'user', content: '帮我看看这个文档' },
    { role: 'assistant', content: '好的，请上传文档' },
    { role: 'user', content: [
      { type: 'text', text: '这是文档' },
      { type: 'text', text: '[图片: /path/to/old-image.png]' }  // ← 历史图片被替换成占位符
    ]},
    { role: 'assistant', content: '我看到了，需要什么分析？' },
    { role: 'user', content: '分析一下内容' },
    { role: 'assistant', content: '好的，正在分析...' },
    { role: 'tool', content: '分析结果...', tool_call_id: 'old_tool_1', name: 'analyze' },
    { role: 'assistant', content: '分析完成，还有其他问题吗？' },
    { role: 'user', content: '再看看这两张截图' },
  ];
  
  console.log(`[历史消息] ${historyMessages.length} 条`);
  
  // 2. 模拟当前轮的两个 read_file 调用
  console.log('\n[当前轮] 读取两张图片...');
  
  const image1 = await mockCreateImageBlock('/Users/zhuhanyuan/Downloads/xiaoba-demo-images/开始对话.png');
  const image2 = await mockCreateImageBlock('/Users/zhuhanyuan/Downloads/xiaoba-demo-images/分析截图1.png');
  
  console.log('图片1 base64:', image1.source.data.length, '字符');
  console.log('图片2 base64:', image2.source.data.length, '字符');
  
  // 3. 构建 assistant 消息（带 tool_calls）
  const assistantWithTools = {
    role: 'assistant',
    content: '好主意，先让我看看现有截图内容。',
    tool_calls: [
      {
        id: 'toolu_01SqONYFkZxSK7XJ7AnNkgU8',
        type: 'function',
        function: { name: 'read_file', arguments: '{"file_path":"/Users/zhuhanyuan/Downloads/xiaoba-demo-images/开始对话.png"}' }
      },
      {
        id: 'toolu_01xKb89AMZkRtIZuqZo6ATWs',
        type: 'function',
        function: { name: 'read_file', arguments: '{"file_path":"/Users/zhuhanyuan/Downloads/xiaoba-demo-images/分析截图1.png"}' }
      }
    ]
  };
  
  // 4. 构建 tool result 消息
  const toolResult1 = {
    role: 'tool',
    content: [
      { type: 'text', text: '已读取图片: /Users/zhuhanyuan/Downloads/xiaoba-demo-images/开始对话.png' },
      image1,
    ],
    tool_call_id: 'toolu_01SqONYFkZxSK7XJ7AnNkgU8',
    name: 'read_file',
  };
  
  const toolResult2 = {
    role: 'tool',
    content: [
      { type: 'text', text: '已读取图片: /Users/zhuhanyuan/Downloads/xiaoba-demo-images/分析截图1.png' },
      image2,
    ],
    tool_call_id: 'toolu_01xKb89AMZkRtIZuqZo6ATWs',
    name: 'read_file',
  };
  
  // 5. 组合完整的消息数组
  const allMessages = [
    ...historyMessages,
    assistantWithTools,
    toolResult1,
    toolResult2,
  ];
  
  console.log(`\n[完整上下文] ${allMessages.length} 条消息`);
  
  // 6. 模拟 anthropic-provider 的转换
  console.log('\n[转换] 转换为 Anthropic 格式...');
  
  const transformedMessages: any[] = [];
  let pendingToolResults: any[] = [];
  
  for (const msg of allMessages) {
    const msgAny = msg as any;
    if (msgAny.role === 'tool') {
      // 转换 tool result
      const content = Array.isArray(msgAny.content)
        ? msgAny.content.map((block: any) =>
            block.type === 'text'
              ? { type: 'text', text: block.text }
              : { type: 'image', source: block.source }
          )
        : msgAny.content || '';
      
      pendingToolResults.push({
        type: 'tool_result',
        tool_use_id: msgAny.tool_call_id,
        content
      });
    } else {
      // flush pending tool results
      if (pendingToolResults.length > 0) {
        // 检查是否有图片需要提取
        const contentBlocks: any[] = [];
        
        for (const toolResult of pendingToolResults) {
          if (Array.isArray(toolResult.content)) {
            const textBlocks = toolResult.content.filter((b: any) => b.type === 'text');
            const imageBlocks = toolResult.content.filter((b: any) => b.type === 'image');
            
            // tool_result 只保留 text
            contentBlocks.push({
              type: 'tool_result',
              tool_use_id: toolResult.tool_use_id,
              content: textBlocks.length > 0 ? textBlocks[0].text : ''
            });
            
            // 图片作为独立 block
            for (const imageBlock of imageBlocks) {
              contentBlocks.push(imageBlock);
            }
          } else {
            contentBlocks.push(toolResult);
          }
        }
        
        transformedMessages.push({
          role: 'user',
          content: contentBlocks
        });
        pendingToolResults = [];
      }
      
      // 添加当前消息
      if (msgAny.role === 'user') {
        transformedMessages.push({ role: 'user', content: msgAny.content });
      } else if (msgAny.role === 'assistant') {
        if (msgAny.tool_calls) {
          const blocks: any[] = [];
          if (msgAny.content) blocks.push({ type: 'text', text: msgAny.content });
          for (const tc of msgAny.tool_calls) {
            blocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments)
            });
          }
          transformedMessages.push({ role: 'assistant', content: blocks });
        } else {
          transformedMessages.push({ role: 'assistant', content: msgAny.content });
        }
      }
    }
  }
  
  // flush remaining
  if (pendingToolResults.length > 0) {
    const contentBlocks: any[] = [];
    for (const toolResult of pendingToolResults) {
      if (Array.isArray(toolResult.content)) {
        const textBlocks = toolResult.content.filter((b: any) => b.type === 'text');
        const imageBlocks = toolResult.content.filter((b: any) => b.type === 'image');
        
        contentBlocks.push({
          type: 'tool_result',
          tool_use_id: toolResult.tool_use_id,
          content: textBlocks.length > 0 ? textBlocks[0].text : ''
        });
        
        for (const imageBlock of imageBlocks) {
          contentBlocks.push(imageBlock);
        }
      } else {
        contentBlocks.push(toolResult);
      }
    }
    
    transformedMessages.push({
      role: 'user',
      content: contentBlocks
    });
  }
  
  console.log(`转换后: ${transformedMessages.length} 条消息`);
  
  // 7. 检查最后一条消息（包含两张图片的 tool results）
  const lastMessage = transformedMessages[transformedMessages.length - 1];
  console.log('\n[最后一条消息]');
  console.log('role:', lastMessage.role);
  console.log('content 类型:', Array.isArray(lastMessage.content) ? 'array' : 'string');
  
  if (Array.isArray(lastMessage.content)) {
    console.log('content blocks:', lastMessage.content.length);
    lastMessage.content.forEach((block: any, i: number) => {
      console.log(`  [${i}] type: ${block.type}`);
      if (block.type === 'tool_result') {
        console.log(`      tool_use_id: ${block.tool_use_id}`);
        console.log(`      content: ${typeof block.content === 'string' ? block.content.slice(0, 50) : 'array'}`);
      } else if (block.type === 'image') {
        console.log(`      source.data 长度: ${block.source.data.length}`);
        console.log(`      有 filePath? ${'filePath' in block ? '❌ 是' : '✓ 否'}`);
      }
    });
  }
  
  // 8. 生成完整的 API 请求
  const apiRequest = {
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    messages: transformedMessages,
  };
  
  const requestJson = JSON.stringify(apiRequest);
  const requestSizeMB = (requestJson.length / (1024 * 1024)).toFixed(2);
  
  console.log('\n[API 请求]');
  console.log('请求体大小:', requestSizeMB, 'MB');
  console.log('消息数:', transformedMessages.length);
  
  // 9. 检查潜在问题
  console.log('\n[问题检查]');
  
  // 检查是否有连续的 user 消息
  let hasConsecutiveUser = false;
  for (let i = 1; i < transformedMessages.length; i++) {
    if (transformedMessages[i].role === 'user' && transformedMessages[i-1].role === 'user') {
      hasConsecutiveUser = true;
      console.log(`⚠️  发现连续的 user 消息: 索引 ${i-1} 和 ${i}`);
    }
  }
  if (!hasConsecutiveUser) {
    console.log('✓ 没有连续的 user 消息');
  }
  
  // 检查是否有空 content
  const emptyContent = transformedMessages.filter((m: any) => !m.content || (Array.isArray(m.content) && m.content.length === 0));
  if (emptyContent.length > 0) {
    console.log(`⚠️  发现 ${emptyContent.length} 条空 content 消息`);
  } else {
    console.log('✓ 所有消息都有 content');
  }
  
  console.log('\n✅ 测试完成');
}

testRealScenario().catch(console.error);
