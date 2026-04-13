/**
 * 测试 GLM-4V 支持的 content 类型
 */

import axios from 'axios';

const API_KEY = '782190206e9942b8aea2cc57c62056d9.x38ciYt0uki015Vp';
const MODEL = 'glm-4v';
const API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

async function testContentTypes() {
  const fs = require('fs');
  const sharp = require('sharp');
  
  // 读取图片
  const buffer = fs.readFileSync('/Users/zhuhanyuan/Downloads/xiaoba-demo-images/开始对话.png');
  const processed = await sharp(buffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  const base64Image = processed.toString('base64');
  
  const tests = [
    {
      name: '只有 image_url',
      content: [
        { type: 'text', text: '描述图片' },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
      ]
    },
    {
      name: '只有 text',
      content: [
        { type: 'text', text: '你好' }
      ]
    },
  ];

  for (const test of tests) {
    console.log(`\n测试: ${test.name}`);
    try {
      const response = await axios.post(API_URL, {
        model: MODEL,
        messages: [{ role: 'user', content: test.content }],
        max_tokens: 100,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        timeout: 30000,
      });
      console.log('✅ 成功');
      console.log('响应:', JSON.stringify(response.data).slice(0, 200));
    } catch (error: any) {
      console.log('❌ 失败:', error.response?.data?.error?.message || error.message);
    }
  }
}

async function testToolResultFormats() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 tool_result 相关格式');
  
  const fs = require('fs');
  const sharp = require('sharp');
  
  const buffer = fs.readFileSync('/Users/zhuhanyuan/Downloads/xiaoba-demo-images/开始对话.png');
  const processed = await sharp(buffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  const base64Image = processed.toString('base64');
  
  // 测试不同的 tool_result 格式
  const tests = [
    {
      name: 'tool_result with text content',
      content: [
        { type: 'tool_result', tool_use_id: '123', content: '图片已读取: /path/to/image.png' },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
      ]
    },
    {
      name: '把图片信息放到 text 中',
      content: [
        { type: 'text', text: '[图片: /path/to/image.png]' },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
      ]
    },
  ];

  for (const test of tests) {
    console.log(`\n测试: ${test.name}`);
    try {
      const response = await axios.post(API_URL, {
        model: MODEL,
        messages: [{ role: 'user', content: test.content }],
        max_tokens: 100,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        timeout: 30000,
      });
      console.log('✅ 成功');
      console.log('响应:', JSON.stringify(response.data).slice(0, 200));
    } catch (error: any) {
      console.log('❌ 失败:', error.response?.data?.error?.message || error.message);
    }
  }
}

async function testMultiImages() {
  console.log('\n' + '='.repeat(60));
  console.log('测试多图片');
  
  const fs = require('fs');
  const sharp = require('sharp');
  
  // 两张图片
  const img1 = await sharp(fs.readFileSync('/Users/zhuhanyuan/Downloads/xiaoba-demo-images/开始对话.png'))
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  const img2 = await sharp(fs.readFileSync('/Users/zhuhanyuan/Downloads/xiaoba-demo-images/分析截图1.png'))
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  
  // 测试正确顺序：text -> image_url -> text -> image_url
  const tests = [
    {
      name: 'text + img1 + img2',
      content: [
        { type: 'text', text: '图片1:' },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img1.toString('base64')}` } },
        { type: 'text', text: '图片2:' },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img2.toString('base64')}` } },
      ]
    },
    {
      name: 'img1 + img2 + text',
      content: [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img1.toString('base64')}` } },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img2.toString('base64')}` } },
        { type: 'text', text: '请分析这两张图片' },
      ]
    },
  ];

  for (const test of tests) {
    console.log(`\n测试: ${test.name}`);
    try {
      const response = await axios.post(API_URL, {
        model: MODEL,
        messages: [{ role: 'user', content: test.content }],
        max_tokens: 100,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        timeout: 60000,
      });
      console.log('✅ 成功');
      console.log('响应:', JSON.stringify(response.data).slice(0, 200));
    } catch (error: any) {
      console.log('❌ 失败:', error.response?.data?.error?.message || error.message);
    }
  }
}

async function main() {
  await testContentTypes();
  await testToolResultFormats();
  await testMultiImages();
}

main().catch(console.error);
