const fs = require('fs');
const path = require('path');

// Token 估算
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

function truncateLongText(text, max) {
  if (text.length <= max) return text;
  const fp = text.match(/\/[\w\-\.\/]+\.\w+/);
  let prefix = fp ? `[文件: ${fp[0]}] ` : '';
  const avail = max - prefix.length - 30;
  return prefix + text.slice(0, Math.max(avail, 100)) + `\n...[共${text.length}字符]`;
}

function msgToText(msg) {
  const text = contentToString(msg.content);
  if (msg.role === 'user') return `[用户] ${text}`;
  if (msg.role === 'tool') {
    const name = msg.name || 'unknown';
    return estimateTokens(text) > 300 ? `[工具${name}] ${truncateLongText(text, 600)}` : `[工具${name}] ${text}`;
  }
  if (msg.role === 'assistant') {
    if (msg.tool_calls?.length) {
      const tc = msg.tool_calls.map(t => {
        try { return `${t.function.name}(${JSON.stringify(JSON.parse(t.function.arguments||'{}'))})`; } catch { return t.function.name; }
      }).join(',');
      return `[AI] ${text||'(无输出)'}。${tc}`;
    }
    return `[AI] ${text}`;
  }
  return '';
}

const BUDGET = 50000;

function truncateForSummary(msgs) {
  const rev = [...msgs].reverse();
  const result = [];
  let used = 0, skipped = 0;
  for (const m of rev) {
    const t = msgToText(m);
    const tok = estimateTokens(t);
    if (used + tok > BUDGET) {
      if (skipped === 0) result.push(truncateLongText(t, 500));
      else break;
    } else { result.push(t); used += tok; }
    skipped++;
  }
  const text = result.reverse().join('\n\n');
  const skippedCnt = msgs.length - result.length;
  return skippedCnt > 0 ? `[早期${skippedCnt}条消息已截断，共${msgs.length}条]\n\n${text}` : text;
}

async function main() {
  console.log('═'.repeat(60));
  console.log('真实 LLM 压缩测试');
  console.log('═'.repeat(60));

  // 加载数据
  const lines = fs.readFileSync(path.join(__dirname, 'data/sessions/cc_group_grp_21.jsonl'), 'utf-8').trim().split('\n');
  const msgs = lines.map(l => JSON.parse(l)).filter(m => m.role !== 'system');
  const beforeTok = msgs.reduce((s, m) => s + estimateTokens(contentToString(m.content)), 0);
  console.log(`\n消息: ${msgs.length} | 原始Token: ${beforeTok}`);

  // 截断
  const truncated = truncateForSummary(msgs);
  const truncTok = estimateTokens(truncated);
  console.log(`截断后Token: ${truncTok} | 压缩率: ${(100 - truncTok/beforeTok*100).toFixed(1)}%`);
  console.log(`有截断标记: ${truncated.includes('已截断')}`);

  // 调用 LLM
  console.log('\n调用 LLM...');
  const apiKey = process.env.GAUZ_LLM_API_KEY;
  const apiBase = process.env.GAUZ_LLM_API_BASE || 'https://buildsense.asia';

  try {
    const res = await fetch(`${apiBase}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: `请为以下对话生成简短摘要（200字内），包含话题、工作、问题：\n\n${truncated.slice(0, 20000)}` }],
        max_tokens: 500,
        temperature: 0.3
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    const summary = data.choices[0].message.content;
    const sumTok = estimateTokens(summary);
    console.log(`\n✅ LLM成功 | 摘要Token: ${sumTok} | 最终压缩率: ${(100-sumTok/beforeTok*100).toFixed(1)}%`);
    console.log('\n摘要内容:');
    console.log('-'.repeat(60));
    console.log(summary);
  } catch (e) {
    console.log(`\n❌ LLM失败: ${e.message}`);
  }
  console.log('\n' + '═'.repeat(60));
}

main().catch(console.error);
