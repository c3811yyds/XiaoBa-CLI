/**
 * Context Compressor 验证脚本 (JS 版本)
 * 
 * 用法: node test-compressor-verify.js
 */

const fs = require('fs');
const path = require('path');

// 简化版 token 估算
function estimateTokens(text) {
  if (!text) return 0;
  // CJK 字符匹配
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

function messagesToConversationText(messages) {
  const lines = [];
  for (const msg of messages) {
    if (msg.role === 'user') {
      const text = contentToString(msg.content);
      lines.push(`[用户] ${text}`);
    } else if (msg.role === 'assistant') {
      const text = contentToString(msg.content);
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const toolCalls = msg.tool_calls.map(tc => {
          let argsObj = {};
          try {
            argsObj = JSON.parse(tc.function.arguments || '{}');
          } catch {}
          return `工具调用: ${tc.function.name}(${JSON.stringify(argsObj)})`;
        }).join(', ');
        lines.push(`[AI] ${text || '(无文本输出)'}。${toolCalls}`);
      } else if (text) {
        lines.push(`[AI] ${text}`);
      }
    } else if (msg.role === 'tool') {
      const text = contentToString(msg.content);
      const name = msg.name || 'unknown';
      const truncated = text.length > 800
        ? text.slice(0, 800) + `...[共${text.length}字符]`
        : text;
      lines.push(`[工具 ${name}] ${truncated}`);
    }
  }
  return lines.join('\n\n');
}

function loadSession(filename) {
  const filepath = path.join(__dirname, 'data/sessions', filename);
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n');
  return lines.map(line => JSON.parse(line));
}

async function runTests() {
  console.log('═'.repeat(70));
  console.log('Context Compressor 验证测试');
  console.log('═'.repeat(70));

  // 测试 1: cc_group_grp_21
  console.log('\n📊 测试 1: cc_group_grp_21 (462 行, 未压缩)');
  console.log('-'.repeat(70));
  
  const session21 = loadSession('cc_group_grp_21.jsonl');
  console.log(`加载消息数: ${session21.length}`);
  
  const beforeTokens = session21.reduce((sum, msg) => {
    const content = contentToString(msg.content);
    let tokens = estimateTokens(content) + 4; // 基础开销
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        tokens += estimateTokens(tc.function.name);
        tokens += estimateTokens(tc.function.arguments);
        tokens += 4;
      }
    }
    return sum + tokens;
  }, 0);
  console.log(`Token 估算: ${beforeTokens}`);
  
  const systemMsgs = session21.filter(m => m.role === 'system');
  const sessionMsgs = session21.filter(m => m.role !== 'system');
  console.log(`System 消息: ${systemMsgs.length}`);
  console.log(`Session 消息: ${sessionMsgs.length}`);
  
  // 转换为对话文本
  const conversationText = messagesToConversationText(sessionMsgs);
  console.log(`\n转换后文本长度: ${conversationText.length} 字符 (${estimateTokens(conversationText)} tokens)`);
  
  // 当前截断行为
  const currentSlice = conversationText.slice(0, 2000);
  console.log(`\n⚠️ 当前截断 slice(0, 2000):`);
  console.log(`   保留长度: ${currentSlice.length} 字符`);
  console.log(`   前 100 字符:\n   ${currentSlice.slice(0, 100).replace(/\n/g, '\\n')}`);
  console.log(`   ...`);
  console.log(`   后 100 字符:\n   ${currentSlice.slice(-100).replace(/\n/g, '\\n')}`);
  
  // 检查 currentSlice 包含的是早期还是近期内容
  const currentSliceInfo = session21.slice(0, 10).map(m => `${m.role}: ${contentToString(m.content).slice(0, 50)}...`).join(' | ');
  console.log(`   包含的是最早的 10 条消息`);
  
  // 建议的截断方式
  console.log(`\n✅ 建议截断 slice(-8000):`);
  const suggestedSlice = conversationText.slice(-8000);
  console.log(`   保留长度: ${suggestedSlice.length} 字符`);
  console.log(`   前 100 字符:\n   ${suggestedSlice.slice(0, 100).replace(/\n/g, '\\n')}`);
  console.log(`   ...`);
  console.log(`   后 100 字符:\n   ${suggestedSlice.slice(-100).replace(/\n/g, '\\n')}`);

  // 测试 2: cc_group_grp_12 (已压缩)
  console.log('\n\n📊 测试 2: cc_group_grp_12 (已压缩的 session)');
  console.log('-'.repeat(70));
  
  const session12 = loadSession('cc_group_grp_12.jsonl');
  console.log(`加载消息数: ${session12.length}`);
  
  // 检查摘要内容
  const firstMsg = session12[0];
  const firstContent = contentToString(firstMsg.content);
  console.log(`第一条消息 Role: ${firstMsg.role}`);
  console.log(`是否包含 "摘要": ${firstContent.includes('摘要')}`);
  console.log(`第一条内容前 300 字符:`);
  console.log(firstContent.slice(0, 300));

  // 测试 3: 检查 tool result 截断
  console.log('\n\n📊 测试 3: Tool Result 截断检查');
  console.log('-'.repeat(70));
  
  const toolMsgs = session21.filter(m => m.role === 'tool');
  console.log(`Tool 消息数: ${toolMsgs.length}`);
  
  const longToolMsgs = toolMsgs.filter(m => contentToString(m.content).length > 800);
  console.log(`超过 800 字符的 Tool 消息: ${longToolMsgs.length}`);
  
  if (longToolMsgs.length > 0) {
    const sample = longToolMsgs[0];
    const original = contentToString(sample.content);
    const truncated = original.slice(0, 800) + `...[共${original.length}字符]`;
    console.log(`\n示例 (${sample.name}):`);
    console.log(`  原始长度: ${original.length} 字符`);
    console.log(`  截断后长度: ${truncated.length} 字符`);
    console.log(`  截断后末尾:\n  ...${truncated.slice(-150).replace(/\n/g, '\\n')}`);
  }

  // 测试 4: Token 预算分析
  console.log('\n\n📊 测试 4: Token 预算分析');
  console.log('-'.repeat(70));
  
  const MAX_TOKENS = 180000; // 假设 204K context，保留 24K 给 prompt 和输出
  const BUDGET = 60000; // 用于摘要的预算
  
  console.log(`假设 context limit: 204K tokens`);
  console.log(`保留给 prompt 和输出: ~24K tokens`);
  console.log(`可用于摘要内容的预算: ~${BUDGET} tokens`);
  console.log(`当前截断 2000 字符 ≈ ${estimateTokens(' '.repeat(2000))} tokens (英文)`);
  console.log(`当前截断 8000 字符 ≈ ${estimateTokens(' '.repeat(8000))} tokens (英文)`);
  
  // 统计消息分布
  console.log(`\nSession 消息角色分布:`);
  const roleCount = {};
  sessionMsgs.forEach(m => {
    roleCount[m.role] = (roleCount[m.role] || 0) + 1;
  });
  Object.entries(roleCount).forEach(([role, count]) => {
    console.log(`  ${role}: ${count}`);
  });

  console.log('\n' + '═'.repeat(70));
  console.log('验证完成!');
  console.log('═'.repeat(70));
}

runTests();
