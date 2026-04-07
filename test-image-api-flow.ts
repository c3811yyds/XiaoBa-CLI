/**
 * 完整测试：模拟 read_file 读取图片 -> anthropic-provider 转换 -> API 请求
 */

import * as fs from 'fs';
import * as path from 'path';

// 模拟 createImageBlock 的输出
async function mockCreateImageBlock(filePath: string) {
  const sharp = require('sharp');
  
  const buffer = fs.readFileSync(filePath);
  const image = sharp(buffer);
  const metadata = await image.metadata();
  
  // 模拟压缩逻辑（来自 image-utils.ts）
  let processed = await image
    .resize(1568, 1568, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  
  const base64 = processed.toString('base64');
  const estimatedTokens = Math.ceil((base64.length * 4 / 3) * 0.125);
  
  return {
    imageBlock: {
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: base64,
      },
      filePath,
    },
    stats: {
      originalSize: buffer.length,
      compressedSize: processed.length,
      base64Length: base64.length,
      estimatedTokens,
      originalDimensions: `${metadata.width}x${metadata.height}`,
    }
  };
}

// 模拟 anthropic-provider 的转换
function transformToAnthropicFormat(toolMessage: any) {
  const content = Array.isArray(toolMessage.content)
    ? toolMessage.content.map((block: any) =>
        block.type === 'text'
          ? { type: 'text' as const, text: block.text }
          : { type: 'image' as const, source: block.source }
      )
    : toolMessage.content || '';
  
  return {
    type: 'tool_result',
    tool_use_id: toolMessage.tool_call_id,
    content
  };
}

async function testImageProcessing(imagePath: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`测试图片: ${path.basename(imagePath)}`);
  console.log('='.repeat(80));
  
  try {
    // 1. 检查文件是否存在
    if (!fs.existsSync(imagePath)) {
      console.log('❌ 文件不存在');
      return;
    }
    
    // 2. 模拟 createImageBlock
    console.log('\n[步骤1] 创建 imageBlock...');
    const { imageBlock, stats } = await mockCreateImageBlock(imagePath);
    
    console.log('原始大小:', (stats.originalSize / 1024).toFixed(2), 'KB');
    console.log('压缩后大小:', (stats.compressedSize / 1024).toFixed(2), 'KB');
    console.log('Base64 长度:', stats.base64Length, '字符');
    console.log('估算 tokens:', stats.estimatedTokens);
    console.log('原始尺寸:', stats.originalDimensions);
    
    // 3. 模拟 conversation-runner 创建 tool result
    console.log('\n[步骤2] 创建 tool result message...');
    const toolMessage = {
      role: 'tool',
      content: [
        { type: 'text', text: `已读取图片: ${imagePath}` },
        imageBlock,
      ],
      tool_call_id: 'toolu_test_123',
    };
    
    // 4. 模拟 anthropic-provider 转换
    console.log('\n[步骤3] 转换为 Anthropic 格式...');
    const transformed = transformToAnthropicFormat(toolMessage);
    
    // 5. 检查转换后的数据
    console.log('\n[步骤4] 检查转换结果...');
    const imageContent = transformed.content.find((b: any) => b.type === 'image');
    
    if (imageContent) {
      console.log('✓ 找到 image block');
      console.log('  - type:', imageContent.type);
      console.log('  - source.type:', imageContent.source.type);
      console.log('  - source.media_type:', imageContent.source.media_type);
      console.log('  - source.data 长度:', imageContent.source.data.length);
      console.log('  - 有 filePath?', 'filePath' in imageContent ? '❌ 是' : '✓ 否');
      
      // 检查是否超过限制
      const sizeMB = (imageContent.source.data.length * 3 / 4) / (1024 * 1024);
      console.log('  - 解码后大小:', sizeMB.toFixed(2), 'MB');
      
      if (sizeMB > 5) {
        console.log('  ⚠️  警告：图片超过 5MB，可能被 Anthropic API 拒绝');
      }
      
      // 检查 base64 格式
      const isValidBase64 = /^[A-Za-z0-9+/]*={0,2}$/.test(imageContent.source.data);
      console.log('  - Base64 格式:', isValidBase64 ? '✓ 有效' : '❌ 无效');
      
    } else {
      console.log('❌ 未找到 image block');
    }
    
    // 6. 模拟 API 请求体
    console.log('\n[步骤5] 生成 API 请求体...');
    const apiRequest = {
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [transformed]
        }
      ]
    };
    
    const requestJson = JSON.stringify(apiRequest);
    const requestSizeMB = (requestJson.length / (1024 * 1024)).toFixed(2);
    console.log('请求体大小:', requestSizeMB, 'MB');
    
    if (parseFloat(requestSizeMB) > 10) {
      console.log('⚠️  警告：请求体超过 10MB，可能被拒绝');
    }
    
    console.log('\n✅ 测试完成');
    
  } catch (error: any) {
    console.log('\n❌ 测试失败:', error.message);
    console.log(error.stack);
  }
}

// 主测试函数
async function main() {
  console.log('图片处理完整流程测试');
  console.log('目的：复现 Anthropic API 400 错误');
  
  // 测试用例
  const testImages = [
    '/Users/zhuhanyuan/Downloads/xiaoba-demo-images/开始对话.png',
    '/Users/zhuhanyuan/Downloads/xiaoba-demo-images/分析截图1.png',
  ];
  
  for (const imagePath of testImages) {
    await testImageProcessing(imagePath);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('所有测试完成');
  console.log('='.repeat(80));
}

main().catch(console.error);
