/**
 * AI 测试框架类型定义
 */

/** 测试场景配置 */
export interface TestScenario {
  /** 场景名称 */
  name: string;
  /** 场景描述 */
  description: string;
  /** 测试目标（用于评价） */
  objectives: string[];
  /** Tester Agent 的 system prompt */
  testerPrompt: string;
  /** 最大轮次 */
  maxTurns: number;
}

/** 单轮对话记录 */
export interface ConversationTurn {
  turn: number;
  testerMessage: string;

  // 被测 Agent 完整内部状态
  agentInternals: {
    toolCalls: ToolCallLog[];
    toolResults: ToolResultLog[];
    messagesContext: any[];  // 完整 messages 数组
    memoryAccess?: string[]; // 访问的记忆
  };

  agentVisibleReply: string;
  agentFinalAnswer: string;
  timestamp: number;
  responseTimeMs: number;
}

/** 工具调用记录 */
export interface ToolCallLog {
  name: string;
  arguments: Record<string, any>;
  timestamp: number;
}

/** 工具结果记录 */
export interface ToolResultLog {
  toolName: string;
  success: boolean;
  result?: any;
  error?: string;
}

/** 测试结果 */
export interface TestResult {
  scenario: string;
  timestamp: string;
  turns: ConversationTurn[];
  analysis?: AnalysisResult;
}

/** 问题记录 */
export interface Issue {
  severity: 'critical' | 'major' | 'minor';
  category: string;  // 如 "记忆", "工具使用", "对话流畅度"
  description: string;
  location: string;  // 如 "Turn 3"
  context: string;   // 相关上下文
  suggestion?: string;
}

/** 分析结果 - 重点是问题列表 */
export interface AnalysisResult {
  issues: Issue[];

  // 简单统计（辅助理解）
  stats: {
    totalTurns: number;
    avgResponseTime: number;
    toolUsageCount: number;
    emptyResponseCount: number;
  };

  // 可选的总结
  summary?: string;
}
