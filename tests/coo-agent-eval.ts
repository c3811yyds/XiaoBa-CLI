/**
 * COO Agent-vs-Agent 体验评估
 *
 * Tester Agent（CEO 模拟器）与真实 COO AgentSession 进行多轮对话，
 * 收集完整 log，输出 JSON + Markdown 报告。
 *
 * 用法: npx tsx tests/coo-agent-eval.ts
 */

import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';

// 加载 .env
config({ path: path.resolve(__dirname, '../.env') });

import { AIService } from '../src/utils/ai-service';
import { ToolManager } from '../src/tools/tool-manager';
import { SkillManager } from '../src/skills/skill-manager';
import { AgentSession } from '../src/core/agent-session';
import { SendMessageTool } from '../src/tools/send-message-tool';

// ─── 类型定义 ────────────────────────────────────────

interface ToolCallLog {
  name: string;
  arguments: Record<string, any>;
}

interface TurnLog {
  turn: number;
  ceoMessage: string;
  cooToolCalls: ToolCallLog[];
  cooVisibleReply: string[];
  cooFinalAnswer: string;
}

// ─── CEO System Prompt ───────────────────────────────

const CEO_SYSTEM_PROMPT = `你是 hanyuan，CatsCompany 的 CEO。你正在和你的 AI COO（小八）进行日常工作对话。

你的目标是通过自然对话测试 COO 的各项能力。按以下场景渐进推进，每轮只说一件事，像真人一样说话（简短、口语化）：

场景脚本（按顺序推进，根据 COO 回复自然衔接）：
1. 打个招呼，随便聊两句
2. 汇报一个新项目："我想做一个 AI 代码审查工具，自动分析 PR 质量"
3. 提到时间承诺："这个争取明天把方案写完"
4. 问整体进度："现在手上的事情都啥进度了？"
5. 提一个和之前方向可能冲突的想法："我在想要不要先暂停代码审查，转去做一个 AI 写测试的工具"
6. 给一个模糊指令："那个之前说的那个事情，你帮我推进一下"
7. 表达一下疲惫："最近太累了，感觉事情做不完"
8. 要求生成日报："帮我出一下今天的日报"
9. 追问之前的决策："我之前是怎么决定记忆模块方案的来着？"
10. 最后随便聊一句收尾

重要规则：
- 每次只回复一条消息，不要一次说多个场景
- 根据 COO 的实际回复自然推进，不要机械地念台词
- 如果 COO 问你问题，正常回答后再推进下一个场景
- 说话风格：简短、直接、口语化，像在微信聊天
- 当你觉得 10 个场景都覆盖了，回复 "[EVAL_DONE]" 结束对话`;

// ─── 主流程 ──────────────────────────────────────────

const TOTAL_TURNS = 15; // 最多 15 轮，CEO 可提前用 [EVAL_DONE] 结束

async function main() {
  console.log('=== COO Agent-vs-Agent 体验评估 ===\n');

  // 1. 初始化 Tester Agent（CEO）
  const testerAI = new AIService();
  const testerMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: CEO_SYSTEM_PROMPT },
  ];

  // 2. 初始化 COO Agent（被测对象）
  const toolManager = new ToolManager(path.resolve(__dirname, '..'));
  const skillManager = new SkillManager();
  await skillManager.loadSkills();

  const session = new AgentSession('cc_user:eval-ceo', {
    aiService: new AIService(),
    toolManager,
    skillManager,
  });

  // COO 身份由 system prompt 定义（prompts/system-prompt.md），无需 activateSkill
  // session.init() 会在 handleMessage 时自动调用

  // 绑定 send_message 捕获
  const sendMessageTool = toolManager.getTool<SendMessageTool>('send_message');
  let capturedMessages: string[] = [];

  sendMessageTool?.bindSession('cc_user:eval-ceo', 'eval-chat', async (_chatId, text) => {
    capturedMessages.push(text);
  });

  // 3. 对话循环
  const logs: TurnLog[] = [];

  for (let turn = 1; turn <= TOTAL_TURNS; turn++) {
    // CEO 生成消息
    let ceoMessage: string;
    if (turn === 1) {
      ceoMessage = '小八，在吗？';
    } else {
      // 把上一轮 COO 的可见回复作为 CEO 收到的消息
      const lastLog = logs[logs.length - 1];
      const cooReply = lastLog.cooVisibleReply.length > 0
        ? lastLog.cooVisibleReply.join('\n')
        : lastLog.cooFinalAnswer;

      testerMessages.push({ role: 'user', content: `COO 回复：${cooReply}` });

      const testerResponse = await testerAI.chat(testerMessages as any);
      ceoMessage = testerResponse.content || '继续';
      testerMessages.push({ role: 'assistant', content: ceoMessage });

      if (ceoMessage.includes('[EVAL_DONE]')) {
        console.log(`\n[Turn ${turn}] CEO: ${ceoMessage}`);
        console.log('\n--- CEO 结束对话 ---\n');
        break;
      }
    }

    console.log(`\n[Turn ${turn}] CEO: ${ceoMessage}`);

    // COO 处理消息
    capturedMessages = [];
    const toolCalls: ToolCallLog[] = [];
    const seenToolCallIds = new Set<string>();

    const finalAnswer = await session.handleMessage(ceoMessage, {
      onToolStart: (name) => {
        console.log(`  [tool] ${name} ...`);
      },
      onToolEnd: (name, _result) => {
        // 从 messages 末尾找未记录过的 tool_call（用 id 去重）
        const msgs = session.getMessages();
        for (let i = msgs.length - 1; i >= 0; i--) {
          const msg = msgs[i];
          if (msg.role !== 'assistant' || !msg.tool_calls) continue;
          for (const tc of msg.tool_calls) {
            if (tc.function.name === name && !seenToolCallIds.has(tc.id)) {
              seenToolCallIds.add(tc.id);
              try {
                toolCalls.push({ name, arguments: JSON.parse(tc.function.arguments) });
              } catch {
                toolCalls.push({ name, arguments: { raw: tc.function.arguments } });
              }
              return;
            }
          }
        }
      },
    });

    const turnLog: TurnLog = {
      turn,
      ceoMessage,
      cooToolCalls: toolCalls,
      cooVisibleReply: [...capturedMessages],
      cooFinalAnswer: finalAnswer,
    };
    logs.push(turnLog);

    // 打印 COO 回复
    if (capturedMessages.length > 0) {
      console.log(`  [COO visible]: ${capturedMessages.join('\n  ')}`);
    }
    console.log(`  [COO final]: ${finalAnswer.slice(0, 200)}${finalAnswer.length > 200 ? '...' : ''}`);
    if (toolCalls.length > 0) {
      console.log(`  [tools used]: ${toolCalls.map(t => t.name).join(', ')}`);
    }
  }

  // 清理
  sendMessageTool?.unbindSession('cc_user:eval-ceo');

  // 4. 输出报告
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const resultsDir = path.resolve(__dirname, 'eval-results');
  fs.mkdirSync(resultsDir, { recursive: true });

  // JSON log
  const jsonPath = path.join(resultsDir, `coo-eval-${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ timestamp, turns: logs }, null, 2));
  console.log(`\nJSON log: ${jsonPath}`);

  // Markdown 报告
  const mdPath = path.join(resultsDir, `coo-eval-${timestamp}.md`);
  fs.writeFileSync(mdPath, generateMarkdownReport(logs));
  console.log(`Markdown report: ${mdPath}`);
}

// ─── Markdown 报告生成 ───────────────────────────────

function generateMarkdownReport(logs: TurnLog[]): string {
  const lines: string[] = [
    '# COO Agent 体验评估报告',
    '',
    `评估时间: ${new Date().toISOString()}`,
    `总轮次: ${logs.length}`,
    '',
    '---',
    '',
  ];

  for (const log of logs) {
    lines.push(`## Turn ${log.turn}`);
    lines.push('');
    lines.push(`**CEO**: ${log.ceoMessage}`);
    lines.push('');

    if (log.cooToolCalls.length > 0) {
      lines.push('**工具调用**:');
      for (const tc of log.cooToolCalls) {
        lines.push(`- \`${tc.name}\`: \`${JSON.stringify(tc.arguments).slice(0, 200)}\``);
      }
      lines.push('');
    }

    if (log.cooVisibleReply.length > 0) {
      lines.push('**COO 可见回复**:');
      lines.push('');
      for (const msg of log.cooVisibleReply) {
        lines.push(`> ${msg.replace(/\n/g, '\n> ')}`);
      }
      lines.push('');
    }

    lines.push(`**COO Final Answer**: ${log.cooFinalAnswer.slice(0, 500)}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // 汇总统计
  const allTools = logs.flatMap(l => l.cooToolCalls.map(t => t.name));
  const toolFreq: Record<string, number> = {};
  for (const t of allTools) {
    toolFreq[t] = (toolFreq[t] || 0) + 1;
  }

  lines.push('## 统计');
  lines.push('');
  lines.push(`- 总轮次: ${logs.length}`);
  lines.push(`- 总工具调用: ${allTools.length}`);
  lines.push(`- 使用 send_message 的轮次: ${logs.filter(l => l.cooVisibleReply.length > 0).length}`);
  lines.push('');
  lines.push('**工具使用频率**:');
  for (const [name, count] of Object.entries(toolFreq).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${name}: ${count}次`);
  }

  return lines.join('\n');
}

// ─── 启动 ────────────────────────────────────────────

main().catch(err => {
  console.error('评估失败:', err);
  process.exit(1);
});
