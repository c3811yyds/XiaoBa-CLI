/**
 * 端到端测试：模拟完整的压缩流程
 * 验证 LLM 摘要质量和输出
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// 复制 context-compressor 的逻辑
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

const COMPACT_NO_TOOLS_PREAMBLE = `CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.

- Do NOT use Read, Bash, Grep, Glob, Edit, Write, or ANY other tool.
- You already have all the context you need in the conversation above.
- Tool calls will be REJECTED and will waste your only turn.
- Your entire response must be plain text: an <analysis> block followed by a <summary> block.`;

const BASE_COMPACT_PROMPT = `Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your previous actions.
This summary should be thorough in capturing technical details, code patterns, and architectural decisions that would be essential for continuing development work without losing context.

Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points.

Your summary should include the following sections:

1. Primary Request and Intent: Capture all of the user's explicit requests and intents in detail
2. Key Technical Concepts: List all important technical concepts, technologies, and frameworks discussed.
3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created.
4. Errors and fixes: List all errors that you ran into, and how you fixed them.
5. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.
6. All user messages: List ALL user messages (not tool results) from the conversation.
7. Pending Tasks: Outline any pending tasks that you have explicitly been asked to work on.
8. Current Work: Describe in detail precisely what was being worked on immediately before this summary request.
9. Optional Next Step: List the next step that you will take that is related to the most recent work you were doing.

Please provide your summary based on the conversation so far, following this structure.`;

// 调用 LLM
async function callLLM(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      messages: messages,
      max_tokens: 4000,
      stream: false
    });

    const options = {
      hostname: 'api.minimaxi.chat',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MINIMAXI_API_KEY || 'your-api-key'}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.error) {
            reject(new Error(result.error.message || 'API error'));
          } else {
            resolve(result.choices[0].message.content);
          }
        } catch (e) {
          reject(new Error(`Parse error: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function loadSession(filename) {
  const filepath = path.join('/Users/zhuhanyuan/Documents/xiaoba/data/sessions', filename);
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n');
  return lines.map(line => JSON.parse(line));
}

async function runE2ETest() {
  console.log('═'.repeat(70));
  console.log('端到端测试：压缩流程 + LLM 摘要');
  console.log('═'.repeat(70));

  // 加载 session
  const session = loadSession('cc_group_grp_21.jsonl');
  const sessionMsgs = session.filter(m => m.role !== 'system');
  
  console.log(`\n📊 Session 信息:`);
  console.log(`   总消息数: ${sessionMsgs.length}`);
  
  // Step 1: 截断
  console.log(`\n📊 Step 1: 截断内容`);
  console.log('-'.repeat(70));
  
  const truncated = truncateForSummary(sessionMsgs);
  const truncatedTokens = estimateTokens(truncated);
  
  console.log(`   截断后长度: ${truncated.length} 字符`);
  console.log(`   截断后 tokens: ~${truncatedTokens}`);
  console.log(`   预算使用率: ${(truncatedTokens / SUMMARY_CONTENT_BUDGET * 100).toFixed(1)}%`);
  
  const truncatedInfo = truncated.match(/\[早期 (\d+) 条消息已截断.*?\]/);
  if (truncatedInfo) {
    console.log(`   ✅ 截断标记: ${truncatedInfo[0]}`);
  }
  
  // Step 2: 构建 prompt
  console.log(`\n📊 Step 2: 构建 LLM Prompt`);
  console.log('-'.repeat(70));
  
  const systemPrompt = COMPACT_NO_TOOLS_PREAMBLE + '\n\n' + BASE_COMPACT_PROMPT;
  const systemTokens = estimateTokens(systemPrompt);
  
  console.log(`   System prompt: ${systemTokens} tokens`);
  console.log(`   对话内容: ${truncatedTokens} tokens`);
  console.log(`   总输入: ~${systemTokens + truncatedTokens} tokens`);
  
  // Step 3: 调用 LLM
  console.log(`\n📊 Step 3: 调用 LLM 生成摘要`);
  console.log('-'.repeat(70));
  
  const llmMessages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Please summarize the following ${sessionMsgs.length} messages:\n\n${truncated}` }
  ];
  
  console.log(`   调用中...`);
  const startTime = Date.now();
  
  try {
    const summary = await callLLM(llmMessages);
    const elapsed = Date.now() - startTime;
    
    console.log(`   ✅ 成功! 耗时: ${elapsed}ms`);
    console.log(`   摘要长度: ${summary.length} 字符`);
    console.log(`   摘要 tokens: ~${estimateTokens(summary)}`);
    
    // 解析摘要
    console.log(`\n📊 Step 4: 摘要内容`);
    console.log('-'.repeat(70));
    
    // 提取 <summary> 标签内容
    const summaryMatch = summary.match(/<summary>([\s\S]*?)<\/summary>/i);
    const cleanSummary = summaryMatch ? summaryMatch[1].trim() : summary;
    
    console.log(`\n${cleanSummary.slice(0, 1500)}`);
    if (cleanSummary.length > 1500) {
      console.log(`\n... (省略 ${cleanSummary.length - 1500} 字符)`);
    }
    
    // Step 5: 验证
    console.log(`\n📊 Step 5: 验证`);
    console.log('-'.repeat(70));
    
    console.log(`   ✅ 摘要包含 "Request/Intent": ${cleanSummary.includes('Request') || cleanSummary.includes('Intent')}`);
    console.log(`   ✅ 摘要包含 "Technical Concepts": ${cleanSummary.includes('Technical') || cleanSummary.includes('技术')}`);
    console.log(`   ✅ 摘要包含 "Files": ${cleanSummary.includes('Files') || cleanSummary.includes('文件')}`);
    console.log(`   ✅ 摘要包含 "Pending Tasks": ${cleanSummary.includes('Pending') || cleanSummary.includes('待')}`);
    
    // 压缩效果
    console.log(`\n📊 压缩效果`);
    console.log('-'.repeat(70));
    
    const originalTokens = sessionMsgs.reduce((sum, m) => {
      const content = contentToString(m.content);
      let tokens = estimateTokens(content) + 10;
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          tokens += estimateTokens(tc.function.arguments) + 10;
        }
      }
      return sum + tokens;
    }, 0);
    
    const summaryTokens = estimateTokens(cleanSummary);
    const compressionRatio = ((1 - summaryTokens / originalTokens) * 100).toFixed(1);
    
    console.log(`   原始 messages: ~${originalTokens} tokens`);
    console.log(`   压缩后 summary: ~${summaryTokens} tokens`);
    console.log(`   压缩率: ${compressionRatio}%`);
    
  } catch (err) {
    console.log(`   ❌ 失败: ${err.message}`);
    console.log(`   \n提示: 需要设置 MINIMAXI_API_KEY 环境变量`);
  }

  console.log('\n' + '═'.repeat(70));
  console.log('测试完成!');
  console.log('═'.repeat(70));
}

runE2ETest();
