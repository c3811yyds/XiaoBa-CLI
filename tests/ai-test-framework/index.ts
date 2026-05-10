/**
 * AI 测试框架主入口
 *
 * 用法: npx tsx tests/ai-test-framework/index.ts [scenario-name]
 */
import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';

config({ path: path.resolve(__dirname, '../../.env') });

import { AIService } from '../../src/utils/ai-service';
import { ToolManager } from '../../src/tools/tool-manager';
import { SkillManager } from '../../src/skills/skill-manager';
import { AgentSession } from '../../src/core/agent-session';
import { SendMessageTool } from '../../src/tools/send-message-tool';
import { AITestRunner } from './test-runner';
import { AIAnalyzer } from './evaluator';
import { allScenarios } from './scenarios';

async function main() {
  const scenarioName = process.argv[2];
  const scenarios = scenarioName
    ? allScenarios.filter(s => s.name.includes(scenarioName))
    : allScenarios;

  if (scenarios.length === 0) {
    console.error(`场景未找到: ${scenarioName}`);
    process.exit(1);
  }

  const toolManager = new ToolManager(path.resolve(__dirname, '../..'));
  const skillManager = new SkillManager();
  await skillManager.loadSkills();

  const session = new AgentSession('ai-test-session', {
    aiService: new AIService(),
    toolManager,
    skillManager,
  });

  const sendMessageTool = toolManager.getTool<SendMessageTool>('send_message');
  if (!sendMessageTool) {
    throw new Error('send_message tool not found');
  }

  const runner = new AITestRunner(session, sendMessageTool);
  const analyzer = new AIAnalyzer();

  const resultsDir = path.resolve(__dirname, '../eval-results');
  fs.mkdirSync(resultsDir, { recursive: true });

  for (const scenario of scenarios) {
    console.log(`\n=== 运行场景: ${scenario.name} ===\n`);

    const result = await runner.runScenario(scenario);
    const analysis = await analyzer.analyze(result, scenario);
    result.analysis = analysis;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const jsonPath = path.join(resultsDir, `${scenario.name}-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));

    console.log(`\n=== 分析结果 ===`);
    console.log(`总轮次: ${analysis.stats.totalTurns}`);
    console.log(`平均响应时间: ${analysis.stats.avgResponseTime.toFixed(0)}ms`);
    console.log(`工具调用次数: ${analysis.stats.toolUsageCount}`);
    console.log(`\n发现 ${analysis.issues.length} 个问题:\n`);

    for (const issue of analysis.issues) {
      const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'major' ? '🟡' : '🔵';
      console.log(`${icon} [${issue.category}] ${issue.description}`);
      console.log(`   位置: ${issue.location}`);
      if (issue.suggestion) {
        console.log(`   建议: ${issue.suggestion}`);
      }
      console.log();
    }

    console.log(`结果已保存: ${jsonPath}\n`);
  }
}

main().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
