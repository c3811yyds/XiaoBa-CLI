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

function estimateMessagesTokens(messages) {
  return messages.reduce((sum, msg) => {
    const text = contentToString(msg.content);
    return sum + estimateTokens(text);
  }, 0);
}

async function callLLM(messages) {
  const apiKey = process.env.GAUZ_LLM_API_KEY;
  const apiBase = process.env.GAUZ_LLM_API_BASE || 'https://buildsense.asia';
  const response = await fetch(`${apiBase}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: messages,
      max_tokens: 2000,
      temperature: 0.3
    })
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error: ${response.status} - ${error}`);
  }
  const data = await response.json();
  return data.choices[0].message.content;
}

async function runTests() {
  console.log('═'.repeat(70));
  console.log('真实 LLM 压缩测试');
  console.log('═'.repeat(70));

  const session21 = loadSession('cc_group_grp_21.jsonl');
  const sessionMsgs = session21.filter(m => m.role !== 'system');
  console.log(`\n📊 测试数据: cc_group_grp_21`);
  console.log(`   消息总数: ${sessionMsgs.length}`);
  const beforeTokens = estimateMessagesTokens(sessionMsgs);
  console.log(`   原始 Token: ${beforeTokens}`);

  console.log('\n📌 步骤 1: 截断对话内容');
  const truncated = truncateForSummary(sessionMsgs, SUMMARY_CONTENT_BUDGET);
  const truncatedTokens = estimateTokens(truncated);
  console.log(`   截断后 Token: ${truncatedTokens}`);
  console.log(`   压缩率: ${(100 - truncatedTokens / beforeTokens * 100).toFixed(1)}%`);
  console.log(`   包含截断标记: ${truncated.includes('已截断')}`);

  console.log('\n📌 步骤 2: 调用 LLM 生成摘要');
  console.log(`   API: ${process.env.GAUZ_LLM_API_BASE}/v1/chat/completions`);
  
  const summaryPrompt = {
    role: 'user',
    content: `请为以下对话历史生成简短摘要（200-500字），包括：
1. 主要讨论话题
2. 已完成的工作
3. 正在进行的工作
4. 未解决的问题

对话内容：
${truncated.slice(0, 25000)}`
  };

  const startTime = Date.now();
  try {
    const summary = await callLLM([summaryPrompt]);
    const elapsed = Date.now() - startTime;
    console.log(`   ✅ LLM 调用成功 (${elapsed}ms)`);
    console.log(`\n📝 生成的摘要:`);
    console.log('-'.repeat(70));
    console.log(summary);
    console.log('-'.repeat(70));
    
    const summaryTokens = estimateTokens(summary);
    console.log(`\n📊 摘要统计:`);
    console.log(`   摘要长度: ${summary.length} 字符`);
    console.log(`   摘要 Token: ${summaryTokens}`);
    console.log(`   原始 Token: ${beforeTokens}`);
    console.log(`   最终压缩率: ${(100 - summaryTokens / beforeTokens * 100).toFixed(1)}%`);

    console.log('\n📌 步骤 3: 验证摘要格式');
    const hasTopic = summary.includes('话题') || summary.includes('讨论') || summary.includes('主题');
    const hasWork = summary.includes('工作') || summary.includes('完成') || summary.includes('进行');
    const hasQuestion = summary.includes('问题') || summary.includes('未解决') || summary.includes('待处理');
    console.log(`   包含话题: ${hasTopic ? '✅' : '❌'}`);
    console.log(`   包含工作: ${hasWork ? '✅' : '❌'}`);
    console.log(`   包含问题: ${hasQuestion ? '✅' : '❌'}`);
  } catch (error) {
    console.log(`   ❌ LLM 调用失败: ${error.message}`);
  }

  console.log('\n' + '═'.repeat(70));
  console.log('测试完成!');
  console.log('═'.repeat(70));
}

runTests().catch(console.error);
