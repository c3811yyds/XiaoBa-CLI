/**
 * 测试脚本：使用 GLM-5V-Turbo 测试图片处理
 */

import axios from 'axios';

// 从环境变量读取配置
const API_KEY = process.env.GLM_API_KEY || 'YOUR_API_KEY';
const MODEL = process.env.GLM_MODEL || 'glm-4v';
const API_URL = process.env.GLM_API_URL || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

async function testGLMVision() {
  console.log('配置:');
  console.log('  API URL:', API_URL);
  console.log('  Model:', MODEL);
  console.log('  API Key:', API_KEY ? `${API_KEY.slice(0, 10)}...` : '未设置');
  console.log('');

  if (!API_KEY || API_KEY === 'YOUR_API_KEY') {
    console.log('❌ 请设置 GLM_API_KEY 环境变量');
    console.log('  export GLM_API_KEY=your_api_key_here');
    return;
  }

  // 读取测试图片
  const fs = require('fs');
  const path = require('path');
  const imagePath = '/Users/zhuhanyuan/Downloads/xiaoba-demo-images/开始对话.png';
  
  if (!fs.existsSync(imagePath)) {
    console.log('❌ 测试图片不存在:', imagePath);
    return;
  }

  // 读取并压缩图片
  const sharp = require('sharp');
  const buffer = fs.readFileSync(imagePath);
  const processed = await sharp(buffer)
    .resize(1568, 1568, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  
  const base64Image = processed.toString('base64');
  console.log(`图片大小: ${(processed.length / 1024).toFixed(2)} KB`);
  console.log('');

  // 构建请求体（OpenAI 兼容格式）
  const requestBody = {
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: '请描述这张图片的内容。'
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`
            }
          }
        ]
      }
    ],
    max_tokens: 1000,
  };

  console.log('请求体:');
  console.log(JSON.stringify(requestBody, null, 2).slice(0, 500) + '...');
  console.log('');

  try {
    console.log('发送请求...');
    const response = await axios.post(API_URL, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      timeout: 60000,
    });

    console.log('\n✅ 响应成功!');
    console.log('响应:', JSON.stringify(response.data, null, 2).slice(0, 500));
  } catch (error: any) {
    console.log('\n❌ 请求失败:');
    if (error.response) {
      console.log('  状态码:', error.response.status);
      console.log('  响应:', JSON.stringify(error.response.data, null, 2).slice(0, 500));
    } else {
      console.log('  错误:', error.message);
    }
  }
}

// 测试多图片场景（复现问题）
async function testMultiImages() {
  console.log('\n' + '='.repeat(80));
  console.log('测试多图片场景（复现 tool_result + image 交替问题）');
  console.log('='.repeat(80));
  console.log('');

  if (!API_KEY || API_KEY === 'YOUR_API_KEY') {
    console.log('❌ 请设置 GLM_API_KEY 环境变量');
    return;
  }

  const fs = require('fs');
  const sharp = require('sharp');

  // 读取两张图片
  const images = [
    '/Users/zhuhanyuan/Downloads/xiaoba-demo-images/开始对话.png',
    '/Users/zhuhanyuan/Downloads/xiaoba-demo-images/分析截图1.png',
  ];

  const base64Images = [];
  for (const imagePath of images) {
    if (!fs.existsSync(imagePath)) {
      console.log('❌ 图片不存在:', imagePath);
      return;
    }
    const buffer = fs.readFileSync(imagePath);
    const processed = await sharp(buffer)
      .resize(1568, 1568, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    base64Images.push(processed.toString('base64'));
    console.log(`图片 ${base64Images.length}: ${(processed.length / 1024).toFixed(2)} KB`);
  }

  // 模拟当前错误格式：tool_result 和 image 交替
  const wrongFormatMessages = [
    { role: 'user', content: '请分析这两张截图' },
    {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'id1', content: '已读取图片1' },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Images[0]}` } },
        { type: 'tool_result', tool_use_id: 'id2', content: '已读取图片2' },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Images[1]}` } },
      ]
    }
  ];

  // 正确格式：tool_result 在前，image 在后
  const correctFormatMessages = [
    { role: 'user', content: '请分析这两张截图' },
    {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'id1', content: '已读取图片1' },
        { type: 'tool_result', tool_use_id: 'id2', content: '已读取图片2' },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Images[0]}` } },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Images[1]}` } },
      ]
    }
  ];

  console.log('\n测试正确格式...');
  try {
    const response = await axios.post(API_URL, {
      model: MODEL,
      messages: correctFormatMessages,
      max_tokens: 1000,
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      timeout: 60000,
    });
    console.log('✅ 正确格式成功!');
    console.log('响应:', JSON.stringify(response.data, null, 2).slice(0, 300));
  } catch (error: any) {
    console.log('❌ 正确格式失败:');
    if (error.response) {
      console.log('  状态码:', error.response.status);
      console.log('  响应:', JSON.stringify(error.response.data, null, 2).slice(0, 300));
    } else {
      console.log('  错误:', error.message);
    }
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--multi')) {
    await testMultiImages();
  } else {
    await testGLMVision();
  }
}

main().catch(console.error);
