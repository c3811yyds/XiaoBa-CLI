/**
 * 用 axios 直接模拟压缩请求
 */

import axios from 'axios';
import { Message } from './src/types';
import { messagesToConversationText, buildCompactSystemPrompt, parseCompactSummary } from './src/core/context-compressor';
import * as fs from 'fs';

const API_KEY = process.env.GAUZ_LLM_API_KEY!;
const BASE_URL = 'https://buildsense.asia/v1';

async function chat(messages: Message[], system?: string): Promise<any> {
  const resp = await axios.post(`${BASE_URL}/messages`, {
    model: 'MiniMax-M2.7-highspeed',
    max_tokens: 8192,
    system,
    messages,
  }, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    timeout: 60000,
  });
  return resp.data;
}

async function run() {
  // 加载 session
  const sessionFile = './data/sessions/cc_user_usr2.jsonl';
  const lines = fs.readFileSync(sessionFile, 'utf-8').split('\n').filter(Boolean);
  const messages: Message[] = lines.map(line => JSON.parse(line));

  console.log(`[测试] 加载了 ${messages.length} 条消息`);
  const totalTokens = messages.reduce((sum, m) => {
    const c = typeof m.content === 'string' ? m.content : '';
    return sum + Math.ceil(c.length / 2);
  }, 0);
  console.log(`[测试] 总 token 估算: ${totalTokens}`);

  // 构造压缩请求
  const sessionMsgs = messages.filter(m => m.role !== 'system');
  const conversationText = messagesToConversationText(sessionMsgs);
  const truncated = conversationText.length > 2000
    ? conversationText.slice(0, 2000) + `\n...[共${conversationText.length}字符]`
    : conversationText;

  const systemPrompt = buildCompactSystemPrompt();
  console.log(`[测试] system prompt 长度: ${systemPrompt.length}`);
  console.log(`[测试] content 长度: ${truncated.length}`);

  // 测试1: 纯文本请求（无 system）
  console.log('\n[测试1] 纯 user 消息...');
  try {
    const resp = await chat(
      [{ role: 'user', content: 'Summarize: user asked assistant to fix a bug, assistant fixed it, user said thanks.' }],
      undefined
    );
    console.log(`[测试1] ✅ 成功！`);
    const text = resp.content?.[0]?.text || resp.content?.[0]?.thinking || 'no text';
    console.log(`[测试1] 内容: ${String(text).slice(0, 100)}`);
  } catch (e: any) {
    console.error(`[测试1] ❌ 失败: ${e.message}`);
  }

  // 测试2: 带压缩 system prompt
  console.log('\n[测试2] 带压缩 system prompt...');
  try {
    const resp = await chat(
      [{ role: 'user', content: `Please summarize:\n\n${truncated}` }],
      systemPrompt
    );
    console.log(`[测试2] ✅ 成功！`);
    const text = resp.content?.[0]?.text || resp.content?.[0]?.thinking || 'no text';
    console.log(`[测试2] 内容前200字: ${String(text).slice(0, 200)}`);
    
    // 解析摘要
    const summary = parseCompactSummary(typeof text === 'string' ? text : String(text));
    console.log(`[测试2] 摘要长度: ${summary.length}`);
    console.log(`[测试2] 摘要前200字: ${summary.slice(0, 200)}`);
  } catch (e: any) {
    console.error(`[测试2] ❌ 失败: ${e.message}`);
    if (e.response) {
      console.error(`[测试2] 状态: ${e.response.status}, 数据: ${JSON.stringify(e.response.data)}`);
    }
  }

  process.exit(0);
}

run();
