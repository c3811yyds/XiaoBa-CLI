// 测试 API 是否可达
const { AIService } = require('./dist/utils/ai-service');
const fs = require('fs');
const path = require('path');

async function test() {
  console.log('测试 GAUZ_LLM API...');
  console.log('API_BASE:', process.env.GAUZ_LLM_API_BASE);
  console.log('PROVIDER:', process.env.GAUZ_LLM_PROVIDER);
  console.log('MODEL:', process.env.GAUZ_LLM_MODEL);
  
  const ai = new AIService();
  const start = Date.now();
  
  try {
    const resp = await ai.chat([
      { role: 'user', content: 'say hi in 3 words' }
    ]);
    console.log('\n✅ API 成功!');
    console.log('耗时:', Date.now() - start, 'ms');
    console.log('响应:', resp.content);
  } catch (e) {
    console.log('\n❌ API 失败:', e.message);
  }
}

test();
