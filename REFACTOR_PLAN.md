# XiaoBa 架构简化重构方案

## 核心原则

1. **工具 vs Skill 清晰分离**
   - 工具：基础能力（read/write/bash 等），直接注册到 context window
   - Skill：复杂能力包，包含 SKILL.md + 可选 scripts，通过 bash 工具调用

2. **保持 Session 独立性（核心特性，不可破坏）**
   - 不同平台（CatsCompany/Feishu）独立运行，不阻塞
   - 不同 session（usr3/usr4/group1）独立运行，不阻塞
   - Session 之间不污染，各自独立的 AgentSession 实例

3. **去除过度抽象**
   - 删除三层工具过滤机制
   - 删除无用的 Manager
   - 合并重复代码（但保持 session 独立）

## 当前问题总结

### 1. 工具系统混乱
- 27 个工具文件，很多是伪工具（应该是 skill）
- 三层过滤机制：allowedTools → ESSENTIAL_TOOLS → toolPolicy
- 工具别名、工具策略网关等过度设计

### 2. 概念混淆
- skill-tool, spawn-subagent-tool, task-planner-tool 等不是"工具"
- web-search, web-fetch, feishu-mention 应该是 skill
- AgentManager 管理的 5 种 agent 类型已废弃（task-tool 未注册）

### 3. 重复代码
- CatsCompany 和 Feishu 的 session-manager 90% 相同
- CatsCompany 和 Feishu 的 message-sender 逻辑重复
- 三套日志系统、两套存储系统

### 4. 职责不清
- agent-session.ts (1000+ 行) 做太多事
- core/ 和 utils/ 边界模糊
- agents/ 目录定位不清（已废弃的 agent 类型）

## 目标架构

### 工具系统（11 个工具）
```
基础文件工具（6个）：
  - read, write, edit, glob, grep, bash

通信工具（2个）：
  - send_text, send_file

元工具（2个）：
  - thinking, spawn_subagent

Skill 调用（1个）：
  - skill
```

### Skill 系统
```
skills/
  ├── web-research/
  │   ├── SKILL.md
  │   ├── search.py
  │   └── fetch.py
  ├── feishu-collab/
  │   ├── SKILL.md
  │   └── mention.py
  ├── task-planning/
  │   ├── SKILL.md
  │   └── plan.py
  └── ...
```

### 核心架构
```
src/
  ├── core/
  │   ├── agent.ts              # 统一的 agent 实现
  │   ├── session.ts            # 统一的会话管理
  │   ├── conversation-runner.ts
  │   ├── sub-agent.ts          # 子智能体（核心能力）
  │   └── context-compressor.ts
  ├── platforms/
  │   ├── catscompany/
  │   │   └── adapter.ts        # 只做协议适配
  │   └── feishu/
  │       └── adapter.ts        # 只做协议适配
  ├── tools/
  │   ├── read.ts
  │   ├── write.ts
  │   ├── ... (11 个工具)
  │   └── tool-manager.ts       # 简化版
  ├── skills/
  │   ├── skill-manager.ts
  │   └── skill-executor.ts
  └── utils/
      ├── logger.ts             # 统一日志
      ├── storage.ts            # 统一存储
      └── config.ts

---

## 重构任务清单

### 阶段 1：工具系统简化（最高优先级）

#### 任务 1.1：精简工具到 11 个
**删除以下工具文件（伪工具，应该是 skill）：**
- [ ] `tools/web-search-tool.ts` → 移到 `skills/web-research/search.py`
- [ ] `tools/web-fetch-tool.ts` → 移到 `skills/web-research/fetch.py`
- [ ] `tools/feishu-mention-tool.ts` → 移到 `skills/feishu-collab/mention.py`
- [ ] `tools/task-planner-tool.ts` → 移到 `skills/task-planning/plan.py`
- [ ] `tools/todo-write-tool.ts` → 移到 `skills/task-planning/`
- [ ] `tools/send-segments-tool.ts` → 已废弃，已替换为 send-text

**删除以下工具文件（已废弃）：**
- [ ] `tools/task-tool.ts` → 未注册，废弃代码
- [ ] `tools/task-output-tool.ts` → 依赖 task-tool
- [ ] `tools/task-stop-tool.ts` → 依赖 task-tool
- [ ] `tools/enter-plan-mode-tool.ts` → 检查是否使用
- [ ] `tools/exit-plan-mode-tool.ts` → 检查是否使用
- [ ] `tools/plan-mode-store.ts` → 检查是否使用

**保留工具（11 个）：**
- [ ] read, write, edit, glob, grep, bash (6个)
- [ ] send_text, send_file (2个)
- [ ] thinking, spawn_subagent (2个)
- [ ] skill (1个)

**额外保留（需确认）：**
- [ ] `check-subagent-tool.ts` → 检查子智能体状态
- [ ] `stop-subagent-tool.ts` → 停止子智能体
- [ ] `resume-subagent-tool.ts` → 恢复子智能体
- [ ] `recall-log-tool.ts` → 查询历史日志

#### 任务 1.2：移除工具过滤机制
- [ ] 删除 `conversation-runner.ts` 的 `allowedTools` 白名单（第 131 行）
- [ ] 删除 `ESSENTIAL_TOOLS` 常量（第 15-18 行）
- [ ] 删除 `applyToolPolicy` 方法（第 536-562 行）
- [ ] 删除 skill 的 `toolPolicy` 配置支持
- [ ] 简化 `getToolDefinitions()` 直接返回所有工具

#### 任务 1.3：清理工具相关代码
- [ ] 删除 `utils/tool-policy-gateway.ts`
- [ ] 删除 `utils/tool-aliases.ts`
- [ ] 简化 `tool-manager.ts`（只保留注册和执行逻辑）

---

### 阶段 2：Skill 系统重构

#### 任务 2.1：迁移伪工具到 Skills
**创建新的 skill 目录结构：**
- [ ] `skills/web-research/` - 网络搜索和抓取
  - SKILL.md
  - search.py (from web-search-tool)
  - fetch.py (from web-fetch-tool)

- [ ] `skills/task-planning/` - 任务规划
  - SKILL.md
  - plan.py (from task-planner-tool)
  - todo.py (from todo-write-tool)

- [ ] 更新 `skills/feishu-collab/` - 飞书协作
  - 添加 mention.py (from feishu-mention-tool)

#### 任务 2.2：更新现有 Skills
检查并更新 `skills/_tool-skills/` 下的 9 个 skills：
- [ ] academic-search
- [ ] context-recall
- [ ] feishu-collab
- [ ] image-analysis
- [ ] multi-agent
- [ ] sub-agent
- [ ] task-planning
- [ ] web-research
- [ ] agent-browser

确保每个都有清晰的 SKILL.md 和必要的 scripts。

---

### 阶段 3：Agent 系统清理

#### 任务 3.1：删除废弃的 Agent 类型
**已确认废弃（task-tool 未注册）：**
- [ ] 删除 `src/agents/general-purpose-agent.ts`
- [ ] 删除 `src/agents/bash-agent.ts`
- [ ] 删除 `src/agents/code-reviewer-agent.ts`
- [ ] 删除 `src/agents/agent-manager.ts`

**需要检查是否使用：**
- [ ] 检查 `src/agents/explore-agent.ts` 的调用
- [ ] 检查 `src/agents/plan-agent.ts` 的调用
- [ ] 如果未使用，也删除

#### 任务 3.2：简化 agent-session.ts
- [ ] 拆分 agent-session.ts（1000+ 行太大）
- [ ] 分离职责：
  - 会话管理 → session.ts
  - Skill 激活 → skill-activation.ts
  - 命令处理 → command-handler.ts
- [ ] 移除重复逻辑

#### 任务 3.3：检查 Sub-Agent 复用
- [ ] 检查 `sub-agent-session.ts` 是否可以复用 `agent-session.ts`
- [ ] 合并重复代码（如果可能）

---

### 阶段 4：平台适配层统一（保持 Session 独立性）

#### 任务 4.1：创建统一的 Session 管理
**重要：保持 session 独立性，只合并代码逻辑**

- [ ] 创建 `src/core/message-session-manager.ts`
  - 统一的 session 生命周期管理
  - 支持多平台 session key（cc_user:xxx, feishu_group:xxx）
  - 保持每个 session 独立的 AgentSession 实例
  - 不同 session 不阻塞、不污染

- [ ] 删除 `src/catscompany/session-manager.ts`
- [ ] 删除 `src/feishu/session-manager.ts`

#### 任务 4.2：统一消息发送
- [ ] 创建 `src/core/message-sender.ts`（统一接口）
- [ ] 删除 `src/catscompany/message-sender.ts`
- [ ] 删除 `src/feishu/message-sender.ts`
- [ ] 平台适配器只负责协议转换

#### 任务 4.3：简化平台适配器
**CatsCompany 适配器：**
- [ ] 重构 `src/catscompany/index.ts` 为纯协议适配
  - 接收 WebSocket 消息 → 转成统一格式
  - 统一格式 → 发送到 WebSocket
  - 业务逻辑移到 core/

**Feishu 适配器：**
- [ ] 重构 `src/feishu/index.ts` 为纯协议适配
  - 接收飞书事件 → 转成统一格式
  - 统一格式 → 调用飞书 API
  - 业务逻辑移到 core/

---

### 阶段 5：Utils 清理

#### 任务 5.1：合并日志系统
- [ ] 统一 `logger.ts`、`context-debug-logger.ts`、`turn-log-store.ts`
- [ ] 只保留一套日志接口
- [ ] 支持不同日志级别和输出目标

#### 任务 5.2：合并存储系统
- [ ] 统一 `session-store.ts` 和 `local-session-store.ts`
- [ ] 只保留一套存储接口

#### 任务 5.3：移动错位的文件
- [ ] `ai-service.ts` 移到 `providers/`
- [ ] 检查并删除无用的 `safety.ts`

---

### 阶段 6：项目结构整理

#### 任务 6.1：清理根目录
- [ ] 移动所有 `test-*.ts/mjs/py` 到 `tests/`
- [ ] 移动所有 `*.log` 到 `logs/`（添加到 .gitignore）
- [ ] 移动所有 `*.png` 到 `tests/screenshots/`
- [ ] 移动所有 `*-REPORT.md` 到 `docs/reports/`

#### 任务 6.2：清理无用目录和文件
- [ ] 检查并删除 `rpg_game/`
- [ ] 检查并删除 `tools/`（Python tools）
- [ ] 检查并删除 `workspace/`
- [ ] 删除 `deploy/`（如果无用）
- [ ] 删除根目录的临时文件（cat.svg, error.png 等）

#### 任务 6.3：整理配置
- [ ] 清理 `.env` 中的过期配置
- [ ] 统一配置文件位置

---

### 阶段 7：文档更新

#### 任务 7.1：更新架构文档
- [ ] 更新 `ARCHITECTURE.md`
- [ ] 更新 `SKILL-DEVELOPMENT.md`
- [ ] 更新 `README.md`

#### 任务 7.2：添加迁移指南
- [ ] 创建 `MIGRATION.md` 说明变更
- [ ] 列出不兼容的改动
- [ ] 提供迁移步骤

---

## 预期效果

### 代码量
- 从 13,000 行减少到 6,000 行（-50%）
- 工具从 27 个减少到 11 个（-60%）
- Manager 从 5 个减少到 2 个（-60%）

### 架构清晰度
- 工具 vs Skill 概念清晰
- 平台适配层职责单一
- 核心逻辑集中在 core/

### 维护性
- 新增工具只需注册，无需配置白名单
- 新增 skill 只需添加目录和 SKILL.md
- 平台适配器简单，易于扩展

### 核心特性保持
- ✅ 不同平台独立运行，不阻塞
- ✅ 不同 session 独立运行，不阻塞
- ✅ Session 之间不污染
- ✅ 群聊和私聊独立

---

## 执行建议

1. **按阶段执行**，每个阶段完成后测试
2. **优先级**：阶段 1 > 阶段 2 > 阶段 3 > 其他
3. **每个阶段后**：
   - 运行测试确保功能正常
   - 提交 git commit
   - 更新文档

4. **风险控制**：
   - 每次改动前备份
   - 保持 git 历史清晰
   - 可以随时回滚


