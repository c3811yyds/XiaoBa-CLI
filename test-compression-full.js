/**
 * 完整压缩机制测试
 * 
 * 用法: node test-compression-full.js
 * 
 * 测试流程:
 * 1. Mock 测试 - 验证压缩逻辑 (truncateForSummary)
 * 2. LLM 摘要生成 - 调用真实 API 生成摘要
 * 3. 完整压缩报告
 */

const fs = require('fs');
const path = require('path');
const { AIService } = require('./dist/utils/ai-service');

// ─── Token 估算 ──────────────────────────────────────────

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

// ─── 截断逻辑 ──────────────────────────────────────────

function truncateLongText(text, maxChars) {
  if (text.length <= maxChars) return text;
  const fp = text.match(/\/[\w\-\.\/]+\.\w+/);
  const lineMatch = text.match(/行?\s*[:：]?\s*(\d+)/);
  let prefix = '';
  if (fp) prefix += `[文件: ${fp[0]}] `;
  if (lineMatch) prefix += `[行号: ${lineMatch[1]}] `;
  const avail = maxChars - prefix.length - 30;
  if (avail > 100) {
    return prefix + text.slice(0, avail) + `\n...[共${text.length}字符]`;
  }
  return prefix + text.slice(0, maxChars - 30) + `\n...[共${text.length}字符]`;
}

function messageToSummaryText(msg) {
  const text = contentToString(msg.content);
  if (msg.role === 'user') return { text: `[用户] ${text}`, tokens: estimateTokens(text) + 10 };
  if (msg.role === 'tool') {
    const name = msg.name || 'unknown';
    const tokens = estimateTokens(text);
    if (tokens <= 300) return { text: `[工具 ${name}] ${text}`, tokens: tokens + 10 };
    return { text: `[工具 ${name}] ${truncateLongText(text, 600)}`, tokens: estimateTokens(truncateLongText(text, 600)) + 10 };
  }
  if (msg.role === 'assistant') {
    if (msg.tool_calls?.length) {
      const tc = msg.tool_calls.map(t => {
        try { return `${t.function.name}(${JSON.stringify(JSON.parse(t.function.arguments || '{}'))})`; }
        catch { return t.function.name; }
      }).join(', ');
      return { text: `[AI] ${text || '(无输出)'}。${tc}`, tokens: estimateTokens(text) + 50 };
    }
    return { text: `[AI] ${text}`, tokens: estimateTokens(text) + 10 };
  }
  return { text: '', tokens: 0 };
}

const SUMMARY_CONTENT_BUDGET = 50000; // ~50K tokens

function truncateForSummary(messages, budget = SUMMARY_CONTENT_BUDGET) {
  const reversed = [...messages].reverse();
  const result = [];
  let usedTokens = 0;
  let skippedCount = 0;

  for (const msg of reversed) {
    const { text, tokens } = messageToSummaryText(msg);
    if (usedTokens + tokens > budget) {
      if (skippedCount === 0) {
        result.push(truncateLongText(text, 500));
      } else {
        break;
      }
    } else {
      result.push(text);
      usedTokens += tokens;
    }
    skippedCount++;
  }

  const truncatedText = result.reverse().join('\n\n');
  const totalSkipped = messages.length - result.length;
  if (totalSkipped > 0) {
    return `[早期 ${totalSkipped} 条消息已截断，共 ${messages.length} 条消息]\n\n${truncatedText}`;
  }
  return truncatedText;
}

// ─── 加载测试数据 ──────────────────────────────────────────

function loadSession(filename) {
  const lines = fs.readFileSync(path.join(__dirname, 'data/sessions', filename), 'utf-8').trim().split('\n');
  return lines.map(l => JSON.parse(l));
}

function estimateMessagesTokens(messages) {
  return messages.reduce((s, m) => s + estimateTokens(contentToString(m.content)), 0);
}

// ─── 主测试 ──────────────────────────────────────────

async function runTests() {
  console.log('═'.repeat(70));
  console.log('Context Compressor 完整测试');
  console.log('═'.repeat(70));

  // 测试数据
  const testFiles = [
    { name: 'cc_group_grp_21.jsonl', desc: '462条消息，未压缩' },
    { name: 'cc_group_grp_12.jsonl', desc: '686条消息，包含压缩摘要' },
  ];

  for (const { name, desc } of testFiles) {
    console.log(`\n📊 测试: ${name} (${desc})`);
    console.log('-'.repeat(70));
    
    const msgs = loadSession(name).filter(m => m.role !== 'system');
    const beforeTokens = estimateMessagesTokens(msgs);
    console.log(`  消息数: ${msgs.length}`);
    console.log(`  原始Token: ${beforeTokens}`);

    // Mock 截断测试
    const truncated = truncateForSummary(msgs);
    const truncTokens = estimateTokens(truncated);
    console.log(`  截断后Token: ${truncTokens}`);
    console.log(`  压缩率: ${(100 - truncTokens / beforeTokens * 100).toFixed(1)}%`);
    console.log(`  包含截断标记: ${truncated.includes('已截断') ? '✅ 是' : '❌ 否'}`);

    // 验证保留的是最新内容
    if (msgs.length > 0) {
      const lastMsg = msgs[msgs.length - 1];
      const lastText = contentToString(lastMsg.content).slice(0, 50);
      const truncatedEnd = truncated.slice(-200);
      const keepsRecent = truncatedEnd.includes(lastText.slice(0, 20)) || lastText.length < 20;
      console.log(`  保留最新内容: ${keepsRecent ? '✅ 是' : '⚠️ 待验证'}`);
    }
  }

  // 真实 LLM 测试
  console.log('\n\n📊 测试: 真实 LLM 摘要生成');
  console.log('-'.repeat(70));
  console.log(`  API: ${process.env.GAUZ_LLM_API_BASE}/v1/chat/completions`);
  console.log(`  Model: ${process.env.GAUZ_LLM_MODEL}`);

  const session21 = loadSession('cc_group_grp_21.jsonl').filter(m => m.role !== 'system');
  const beforeTokens = estimateMessagesTokens(session21);
  
  // 截断到 ~30K tokens
  const truncated = truncateForSummary(session21);
  const truncTokens = estimateTokens(truncated);
  
  console.log(`  截断: ${beforeTokens} -> ${truncTokens} tokens (压缩 ${(100 - truncTokens / beforeTokens * 100).toFixed(1)}%)`);

  // 调用 LLM
  console.log('\n  调用 LLM 生成摘要...');
  const start = Date.now();
  try {
    const ai = new AIService();
    const resp = await ai.chat([{
      role: 'user',
      content: `请为以下对话历史生成简短摘要（200-500字），包含：
1. 主要讨论话题
2. 已完成的工作
3. 正在进行的工作
4. 未解决的问题

对话内容：
${truncated.slice(0, 25000)}`
    }]);

    const elapsed = Date.now() - start;
    const summary = resp.content;
    const sumTokens = estimateTokens(summary);

    console.log(`  ✅ LLM 成功! (${elapsed}ms)`);
    console.log(`  摘要Token: ${sumTokens}`);
    console.log(`  最终压缩率: ${(100 - sumTokens / beforeTokens * 100).toFixed(1)}%`);
    
    console.log('\n  📝 摘要内容:');
    console.log('  ' + '-'.repeat(66));
    console.log('  ' + summary.split('\n').join('\n  '));
    console.log('  ' + '-'.repeat(66));

    // 验证摘要格式
    console.log('\n  📋 格式验证:');
    const hasTopic = summary.includes('话题') || summary.includes('讨论') || summary.includes('主题');
    const hasWork = summary.includes('工作') || summary.includes('完成') || summary.includes('进行');
    const hasQuestion = summary.includes('问题') || summary.includes('未解决') || summary.includes('待处理');
    console.log(`    包含话题: ${hasTopic ? '✅' : '❌'}`);
    console.log(`    包含工作: ${hasWork ? '✅' : '❌'}`);
    console.log(`    包含问题: ${hasQuestion ? '✅' : '❌'}`);

  } catch (e) {
    console.log(`  ❌ LLM 失败: ${e.message}`);
  }

  console.log('\n' + '═'.repeat(70));
  console.log('测试完成!');
  console.log('═'.repeat(70));
}

runTests().catch(console.error);
