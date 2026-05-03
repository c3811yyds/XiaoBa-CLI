import { ContentBlock, Message } from '../types';
import { ChannelCallbacks } from '../types/tool';
import { AIService } from '../utils/ai-service';
import { ToolManager } from '../tools/tool-manager';
import { SkillManager } from '../skills/skill-manager';
import { SessionSkillRuntime } from '../skills/session-skill-runtime';
import { Logger } from '../utils/logger';
import { Metrics } from '../utils/metrics';
import { ConversationRunner, RunnerCallbacks } from './conversation-runner';
import { resolveSessionSurface } from './session-surface';
import { TurnContextBuilder } from './turn-context-builder';
import { TurnLogRecorder } from './turn-log-recorder';

export interface AgentTurnServices {
  aiService: AIService;
  toolManager: ToolManager;
  skillManager: SkillManager;
}

export interface AgentTurnCallbacks {
  onText?: (text: string) => void;
  onThinking?: (thinking: string) => void;
  onToolStart?: (name: string, toolUseId: string, input: any) => void;
  onToolEnd?: (name: string, toolUseId: string, result: string) => void;
  onToolDisplay?: (name: string, content: string) => void;
  onRetry?: (attempt: number, maxRetries: number) => void;
}

export interface RunAgentTurnParams {
  input: string | ContentBlock[];
  messages: Message[];
  runtimeFeedback: string[];
  activeSkillName?: string;
  activeSkillMaxTurns?: number;
  callbacks?: AgentTurnCallbacks;
  channel?: ChannelCallbacks;
  shouldContinue: () => boolean;
}

export interface RunAgentTurnResult {
  text: string;
  visibleToUser: boolean;
  newMessages: Message[];
  messages: Message[];
  activeSkillName?: string;
  activeSkillMaxTurns?: number;
}

export interface AgentTurnControllerOptions {
  sessionKey: string;
  sessionType?: string;
  services: AgentTurnServices;
  skillRuntime: SessionSkillRuntime;
  turnContextBuilder: TurnContextBuilder;
  turnLogRecorder: TurnLogRecorder;
}

/**
 * Runs one user turn: durable input -> transient context -> model/tool loop -> state/log sync.
 */
export class AgentTurnController {
  constructor(private readonly options: AgentTurnControllerOptions) {}

  async run(params: RunAgentTurnParams): Promise<RunAgentTurnResult> {
    let activeSkillName = params.activeSkillName;
    let activeSkillMaxTurns = params.activeSkillMaxTurns;

    const textContent = typeof params.input === 'string' ? params.input : '';
    const autoActivation = this.options.skillRuntime.createAutoActivation(textContent, activeSkillName);
    if (autoActivation) {
      const state = this.options.skillRuntime.applyActivation(params.messages, autoActivation);
      activeSkillName = state.activeSkillName;
      activeSkillMaxTurns = state.activeSkillMaxTurns;
      Logger.info(`[${this.options.sessionKey}] 自动激活 skill: ${autoActivation.skillName}`);
    }

    params.messages.push({ role: 'user', content: params.input });

    const turnContext = await this.options.turnContextBuilder.build({
      sessionKey: this.options.sessionKey,
      durableMessages: params.messages,
      runtimeFeedback: params.runtimeFeedback,
      skillRuntime: this.options.skillRuntime,
    });

    const detectedSkillName = activeSkillName
      ?? this.options.skillRuntime.detectActiveSkillName(params.messages);
    if (detectedSkillName) {
      const detectedSkill = this.options.services.skillManager.getSkill(detectedSkillName);
      activeSkillName = detectedSkillName;
      activeSkillMaxTurns = detectedSkill?.metadata.maxTurns;
    }

    const effectiveMaxTurns = activeSkillMaxTurns
      ?? this.options.skillRuntime.detectSkillMaxTurns(params.messages);
    const runner = this.createRunner({
      activeSkillName,
      effectiveMaxTurns,
      channel: params.channel,
      shouldContinue: params.shouldContinue,
    });

    const result = await runner.run(turnContext.messages, this.toRunnerCallbacks(params.callbacks));
    let nextMessages = this.options.turnContextBuilder.removeTransientMessages(result.messages);

    for (const msg of result.newMessages) {
      const activation = this.options.skillRuntime.parseActivationFromSystemMessage(msg);
      if (!activation) continue;
      const state = this.options.skillRuntime.applyActivation(nextMessages, activation);
      activeSkillName = state.activeSkillName;
      activeSkillMaxTurns = state.activeSkillMaxTurns;
    }

    const metrics = Metrics.getSummary();
    this.logMetrics(metrics);

    this.replaceBase64Images(nextMessages);

    activeSkillName = undefined;
    activeSkillMaxTurns = undefined;
    nextMessages = this.options.skillRuntime.removeSkillSystemMessages(nextMessages);

    this.options.turnLogRecorder.recordTurn({
      userInput: params.input,
      result,
      tokens: { prompt: metrics.totalPromptTokens, completion: metrics.totalCompletionTokens },
      runtimeFeedback: turnContext.runtimeFeedbackForLog,
    });

    return {
      text: result.finalResponseVisible ? (result.response || '[无回复]') : '',
      visibleToUser: result.finalResponseVisible,
      newMessages: result.newMessages,
      messages: nextMessages,
      activeSkillName,
      activeSkillMaxTurns,
    };
  }

  private createRunner(options: {
    activeSkillName?: string;
    effectiveMaxTurns?: number;
    channel?: ChannelCallbacks;
    shouldContinue: () => boolean;
  }): ConversationRunner {
    const surface = resolveSessionSurface(this.options.sessionKey, this.options.sessionType);
    return new ConversationRunner(
      this.options.services.aiService,
      this.options.services.toolManager,
      {
        ...(options.effectiveMaxTurns ? { maxTurns: options.effectiveMaxTurns } : {}),
        initialSkillName: options.activeSkillName,
        shouldContinue: options.shouldContinue,
        // AgentSession/ContextWindowManager compacts durable history before the turn.
        // Runner-level compaction can fold transient runtime feedback into summary.
        enableCompression: false,
        toolExecutionContext: {
          sessionId: this.options.sessionKey,
          surface,
          permissionProfile: 'strict',
          channel: options.channel,
        },
      },
    );
  }

  private toRunnerCallbacks(callbacks?: AgentTurnCallbacks): RunnerCallbacks {
    return {
      onText: callbacks?.onText,
      onToolStart: callbacks?.onToolStart,
      onToolEnd: callbacks?.onToolEnd,
      onToolDisplay: callbacks?.onToolDisplay,
      onRetry: callbacks?.onRetry,
    };
  }

  private logMetrics(metrics: ReturnType<typeof Metrics.getSummary>): void {
    if (metrics.aiCalls === 0 && metrics.toolCalls === 0) return;
    Logger.info(
      `[Metrics] AI调用: ${metrics.aiCalls}次, `
      + `tokens: ${metrics.totalPromptTokens}+${metrics.totalCompletionTokens}=${metrics.totalTokens}, `
      + `工具调用: ${metrics.toolCalls}次, 工具耗时: ${metrics.toolDurationMs}ms`
    );
  }

  private replaceBase64Images(messages: Message[]): void {
    for (const msg of messages) {
      if (!Array.isArray(msg.content)) continue;
      msg.content = msg.content.map(block => {
        if (block.type === 'image' && block.source?.data) {
          const filePath = (block as any).filePath || '未知路径';
          return { type: 'text' as const, text: `[图片: ${filePath}]` };
        }
        return block;
      });
    }
  }
}
