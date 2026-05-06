# XiaoBa 架构拆分方案：Core Runtime + Skill Runtime

## 当前代码结构总览

```
src/
├── core/           # 对话引擎（agent-session, conversation-runner, session管理, sub-agent, 上下文压缩, token估算）
├── providers/      # LLM 提供商（anthropic, openai）
├── tools/          # 内置工具（14个：文件操作、shell、通信、thinking、skill调用、subagent管理）
├── agents/         # 子Agent执行器
├── skills/         # Skill系统（manager, executor, parser, activation-protocol）
├── catscompany/    # CatsCompany 平台适配
├── feishu/         # 飞书平台适配
├── bridge/         # Bridge 远程连接
├── commands/       # CLI 命令入口
├── types/          # 类型定义
├── utils/          # 工具函数（ai-service, config, logger, metrics, prompt-manager, session-store 等）
├── theme/          # CLI 主题
└── index.ts        # 入口
```

---

## 拆分方案

### 一、XiaoBa Core Runtime（核心运行时）

负责：消息收发、对话循环、session管理、工具执行、LLM调用、上下文管理

包含模块：
- `core/conversation-runner.ts` — 对话循环引擎
- `core/agent-session.ts` — 会话核心（去掉 skill 硬编码依赖）
- `core/message-session-manager.ts` — 会话生命周期管理
- `core/sub-agent-manager.ts` — 子智能体管理（去掉 SkillManager 直接依赖）
- `core/sub-agent-session.ts` — 子智能体会话
- `core/context-compressor.ts` — 上下文压缩
- `core/token-estimator.ts` — Token 估算
- `providers/*` — LLM 提供商
- `tools/*`（除 skill-tool.ts）— 内置工具
- `agents/*` — 子Agent执行器
- `catscompany/*` — 平台适配
- `feishu/*` — 平台适配
- `bridge/*` — 远程连接
- `commands/*` — CLI 入口
- `utils/*` — 基础工具函数
- `types/tool.ts`, `types/agent.ts`, `types/index.ts` — 核心类型

### 二、Skill Runtime（技能运行时）

负责：skill 的发现、加载、解析、执行、激活、生命周期管理

包含模块：
- `skills/skill-manager.ts` — Skill 管理器
- `skills/skill-executor.ts` — Skill 执行器
- `skills/skill-parser.ts` — Skill 解析器（SKILL.md → Skill 对象）
- `skills/skill-activation-protocol.ts` — 激活协议
- `tools/skill-tool.ts` — Skill 调用工具（作为插件注册到 Core）
- `types/skill.ts` — Skill 类型定义
- `skills/` 目录下的实际 skill 文件

---

## 当前耦合点分析（需要解耦的地方）

### 耦合点 1：AgentServices 硬依赖 SkillManager

```typescript
// agent-session.ts 当前
export interface AgentServices {
  aiService: AIService;
  toolManager: ToolManager;
  skillManager: SkillManager;  // ← 硬依赖
}
```

**改法**：定义 `ISkillProvider` 接口，Core 只依赖接口

```typescript
// core/types.ts（新增）
export interface ISkillProvider {
  getSkill(name: string): SkillInfo | undefined;
  getUserInvocableSkills(): SkillInfo[];
  findAutoInvocableSkillByText(text: string): SkillInfo | undefined;
  loadSkills(): Promise<void>;
  buildActivationSignal(skill: SkillInfo, context: SkillInvocationContext): SkillActivationSignal;
}

export interface AgentServices {
  aiService: AIService;
  toolManager: ToolManager;
  skillProvider?: ISkillProvider;  // ← 可选，Skill Runtime 注入
}
```

### 耦合点 2：ConversationRunner 内嵌 skill 激活逻辑

```typescript
// conversation-runner.ts 当前 L278-293
const activation = this.tryParseSkillActivation(toolCall, result.content);
if (activation) {
  this.activeSkillName = activation.skillName;
  upsertSkillSystemMessage(messages, activation);
  // ...
}
```

**改法**：引入 `ToolResultHook` 机制，Skill Runtime 注册 hook

```typescript
// Core 定义 hook 接口
export interface ToolResultHook {
  onToolResult(toolCall: ToolCall, result: ToolResult, messages: Message[]): void;
}

// Skill Runtime 实现
class SkillActivationHook implements ToolResultHook { ... }

// ConversationRunner 构造时接受 hooks
constructor(aiService, toolExecutor, options?: RunnerOptions & { hooks?: ToolResultHook[] })
```

### 耦合点 3：SubAgentManager.spawn() 直接依赖 SkillManager

```typescript
// sub-agent-manager.ts 当前
spawn(parentSessionKey, skillName, ..., skillManager: SkillManager) {
  const skill = skillManager.getSkill(skillName);
  // ...
}
```

**改法**：改为接受 `ISkillProvider`

### 耦合点 4：ToolManager 硬编码注册 SkillTool

```typescript
// tool-manager.ts 当前
this.registerTool(new SkillTool());  // ← 硬编码
```

**改法**：SkillTool 由 Skill Runtime 在初始化时动态注册

```typescript
// Skill Runtime 初始化
toolManager.registerTool(new SkillTool(skillManager));
```

### 耦合点 5：AgentSession 中的 skill 相关逻辑

agent-session.ts 中有大量 skill 相关代码：
- `tryAutoActivateSkill()` — 自动激活
- `handleSkillCommand()` — 斜杠命令
- `handleSkillsCommand()` — /skills 列表
- `applySkillActivation()` — 激活应用
- `detectActiveSkillName()` / `detectSkillMaxTurns()` — 状态检测
- skill 系统消息的注入和清理

**改法**：抽取为 `SkillSessionMixin` 或 `SkillSessionExtension`，由 Skill Runtime 注入

```typescript
// Skill Runtime 提供
class SkillSessionExtension {
  tryAutoActivate(session, userText): void;
  handleCommand(session, command, args): CommandResult | null;
  onTurnEnd(session): void;  // 清理 skill 状态
}

// AgentSession 支持扩展
class AgentSession {
  private extensions: SessionExtension[] = [];
  registerExtension(ext: SessionExtension): void;
}
```

---

## 拆分后的依赖关系

```
┌─────────────────────────────────────────────┐
│              Skill Runtime                   │
│  ┌─────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ Manager │ │ Executor │ │ SkillTool    │ │
│  │ Parser  │ │ Protocol │ │ (plugin)     │ │
│  └────┬────┘ └────┬─────┘ └──────┬───────┘ │
│       │           │              │          │
│       └───────────┴──────────────┘          │
│                    │                         │
│          implements ISkillProvider           │
│          registers SkillTool                 │
│          registers ToolResultHook            │
│          registers SessionExtension          │
└────────────────────┬────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│              Core Runtime                    │
│  ┌──────────────┐  ┌───────────────────┐    │
│  │ AgentSession │  │ConversationRunner │    │
│  │ SessionMgr   │  │ ToolManager       │    │
│  │ SubAgentMgr  │  │ Providers         │    │
│  └──────────────┘  └───────────────────┘    │
│                                              │
│  接口：ISkillProvider, ToolResultHook,       │
│        SessionExtension, Tool (register)     │
└──────────────────────────────────────────────┘
```

Core 不 import 任何 skill 实现代码，只定义接口。
Skill Runtime 实现接口并注册到 Core。
没有 Skill Runtime 时，Core 照常运行，只是没有 skill 能力。

---

## 建议的实施步骤

### Phase 1：定义接口层（不改现有行为）
1. 在 `types/` 中新增 `ISkillProvider`、`ToolResultHook`、`SessionExtension` 接口
2. 让现有 `SkillManager` 实现 `ISkillProvider`
3. `AgentServices.skillManager` 改为 `AgentServices.skillProvider?: ISkillProvider`

### Phase 2：解耦 ConversationRunner
4. 把 skill activation 逻辑从 `run()` 中抽出，改为 hook 机制
5. 移除 `conversation-runner.ts` 对 `skill-activation-protocol` 的直接 import

### Phase 3：解耦 AgentSession
6. 把 skill 相关方法抽到 `SkillSessionExtension`
7. AgentSession 通过 extension 机制调用，不直接 import skill 代码

### Phase 4：解耦 ToolManager
8. 移除 `SkillTool` 的硬编码注册
9. 改为 Skill Runtime 初始化时动态注册

### Phase 5：解耦 SubAgentManager
10. `spawn()` 参数从 `SkillManager` 改为 `ISkillProvider`

### Phase 6：目录重组（可选）
11. 物理上把 skill 相关文件移到独立目录或独立 package

---

## 每个 Phase 的预估工作量

| Phase | 改动范围 | 风险 | 预估 |
|-------|---------|------|------|
| 1 | 新增接口 + 改 AgentServices 类型 | 低 | 1-2h |
| 2 | conversation-runner 重构 | 中 | 2-3h |
| 3 | agent-session 重构（最大改动） | 中高 | 3-4h |
| 4 | tool-manager 小改 | 低 | 0.5h |
| 5 | sub-agent-manager 小改 | 低 | 0.5h |
| 6 | 目录重组 + import 路径更新 | 低 | 1h |

总计约 8-11h，建议按 Phase 逐步推进，每个 Phase 完成后测试确认不影响现有功能。
