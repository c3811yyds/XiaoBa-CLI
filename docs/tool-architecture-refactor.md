# 工具架构重构方案

## 当前问题

1. **toolPolicy 机制过于复杂**
   - allowedTools/disallowedTools/additionalTools 三层配置
   - 工具阻断导致用户体验差
   - skill 激活后工具限制不可预测

2. **工具和脚本混淆**
   - spawn_subagent 等应该是脚本，却注册为 TypeScript 工具
   - additional-tools 机制不清晰
   - 脚本应该放在 skill 目录，而不是 src/tools/

3. **无用代码**
   - python-tool-loader.ts 和 python-tool-wrapper.ts 未被使用

## 目标架构

### 三层体系

```
┌─────────────────────────────────────┐
│  Layer 1: Core Tools (TS, 永远可用) │
│  - read/write/edit/glob/grep        │
│  - execute_shell (执行脚本)         │
│  - skill (激活 skill)               │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  Layer 2: Surface Tools (TS, 按场景)│
│  - reply/send_file (user surface)   │
│  - pause_turn (ultra mode)          │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  Layer 3: Skill Scripts (热加载)    │
│  - skills/sub-agent/*.py|.ts        │
│  - skills/web-research/*.py         │
│  - 通过 execute_shell 执行          │
│  - 不注册到 ToolManager             │
└─────────────────────────────────────┘
```

### 核心原则

1. **工具 vs 脚本分离**
   - 工具 = TypeScript 类，注册到 ToolManager
   - 脚本 = 可执行文件，放在 skill 目录，通过 execute_shell 执行

2. **移除 toolPolicy**
   - AI 可以自由调用 Layer 1 + Layer 2 工具
   - Layer 2 通过 surface 控制（不是 skill）
   - Layer 3 不是工具，是脚本

3. **Skill 配置简化**
   - skill.md 描述脚本用法
   - 移除 additional-tools 字段
   - 移除 toolPolicy 字段

## 实施步骤

### Phase 1: 迁移 TypeScript 工具到脚本
- [ ] spawn_subagent/check_subagent/stop_subagent/resume_subagent
  - 从 src/tools/ 移到 skills/sub-agent/
  - 改成可执行脚本
  - 从 ToolManager 注册中移除

- [ ] web_search/web_fetch
  - 从 src/tools/ 移到 skills/web-research/
  - 改成可执行脚本

### Phase 2: 移除 toolPolicy 机制
- [ ] 移除 allowedTools/disallowedTools 逻辑
- [ ] 移除 additional-tools 处理
- [ ] 移除 applyToolPolicy 方法

### Phase 3: 实现 Surface-based filtering
- [ ] ToolManager 根据 surface 过滤工具
- [ ] agent surface 禁用 reply/send_file
- [ ] 移除 skill 的工具限制检查

### Phase 4: 清理无用代码
- [ ] 删除 python-tool-loader.ts
- [ ] 删除 python-tool-wrapper.ts
- [ ] 更新所有 skill.md，移除 additional-tools

### Phase 5: 文档和测试
- [ ] 更新 skill 开发文档
- [ ] 补充工具架构说明
- [ ] 测试所有 skill

## 风险评估

**高风险：**
- spawn_subagent 等工具改成脚本，需要保持功能一致
- 需要充分测试

**中风险：**
- 移除 toolPolicy 可能导致意外行为
- 需要 surface filtering 正确实现

**低风险：**
- 代码清理
- 文档更新
