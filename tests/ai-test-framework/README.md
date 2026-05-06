# AI 测试框架

真正的 agentic 测试 - 用 AI 测试 AI 的对话体验，重点是**发现问题**而不是打分。

## 核心思路

1. **Tester Agent** - 模拟真实用户，围绕测试主题自然聊天（不是机械发消息）
2. **被测 Agent** - xiaoba runtime，收集完整内部状态（工具调用、结果、context）
3. **AI Analyzer** - 分析完整记录，列出所有问题和改进建议

## 配置

复制 `test-config.example.ts` 为 `test-config.ts`，填入两个 bot 的配置：

```typescript
export const testConfig: TestConfig = {
  tester: {
    apiKey: 'cc_bot_tester_xxx',
    serverUrl: 'ws://localhost:6061/v0/channels',
  },
  target: {
    apiKey: 'cc_bot_xiaoba_xxx',
    serverUrl: 'ws://localhost:6061/v0/channels',
  },
  testTopic: 'p2p_test',  // 固定 topic
};
```

## 使用

```bash
# 运行所有场景
npx tsx tests/ai-test-framework/index.ts

# 运行特定场景
npx tsx tests/ai-test-framework/index.ts 记忆能力
```

## 输出示例

```
=== 分析结果 ===
总轮次: 8
平均响应时间: 1250ms
工具调用次数: 12

发现 3 个问题:

🔴 [记忆] 用户在 Turn 1 提到的项目名称，在 Turn 5 被问及时未能回忆
   位置: Turn 5
   建议: 应该使用记忆工具或检索历史消息

🟡 [工具使用] send_message 工具调用失败，但 Agent 未重试
   位置: Turn 3
   建议: 工具失败时应该有重试机制

🔵 [对话流畅度] 响应时间过长（3500ms），用户体验差
   位置: Turn 7
```

## 添加新场景

编辑 `scenarios.ts`：

```typescript
export const myScenario: TestScenario = {
  name: '场景名称',
  description: '测试什么',
  objectives: ['目标1', '目标2'],
  testerPrompt: '你是用户，测试...',
  maxTurns: 10,
};
```

## 架构

```
types.ts              - 类型定义（重点是 Issue 结构）
test-runner.ts        - 运行测试，收集完整内部状态
evaluator.ts          - AI 分析器，输出问题列表
scenarios.ts          - 场景配置
test-config.example.ts - 配置示例
index.ts              - 主入口
```

结果保存在 `tests/eval-results/`，包含完整对话记录和问题分析。
