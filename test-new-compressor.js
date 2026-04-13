/**
 * 测试新的 context-compressor 截断逻辑
 */

const fs = require('fs');
const path = require('path');

function estimateTokens(text) {
  if (!text) return 0;
  const cjkMatches = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const nonCjkCount = text.length - cjkCount;
  return Math.ceil(cjkCount / 1.5 + nonCjkCount / 4);
}

function contentToString(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(block => block.type === 'text' ? block.text : '[图片]').join('');
  }
  return '[图片]';
}

function truncateLongText(text, maxChars) {
  if (text.length <= maxChars) return text;
  const filePathMatch = text.match(/\/[\w\-\.\/]+\.\w+/);
  const lineMatch = text.match(/行?\s*[:：]?\s*(\d+)/);
  let prefix = '';
  if (filePathMatch) prefix += `[文件: ${filePathMatch[0]}] `;
  if (lineMatch) prefix += `[行号: ${lineMatch[1]}] `;
  const availableChars = maxChars - prefix.length - 30;
  if (availableChars > 100) {
    return prefix + text.slice(0, availableChars) + `\n...[共 ${text.length} 字符]`;
  }
  return prefix + text.slice(0, maxChars - 30) + `\n...[共 ${text.length} 字符]`;
}

function messageToSummaryText(msg) {
  if (msg.role === 'user') {
    const text = contentToString(msg.content);
    return { text: `[用户] ${text}`, tokens: estimateTokens(text) + 10 };
  }
  if (msg.role === 'assistant') {
    const text = contentToString(msg.content);
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const toolCalls = msg.tool_calls.map(tc => {
        let argsObj = {};
        try { argsObj = JSON.parse(tc.function.arguments || '{}'); } catch {}
        return `工具调用: ${tc.function.name}(${JSON.stringify(argsObj)})`;
      }).join(', ');
      const fullText = `[AI] ${text || '(无文本输出)'}。${toolCalls}`;
      return { text: fullText, tokens: estimateTokens(fullText) + 10 };
    }
    return { text: `[AI] ${text}`, tokens: estimateTokens(text) + 10 };
  }
  if (msg.role === 'tool') {
    const text = contentToString(msg.content);
    const name = msg.name || 'unknown';
    const tokens = estimateTokens(text);
    if (tokens <= 300) {
      return { text: `[工具 ${name}] ${text}`, tokens: tokens + 10 };
    }
    const truncated = truncateLongText(text, 600);
    return { text: `[工具 ${name}] ${truncated}`, tokens: estimateTokens(truncated) + 10 };
  }
  return { text: '', tokens: 0 };
}

const SUMMARY_CONTENT_BUDGET = 50000;

function truncateForSummary(messages, budget = SUMMARY_CONTENT_BUDGET) {
  const reversed = [...messages].reverse();
  const result = [];
  let usedTokens = 0;
  let skippedCount = 0;

  for (const msg of reversed) {
    const { text, tokens } = messageToSummaryText(msg);
    if (usedTokens + tokens > budget) {
      if (skippedCount === 0) {
        const truncated = truncateLongText(text, 500);
        result.push(truncated);
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

function loadSession(filename) {
  const filepath = path.join(__dirname, 'data/sessions', filename);
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n');
  return lines.map(line => JSON.parse(line));
}

async function runTests() {
  console.log('═'.repeat(70));
  console.log('新截断逻辑测试');
  console.log('═'.repeat(70));

  const session21 = loadSession('cc_group_grp_21.jsonl');
  const sessionMsgs = session21.filter(m => m.role !== 'system');
  
  console.log(`\n📊 测试: cc_group_grp_21`);
  console.log(`Session 消息数: ${sessionMsgs.length}`);
  
  const newTruncated = truncateForSummary(sessionMsgs);
  const newTokens = estimateTokens(newTruncated);
  
  console.log(`\n✅ 新截断结果:`);
  console.log(`   文本长度: ${newTruncated.length} 字符`);
  console.log(`   Token 估算: ${newTokens}`);
  console.log(`   预算使用率: ${(newTokens / SUMMARY_CONTENT_BUDGET * 100).toFixed(1)}%`);
  
  console.log(`\n📌 验证 - 截断文本末尾 (最近的对话):`);
  console.log(`   ${newTruncated.slice(-400).replace(/\n/g, '\\n')}`);
  
  console.log(`\n📌 验证 - 截断标记:`);
  const match = newTruncated.match(/\[早期 (\d+) 条消息已截断.*?\]/);
  if (match) {
    console.log(`   ✅ 找到截断标记: 截断了 ${match[1]} 条消息`);
  } else {
    console.log(`   ⚠️ 未找到截断标记`);
  }

  console.log('\n' + '═'.repeat(70));
  console.log('测试完成!');
  console.log('═'.repeat(70));
}

runTests();
