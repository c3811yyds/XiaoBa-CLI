/**
 * Engineer Skill 完备性评估
 *
 * 用真实 LLM + 真实工具，模拟用户与 agent 的多轮对话，
 * 测试 cad-reader 和 boq-generator skill 的完整链路：
 *   读图 → 分析 → 提取 → 生成清单 → 溯源截图
 *
 * 用法: npx tsx tests/engineer-skill-eval.ts
 */

import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';

// 加载 .env
config({ path: path.resolve(__dirname, '../.env') });

import { AIService } from '../src/utils/ai-service';
import { ToolManager } from '../src/tools/tool-manager';
import { SkillManager } from '../src/skills/skill-manager';
import { AgentSession, SessionCallbacks } from '../src/core/agent-session';

// ─── 类型定义 ────────────────────────────────────────

interface ToolCallLog {
  name: string;
  arguments: Record<string, any>;
  result?: string;
}

interface TurnLog {
  turn: number;
  userMessage: string;
  toolCalls: ToolCallLog[];
  agentReply: string;
  streamedText: string;
}

// ─── 测试用 DXF 文件 ────────────────────────────────

const TEST_DXF = '/Users/zhuhanyuan/Documents/chatbot/workspace/cad_files/格莱利2期/结构/格莱利二期结构/连廊结施.dxf';

// ─── 测试场景：模拟真实用户消息序列 ─────────────────

const TEST_SCENARIOS: Array<{
  name: string;
  message: string;
  expect: {
    shouldUseTools?: string[];       // 期望调用的工具
    shouldContainText?: string[];    // 回复中应包含的关键词
    shouldGenerateFiles?: boolean;   // 是否应生成文件
  };
}> = [
  {
    name: '场景1: 用户请求读取 DXF 图纸',
    message: `请帮我读取和分析这张结构施工图纸: ${TEST_DXF}`,
    expect: {
      shouldUseTools: ['execute_shell'],
      shouldContainText: ['图层', '实体'],
    },
  },
  {
    name: '场景2: 用户要求查看具体区域',
    message: '帮我看看图纸中有哪些结构构件，特别是柱和基础的标注。截个图给我看看。',
    expect: {
      shouldUseTools: ['execute_shell'],
      shouldContainText: [],
    },
  },
  {
    name: '场景3: 用户要求生成工程量清单',
    message: '根据你分析的结果，按照 GB 50500 标准帮我生成一份工程量清单报告。要有计算书和图纸溯源截图。',
    expect: {
      shouldUseTools: ['execute_shell'],
      shouldContainText: [],
    },
  },
  {
    name: '场景4: 用户追问来源和截图',
    message: '这些工程量的数据来源是哪里？能不能把对应的图纸区域截图发给我看看？',
    expect: {
      shouldContainText: [],
    },
  },
];

// ─── 主流程 ──────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Engineer Skill 完备性评估                  ║');
  console.log('║   cad-reader + boq-generator                ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // 检查 DXF 文件
  if (!fs.existsSync(TEST_DXF)) {
    console.error(`测试 DXF 文件不存在: ${TEST_DXF}`);
    process.exit(1);
  }
  console.log(`测试文件: ${TEST_DXF}\n`);

  // 初始化
  const projectRoot = path.resolve(__dirname, '..');
  const toolManager = new ToolManager(projectRoot);
  const skillManager = new SkillManager();
  await skillManager.loadSkills();

  // 验证 skill 加载
  const allSkills = skillManager.getAllSkills();
  console.log(`已加载 ${allSkills.length} 个 skills:`);
  for (const s of allSkills) {
    console.log(`  - ${s.metadata.name}: ${s.metadata.description?.slice(0, 60) ?? ''}`);
  }

  const cadReader = skillManager.getSkill('cad-reader');
  const boqGen = skillManager.getSkill('boq-generator');
  if (!cadReader) {
    console.error('cad-reader skill 未找到！');
    process.exit(1);
  }
  if (!boqGen) {
    console.error('boq-generator skill 未找到！');
    process.exit(1);
  }
  console.log('\n✓ cad-reader 和 boq-generator 均已加载\n');

  // 创建 session（CLI surface）
  const session = new AgentSession('cli', {
    aiService: new AIService(),
    toolManager,
    skillManager,
  });

  // 运行测试场景
  const logs: TurnLog[] = [];

  for (let i = 0; i < TEST_SCENARIOS.length; i++) {
    const scenario = TEST_SCENARIOS[i];
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`${scenario.name}`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`\n[用户]: ${scenario.message}\n`);

    const toolCalls: ToolCallLog[] = [];
    let streamedText = '';

    const callbacks: SessionCallbacks = {
      onText: (text: string) => {
        streamedText += text;
        process.stdout.write(text);
      },
      onToolStart: (name: string) => {
        console.log(`\n  ⚙ [tool:start] ${name}`);
      },
      onToolEnd: (name: string, result: string) => {
        // 直接从回调参数记录工具调用
        toolCalls.push({
          name,
          arguments: { _from_callback: true },
          result: result?.slice(0, 500),
        });
        // 打印结果摘要
        const preview = result?.slice(0, 200).replace(/\n/g, ' ') ?? '';
        console.log(`  ⚙ [tool:end] ${name} → ${preview}...`);
      },
      onToolDisplay: (_name: string, content: string) => {
        console.log(`  📋 ${content.slice(0, 200)}`);
      },
    };

    const agentReply = await session.handleMessage(scenario.message, callbacks);

    if (streamedText) {
      process.stdout.write('\n');
    }

    const turnLog: TurnLog = {
      turn: i + 1,
      userMessage: scenario.message,
      toolCalls,
      agentReply,
      streamedText,
    };
    logs.push(turnLog);

    // 打印摘要
    console.log(`\n--- Turn ${i + 1} 摘要 ---`);
    console.log(`  工具调用: ${toolCalls.length} 次`);
    if (toolCalls.length > 0) {
      console.log(`  工具列表: ${toolCalls.map(t => t.name).join(', ')}`);
    }
    const replyPreview = (streamedText || agentReply).slice(0, 300);
    console.log(`  回复预览: ${replyPreview.replace(/\n/g, ' ')}...`);

    // 验证期望
    const expect = scenario.expect;
    const issues: string[] = [];

    if (expect.shouldUseTools) {
      for (const tool of expect.shouldUseTools) {
        if (!toolCalls.some(tc => tc.name === tool)) {
          issues.push(`期望调用 ${tool} 但未调用`);
        }
      }
    }

    if (expect.shouldContainText) {
      const fullText = streamedText + agentReply;
      for (const keyword of expect.shouldContainText) {
        if (!fullText.includes(keyword)) {
          issues.push(`回复中未包含关键词 "${keyword}"`);
        }
      }
    }

    if (issues.length > 0) {
      console.log(`  ⚠ 问题: ${issues.join('; ')}`);
    } else {
      console.log(`  ✓ 验证通过`);
    }
  }

  // 输出报告
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const resultsDir = path.resolve(__dirname, 'eval-results');
  fs.mkdirSync(resultsDir, { recursive: true });

  // JSON log
  const jsonPath = path.join(resultsDir, `engineer-eval-${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({
    timestamp,
    dxfFile: TEST_DXF,
    turns: logs,
  }, null, 2));

  // Markdown 报告
  const mdPath = path.join(resultsDir, `engineer-eval-${timestamp}.md`);
  fs.writeFileSync(mdPath, generateReport(logs));

  console.log(`\n${'═'.repeat(60)}`);
  console.log('评估完成');
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  报告: ${mdPath}`);
  console.log(`${'═'.repeat(60)}`);
}

// ─── 报告生成 ────────────────────────────────────────

function generateReport(logs: TurnLog[]): string {
  const lines: string[] = [
    '# Engineer Skill 评估报告',
    '',
    `评估时间: ${new Date().toISOString()}`,
    `测试文件: ${TEST_DXF}`,
    `总轮次: ${logs.length}`,
    '',
    '---',
    '',
  ];

  for (const log of logs) {
    lines.push(`## Turn ${log.turn}`);
    lines.push('');
    lines.push(`**用户**: ${log.userMessage}`);
    lines.push('');

    if (log.toolCalls.length > 0) {
      lines.push('**工具调用**:');
      for (const tc of log.toolCalls) {
        const argsStr = JSON.stringify(tc.arguments).slice(0, 300);
        lines.push(`- \`${tc.name}\`: \`${argsStr}\``);
      }
      lines.push('');
    }

    const reply = log.streamedText || log.agentReply;
    lines.push('**Agent 回复**:');
    lines.push('');
    lines.push(reply);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // 汇总
  const allTools = logs.flatMap(l => l.toolCalls.map(t => t.name));
  const toolFreq: Record<string, number> = {};
  for (const t of allTools) {
    toolFreq[t] = (toolFreq[t] || 0) + 1;
  }

  lines.push('## 统计');
  lines.push('');
  lines.push(`- 总轮次: ${logs.length}`);
  lines.push(`- 总工具调用: ${allTools.length}`);
  lines.push('');
  if (Object.keys(toolFreq).length > 0) {
    lines.push('**工具使用频率**:');
    for (const [name, count] of Object.entries(toolFreq).sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${name}: ${count}次`);
    }
  }

  return lines.join('\n');
}

// ─── 启动 ────────────────────────────────────────────

main().catch(err => {
  console.error('评估失败:', err);
  process.exit(1);
});
