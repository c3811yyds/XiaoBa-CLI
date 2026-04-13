const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const apiKey = process.env.GAUZ_LLM_API_KEY;
const apiBase = process.env.GAUZ_LLM_API_BASE || 'https://buildsense.asia';

function estimateTokens(text) {
  if (!text) return 0;
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]/g) || []).length;
  return Math.ceil(cjk / 1.5 + (text.length - cjk) / 4);
}

function contentToString(c) {
  if (!c) return '';
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(b => b.type === 'text' ? b.text : '[图片]').join('');
  return '[图片]';
}

function loadSession(filename) {
  const lines = fs.readFileSync(path.join(__dirname, 'data/sessions', filename), 'utf-8').trim().split('\n');
  return lines.map(l => JSON.parse(l));
}

function callLLMStream(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: messages,
      max_tokens: 500,
      temperature: 0.3,
      stream: true
    });

    // 先写请求体到临时文件（避免shell转义问题）
    const tmpFile = '/tmp/llm_request.json';
    fs.writeFileSync(tmpFile, body);

    const curl = spawn('curl', [
      '-s', '-N', '--max-time', '30',
      '-X', 'POST',
      '-H', 'Content-Type: application/json',
      '-H', `Authorization: Bearer ${apiKey}`,
      '-d', `@${tmpFile}`,
      `${apiBase}/v1/chat/completions`
    ]);

    let full = '';
    curl.stdout.on('data', chunk => {
      process.stdout.write(chunk.toString());
      full += chunk.toString();
    });
    curl.stderr.on('data', chunk => {
      process.stderr.write(chunk.toString());
    });
    curl.on('close', code => {
      if (code !== 0) reject(new Error(`curl exit code: ${code}`));
      resolve(full);
    });
    curl.on('error', e => reject(e));
  });
}

async function main() {
  console.log('═'.repeat(60));
  console.log('流式 LLM 压缩测试 (curl)');
  console.log(`API: ${apiBase}/v1/chat/completions`);
  console.log('═'.repeat(60));

  // 加载数据
  const msgs = loadSession('cc_group_grp_21.jsonl').filter(m => m.role !== 'system');
  const beforeTok = msgs.reduce((s, m) => s + estimateTokens(contentToString(m.content)), 0);
  console.log(`\n消息: ${msgs.length} | 原始Token: ${beforeTok}`);

  // 截断（保留最近50条）
  const truncated = msgs.slice(-50).map(m => {
    const t = contentToString(m.content);
    if (m.role === 'user') return `[用户] ${t.slice(0, 200)}`;
    if (m.role === 'assistant') return `[AI] ${t.slice(0, 300)}`;
    if (m.role === 'tool') return `[工具${m.name||''}] ${t.slice(0, 150)}`;
    return '';
  }).join('\n\n');
  const truncTok = estimateTokens(truncated);
  console.log(`截断后Token: ${truncTok}`);

  // 流式调用
  console.log('\n调用 LLM (流式):\n');
  const start = Date.now();
  try {
    await callLLMStream([{
      role: 'user',
      content: `请为以下对话生成简短摘要（200字内），包含话题、工作、问题：\n\n${truncated.slice(0, 5000)}`
    }]);
    console.log(`\n耗时: ${Date.now() - start}ms`);
    console.log('═'.repeat(60));
  } catch (e) {
    console.log(`\n❌ 失败: ${e.message}`);
  }
}

main();
