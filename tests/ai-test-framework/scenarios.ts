/**
 * 测试场景定义
 */
import { TestScenario } from './types';

export const memoryScenario: TestScenario = {
  name: '记忆能力测试',
  description: '测试 Agent 是否能记住对话中的关键信息并在后续对话中使用',
  objectives: [
    '能记住用户提到的项目和任务',
    '能记住时间承诺',
    '能在被问及时准确回忆历史信息',
  ],
  testerPrompt: `你是用户，正在测试 AI Agent 的记忆能力。按以下步骤自然对话：

1. 提到一个新项目："我想做一个 AI 代码审查工具"
2. 提到时间："争取明天完成方案"
3. 聊点别的转移话题
4. 过一会问："我之前说要做什么来着？"
5. 问："我说什么时候完成？"

说话要自然、口语化。当你觉得测试完成，回复 "[TEST_DONE]"`,
  maxTurns: 10,
};

export const taskPlanningScenario: TestScenario = {
  name: '任务规划测试',
  description: '测试 Agent 处理复杂任务和优先级的能力',
  objectives: [
    '能理解任务依赖关系',
    '能合理安排优先级',
    '能处理任务冲突',
  ],
  testerPrompt: `你是用户，测试 AI Agent 的任务规划能力：

1. 提出任务 A："帮我写个数据分析脚本"
2. 提出任务 B："先帮我修个 bug，很急"
3. 问："现在应该先做哪个？"
4. 提出冲突："其实数据分析更重要，改一下优先级"

自然对话，测试完回复 "[TEST_DONE]"`,
  maxTurns: 8,
};

export const allScenarios = [memoryScenario, taskPlanningScenario];
