/**
 * AI 分析器 - 使用 LLM 分析测试结果，找出问题
 */
import { AIService } from '../../src/utils/ai-service';
import { TestResult, AnalysisResult, TestScenario, Issue } from './types';

export class AIAnalyzer {
  private aiService: AIService;

  constructor() {
    this.aiService = new AIService();
  }

  async analyze(result: TestResult, scenario: TestScenario): Promise<AnalysisResult> {
    const prompt = this.buildAnalysisPrompt(result, scenario);

    const response = await this.aiService.chat([
      { role: 'user', content: prompt },
    ] as any);

    return this.parseAnalysis(response.content || '', result);
  }

  private buildAnalysisPrompt(result: TestResult, scenario: TestScenario): string {
    const detailedLog = result.turns.map(t => {
      const tools = t.agentInternals.toolCalls.map(tc =>
        `  - ${tc.name}(${JSON.stringify(tc.arguments).slice(0, 100)})`
      ).join('\n');

      const toolResults = t.agentInternals.toolResults.map(tr =>
        `  - ${tr.toolName}: ${tr.success ? 'success' : 'FAILED'} ${tr.error || ''}`
      ).join('\n');

      return `Turn ${t.turn} (响应时间: ${t.responseTimeMs}ms):
Tester: ${t.testerMessage}
Agent 工具调用:
${tools || '  (无)'}
工具结果:
${toolResults || '  (无)'}
Agent 可见回复: ${t.agentVisibleReply || '(无)'}
Agent 内部答案: ${t.agentFinalAnswer.slice(0, 200)}
Context 长度: ${t.agentInternals.messagesContext.length} 条消息`;
    }).join('\n\n---\n\n');

    return `你是 AI Agent 测试分析专家。请仔细分析以下测试记录，找出所有问题。

测试场景: ${scenario.name}
测试目标: ${scenario.objectives.join('; ')}

完整测试记录:
${detailedLog}

请列出所有发现的问题，每个问题包含：
- severity: critical/major/minor
- category: 如"记忆"、"工具使用"、"对话流畅度"
- description: 问题描述
- location: 出现位置（如 Turn 3）
- context: 相关上下文
- suggestion: 改进建议（可选）

以 JSON 数组格式输出:
[
  {
    "severity": "critical",
    "category": "记忆",
    "description": "用户在 Turn 1 提到的项目名称，在 Turn 5 被问及时未能回忆",
    "location": "Turn 5",
    "context": "用户问'我刚才说要做什么'，Agent 回答'不确定'",
    "suggestion": "应该使用记忆工具或检索历史消息"
  }
]`;
  }

  private parseAnalysis(content: string, result: TestResult): AnalysisResult {
    let issues: Issue[] = [];

    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        issues = JSON.parse(jsonMatch[0]);
      }
    } catch {
      issues = [{
        severity: 'major',
        category: '分析失败',
        description: '无法解析 LLM 输出',
        location: 'N/A',
        context: content.slice(0, 500),
      }];
    }

    const stats = {
      totalTurns: result.turns.length,
      avgResponseTime: result.turns.reduce((sum, t) => sum + t.responseTimeMs, 0) / result.turns.length,
      toolUsageCount: result.turns.reduce((sum, t) => sum + t.agentInternals.toolCalls.length, 0),
      emptyResponseCount: result.turns.filter(t => !t.agentVisibleReply && !t.agentFinalAnswer).length,
    };

    return { issues, stats };
  }
}
