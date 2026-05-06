# Message-Based Mode 完整设计方案

## 核心原则

**体验目标：**
- AI 像人一样自然交流，边想边说
- 用户看到的是最终结果，不是工具调用过程
- AI 保留完整推理历史，知道自己怎么思考的

**技术原则：**
- 简化架构：移除 working/durable 分离
- Prompt 约束行为，不靠工具限制
- 保留现有压缩、token 管理机制
- 工具返回简洁结果，避免污染 session

---

## 架构对比

### 当前 Ultra Mode
```
用户消息 → AI 推理 → 调用 reply 工具 → 发送给用户
                  ↓
            调用其他工具 → 继续推理 → 调用 reply → 发送
                                    ↓
                              调用 pause_turn → 结束

Session 分两层：
- working trace: 完整工具调用（AI 看到）
- durable transcript: 过滤后消息（持久化）
```

**问题：**
- 架构复杂，两层消息管理
- reply 工具调用打断自然流程
- transcriptMode 机制复杂
- AI 看不到完整历史（durable 过滤了工具细节）

### 新 Message-Based Mode
```
用户消息 → AI 推理 → 输出文本 → 自动转发给用户，结束
                  ↓
            调用 thinking 工具 → 继续推理
                  ↓
            调用其他工具 → 继续推理
                  ↓
            输出文本 → 自动转发，结束

Session 单层：
- messages[]: 完整对话历史（user/assistant/tool）
- AI 看到所有 thinking 和工具调用
- 自动压缩旧消息，保留核心信息
```

**优势：**
- 架构简单，单层消息
- 自然结束：不调用工具 = 最终回答
- AI 保留完整推理记忆
- 通过 prompt 约束行为

---

## 详细设计

### 1. 工具变化

**移除：**
- `reply` - 不再需要，assistant 文本自动转发
- `pause_turn` - 不再需要，不输出文本即可

**新增：**
- `thinking` - 内部推理工具

**保留：**
- 所有其他工具（read/write/edit/grep/glob/bash/send_file/skill）

### 2. thinking 工具设计

```typescript
{
  name: 'thinking',
  description: `内部推理工具，记录思考过程（用户看不到）。

使用场景：
- 分析问题、规划步骤
- 权衡方案、中间推理
- 任何不需要用户看到的思考过程

重要规则：
- thinking 内容不会发送给用户
- 可以多次调用逐步推理
- 只有最终不调用任何工具时，你的文本才会发给用户
- thinking 会保留在对话历史中，你能看到自己的推理过程`,

  transcriptMode: 'default',  // 保留在 session

  parameters: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: '思考内容'
      }
    },
    required: ['content']
  }
}
```

**实现：**
```typescript
async execute(args: any): Promise<string> {
  const { content } = args;
  Logger.info(`[thinking] ${content.slice(0, 200)}...`);
  return '继续推理';
}
```

### 3. System Prompt 设计

**核心约束：**
```markdown
# 消息模式说明

你的每次文本输出都会**立即自动发送给用户**。

## 工作流程

1. **需要推理时**：调用 thinking 工具记录思考（用户看不到）
2. **需要操作时**：调用相应工具（read/write/edit 等）
3. **准备回答时**：直接输出文本，会自动发给用户并结束对话

## 重要规则

- 如果还需要调用工具，**不要输出任何文本**
- 只在最终准备回答用户时才输出文本
- 可以多次调用 thinking 逐步推理
- thinking 内容用户看不到，但你能看到（保留在历史中）

## 示例流程

错误示例：
```
Assistant: 让我先读取文件  ← 这会立即发给用户！
Tool: read(...)
```

正确示例：
```
Tool: thinking("用户要修改文件，我先读取看看")
Tool: read(...)
Tool: thinking("文件内容是...我应该...")
Tool: edit(...)
Assistant: 已修改完成  ← 这才发给用户
```
```

### 4. Conversation Runner 改造

**关键变化：**

```typescript
// 当 AI 不调用工具时
if (!response.toolCalls || response.toolCalls.length === 0) {
  const finalText = response.content || '';

  if (finalText && this.toolExecutionContext?.channel) {
    // 自动转发给用户
    await this.toolExecutionContext.channel.reply(
      this.toolExecutionContext.channel.chatId,
      finalText
    );
    Logger.info(`[message-based] 已自动转发: ${finalText.slice(0, 100)}`);
  }

  // 保存 assistant 消息到 session
  messages.push({
    role: 'assistant',
    content: finalText
  });

  return {
    response: '',
    finalResponseVisible: false,
    messages
  };
}
```

**移除：**
- working/durable 消息分离逻辑
- transcriptMode 过滤逻辑
- outbound_message/outbound_file 特殊处理

**保留：**
- 上下文压缩机制
- Token 预算管理
- 工具重试逻辑

### 5. Session 管理简化

**messages[] 结构：**
```typescript
[
  { role: 'system', content: 'system prompt...' },
  { role: 'user', content: '用户消息' },
  { role: 'assistant', tool_calls: [thinking(...)] },
  { role: 'tool', content: '继续推理', tool_call_id: '...' },
  { role: 'assistant', tool_calls: [read(...)] },
  { role: 'tool', content: '文件内容...', tool_call_id: '...' },
  { role: 'assistant', content: '修改完成' },  // 自动转发
  { role: 'user', content: '下一个问题' },
  ...
]
```

**持久化：**
- 所有消息保存到 SessionStore
- 不再区分 visible/invisible
- 压缩时保留 thinking 和关键工具调用

### 6. 工具返回优化

**原则：工具返回简洁结果**

**需要优化的工具：**
- `read` - 超过 2000 字符自动截断
- `grep` - 限制返回行数
- `bash` - 限制输出长度
- 未来：`web_fetch` skill 化，只返回摘要

**thinking 工具：**
- 返回固定文本 "继续推理"
- 不污染 session

---

## 实施计划

### Phase 1: 核心功能（新分支）
1. 创建 `thinking` 工具
2. 修改 conversation-runner：
   - 移除 working/durable 分离
   - 实现自动转发逻辑
   - 简化消息管理
3. 修改 agent-session：
   - 更新 system prompt
   - 移除 reply/pause_turn 工具
   - 简化消息持久化
4. 添加环境变量：`GAUZ_MESSAGE_MODE=message`

### Phase 2: 测试验证
1. 本地 CLI 测试
2. CatsCompany 平台测试
3. 验证 thinking 工具行为
4. 验证自动转发逻辑

### Phase 3: 优化调整
1. 根据测试调整 prompt
2. 优化工具返回长度
3. 调整压缩策略
4. 性能优化

### Phase 4: Skill 化复杂工具
1. web_fetch → skill
2. spawn_subagent → 保持现状或优化
3. 其他需要的工具

---

## 风险和应对

**风险1：AI 不遵守规则，提前输出文本**
- 应对：强化 prompt，添加示例
- 应对：如果输出了文本但还需要工具，在下一轮提示"你刚才的消息已发送给用户"

**风险2：thinking 内容过多污染 session**
- 应对：压缩时优先压缩 thinking
- 应对：Prompt 引导简洁 thinking

**风险3：工具返回内容过长**
- 应对：工具层面截断
- 应对：复杂工具 skill 化

**风险4：用户体验变差（响应慢）**
- 应对：监控 turn 数量
- 应对：Prompt 引导高效推理

---

## 成功标准

**功能：**
- ✅ AI 输出自动转发给用户
- ✅ thinking 工具正常工作
- ✅ AI 能看到完整推理历史
- ✅ 不再需要 reply/pause_turn

**体验：**
- ✅ 交互自然，像人类对话
- ✅ 响应及时，不拖沓
- ✅ 推理清晰，可追溯

**架构：**
- ✅ 代码简化，易维护
- ✅ Session 管理清晰
- ✅ 保留现有压缩机制
