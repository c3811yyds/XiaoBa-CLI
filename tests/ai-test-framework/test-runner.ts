/**
 * AI 测试运行器
 */
import { AIService } from '../../src/utils/ai-service';
import { AgentSession } from '../../src/core/agent-session';
import { SendMessageTool } from '../../src/tools/send-message-tool';
import { TestScenario, ConversationTurn, TestResult, ToolCallLog } from './types';
import { Logger } from '../../src/utils/logger';

export class AITestRunner {
  constructor(
    private agentSession: AgentSession,
    private sendMessageTool: SendMessageTool,
  ) {}

  async runScenario(scenario: TestScenario): Promise<TestResult> {
    Logger.info(`开始测试场景: ${scenario.name}`);

    const testerAI = new AIService();
    const testerMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: scenario.testerPrompt },
    ];

    const turns: ConversationTurn[] = [];
    const capturedMessages: string[] = [];
    const sessionKey = 'ai-test-session';

    this.sendMessageTool.bindSession(sessionKey, 'test-chat', async (_chatId, text) => {
      capturedMessages.push(text);
    });

    try {
      for (let turn = 1; turn <= scenario.maxTurns; turn++) {
        let testerMessage: string;
        const turnStartTime = Date.now();

        if (turn === 1) {
          testerMessage = '开始';
        } else {
          const lastTurn = turns[turn - 2];
          const agentReply = lastTurn.agentVisibleReply || lastTurn.agentFinalAnswer;

          testerMessages.push({ role: 'user', content: `Agent 回复：${agentReply}` });
          const response = await testerAI.chat(testerMessages as any);
          testerMessage = response.content || '继续';
          testerMessages.push({ role: 'assistant', content: testerMessage });

          if (testerMessage.includes('[TEST_DONE]')) {
            Logger.info(`测试在第 ${turn} 轮结束`);
            break;
          }
        }

        Logger.info(`[Turn ${turn}] Tester: ${testerMessage.slice(0, 100)}`);

        capturedMessages.length = 0;
        const toolCalls: any[] = [];
        const toolResults: any[] = [];
        const seenToolCallIds = new Set<string>();

        const finalAnswer = await this.agentSession.handleMessage(testerMessage, {
          onToolStart: (name) => {
            const msgs = this.agentSession.getMessages();
            for (let i = msgs.length - 1; i >= 0; i--) {
              const msg = msgs[i];
              if (msg.role !== 'assistant' || !msg.tool_calls) continue;
              for (const tc of msg.tool_calls) {
                if (tc.function.name === name && !seenToolCallIds.has(tc.id)) {
                  seenToolCallIds.add(tc.id);
                  try {
                    toolCalls.push({
                      name,
                      arguments: JSON.parse(tc.function.arguments),
                      timestamp: Date.now(),
                    });
                  } catch {
                    toolCalls.push({
                      name,
                      arguments: { raw: tc.function.arguments },
                      timestamp: Date.now(),
                    });
                  }
                  return;
                }
              }
            }
          },
          onToolEnd: (name, result) => {
            toolResults.push({
              toolName: name,
              success: !result?.error,
              result: result?.error ? undefined : result,
              error: result?.error,
            });
          },
        });

        const responseTime = Date.now() - turnStartTime;

        turns.push({
          turn,
          testerMessage,
          agentInternals: {
            toolCalls,
            toolResults,
            messagesContext: this.agentSession.getMessages(),
            memoryAccess: [],
          },
          agentVisibleReply: capturedMessages.join('\n'),
          agentFinalAnswer: finalAnswer,
          timestamp: Date.now(),
          responseTimeMs: responseTime,
        });

        Logger.info(`[Turn ${turn}] Agent: ${finalAnswer.slice(0, 100)} (${responseTime}ms)`);
      }
    } finally {
      this.sendMessageTool.unbindSession(sessionKey);
    }

    return {
      scenario: scenario.name,
      timestamp: new Date().toISOString(),
      turns,
    };
  }
}
