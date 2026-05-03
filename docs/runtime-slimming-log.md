# XiaoBa Runtime 瘦身记录

## 目标

这份文档记录 XiaoBa runtime 瘦身过程中的每个切片，避免重构决策只停留在聊天记录里。

长期目标：
- 收敛为一个更薄、更清晰的 runtime 内核
- 明确 runtime 的真实配置源，而不是散落在 prompt、tool 默认值和 adapter 代码里
- 把 `cli`、`feishu`、`weixin`、`catscompany` 退回到纯适配层
- 把日志链路先统一成稳定的采集与上传，再考虑云端分析和数据挖掘

## 当前共识

- 内核优先收敛到少数稳定对象：`RuntimeProfile`、`RuntimeFactory`、`PromptComposer`、`ToolRegistry`、`AgentSession`、`ConversationRunner`
- prompt 系统需要明显简化，避免过时模块长期叠加成噪音
- tool 管理先保持简单，不先引入过重的策略层
- `AgentSession` 必须瘦身，不再混杂 prompt、surface、tool、skill 和平台逻辑
- `workingDirectory`、system prompt、tool 默认值需要有统一真相源

## 进行中的主线

当前工作分支：`codex/runtime-foundation`

本阶段目标：
1. 先修稳定性问题和明显技术债
2. 补最关键的 characterization / regression tests
3. 定义统一的 session event schema
4. 引入最小版 `RuntimeProfile` 和 `RuntimeFactory`
5. 把运行时默认值收敛为统一配置源

提交边界：
- 当前工作区存在 dashboard、TODO、临时资源等无关改动
- 本分支的 runtime foundation 提交只应包含日志止血、回归测试、runtime 瘦身文档，以及后续明确纳入本阶段的 runtime 文件

## 后续路线图

这份顺序是当前默认路线，允许根据测试、审查和实际耦合点调整，但调整必须记录在本文件里。

### Phase A - Runtime Foundation

目标：先稳定日志和现有行为，给后续重构建立保护网。

状态：完成

已完成：
- Slice 1: 日志链路止血
- Slice 2: 统一 session event schema
- Slice 3: Runtime 行为保护测试
- Slice 4: 定义最小 `RuntimeProfile`
- Slice 5: 引入最小 `RuntimeFactory`，先迁 CLI 入口

剩余：
- Phase A 完成后，进入 Phase B - Prompt Simplification

### Phase B - Prompt Simplification

目标：把 `PromptManager.buildSystemPrompt()` 拆成更薄的 `PromptComposer`，降低 prompt 噪音。

状态：完成

计划顺序：
- 先让 `PromptComposer` 只复刻当前 prompt 行为
- 把运行时信息改为从 `RuntimeProfile` 读取
- 再清理冗余 prompt 层，合并不再有价值的 base/behavior/surface 片段
- surface prompt 降级为短传输契约，不继续承担人格或策略说明

### Phase C - Tool Boundary

目标：让工具清单显式来自 runtime 配置，同时保持 tool 管理简单。

状态：完成

计划顺序：
- 先让 `RuntimeProfile.tools` 表达当前默认工具清单
- `ToolManager` 保留注册和执行职责，不引入复杂 policy engine
- 后续安全检查放在独立 guard/hook，不塞进工具注册层
- 不好的工具优先修改或移除，定制化能力优先 skill 化

已完成：
- `RuntimeProfile.tools.enabled` 表达默认工具清单
- `RuntimeFactory` 创建 `ToolManager` 时按 profile 启用工具
- 默认工具名集中到共享模块，避免 runtime profile 和工具注册清单漂移
- runtime profile 增加最小 tool validation，unknown / duplicate tool names 在 factory 边界 fail-fast
- `ToolExecutor.getToolDefinitions()` 移除 unused `allowedNames` 参数，避免接口暗示 runner 层还有动态工具过滤

### Phase D - AgentSession Slimming

目标：让 `AgentSession` 回到会话状态、历史、中断、持久化和 runner 调用。

状态：完成

计划顺序：
- surface prompt 注入迁出 `AgentSession`
- skill 自动激活和 slash command 处理迁到 skill runtime/extension
- 工作目录、工具默认值、prompt 构建都改为通过 runtime 配置注入
- `ConversationRunner` 保持推理循环核心，不承担 adapter 逻辑

已完成：
- surface system prompt 注入迁出 `AgentSession`
- skill activation、skill slash command、transient skill list 迁到 `SessionSkillRuntime`
- 工作目录、工具默认值、prompt 构建已通过 `RuntimeProfile` / `RuntimeFactory` / provider 注入
- `AgentSession` 当前保留职责：会话状态、历史、busy/interrupt、cleanup、runner 编排和 session log

### Phase E - Adapter Separation

目标：把 CLI、Feishu、Weixin、CatsCompany 收敛成通讯适配层。

状态：完成

计划顺序：
- 各 adapter 只负责消息收发、身份映射、channel callbacks
- runtime 创建统一通过 `RuntimeFactory`
- adapter 不再自行决定 prompt、tool、skill、working directory 默认值

已完成：
- CLI 通过 `RuntimeFactory.createSession()` 创建 runtime
- Feishu/CatsCompany/Weixin 通过 `createAdapterRuntime()` 获取 services、session manager options、skill loading lifecycle
- 三个 message adapter 不再直接 new runtime services，也不再直接调用 `RuntimeFactory`
- adapter 仍保留平台通讯、身份映射、附件处理、消息队列和 channel callback

### Phase F - Dashboard Runtime Config

状态：完成当前只读快照目标；暂不做编辑能力。

目标：Electron dashboard 先能看见当前真实配置，再逐步允许编辑。

计划顺序：
- 只读展示当前 `RuntimeProfile`
- 展示真实 `workingDirectory`
- 展示当前 system prompt 展开结果
- 展示注册工具清单和启用 skills
- 展示日志写入路径和上传状态
- 再考虑可视化编辑 profile

### Phase G - External Agent Orchestration

状态：完成设计骨架和 adapter spike；未接入主 runtime 路径。

目标：在 runtime foundation 稳定后，把外部 Codex / Claude Code / OpenCode 作为可插拔 worker runtime。

计划顺序：
- 先写设计和小型 adapter spike，不接入主路径
- 定义 `ExternalAgentRegistry`、`ExternalAgentControl`、`CodingAgentAdapter`、`TaskPacket`
- 实现独立 `ProcessRunner`，不要复用 `ShellTool` 承担长任务
- 写任务默认隔离目录，正式接入前再升级为 git worktree / sandbox 策略
- 结果必须由 XiaoBa 验收，包括 diff、测试、风险总结
- 正式接入等 `RuntimeProfile` / `RuntimeFactory` 和 `SubAgentManager` 边界稳定后再做

### Phase H - AgentSession Turn Pipeline

状态：完成。

目标：继续瘦 `AgentSession`，先拆单轮消息处理路径，不先拆生命周期。

白话目标：
- `AgentSession` 保留 session id、公开入口、busy/interrupt、命令入口和对 turn pipeline 的调用
- 一轮消息怎么拼上下文、怎么压缩、怎么写日志，迁到更小的专门模块
- 不新增功能，不接入外部子 agent 主路径，只为后续能力保留清晰边界

关键原则：
- 先瘦 turn path，再处理 lifecycle；`SessionLifecycleManager` 放后一阶段
- durable transcript 和 provider input 分离：长期历史只保存可恢复上下文，本轮临时信息只用于本轮模型输入
- runtime feedback、skills list、subagent status 都是 provider input 的临时补充，不能被压缩进长期 summary
- `injectContext` 当前是跨 turn 的内存注入，不是一次性 transient；本阶段不能顺手改变语义
- `ConversationRunner.ensurePromptBudget()` 继续保留为最后防线，不能因为前置压缩而删除

计划顺序：
1. `RuntimeFeedbackInbox`
   迁出 runtime feedback 的 enqueue / consume / dedupe / reset，保持 busy 语义不变。
2. `TurnLogRecorder`
   迁出 `RunResult -> SessionTurnLogger.logTurn()` 的转换，保持 JSONL schema 完全不变。
3. `TurnContextBuilder`
   只负责构建进入 `ConversationRunner.run()` 的初始 `contextMessages`；不移动 runner 内部每次 provider call 的 normalization / prompt budget guard。
4. `ContextWindowManager`
   只判断和执行 durable transcript 的 pre-turn compaction，继续复用 `ContextCompressor`。
5. `AgentSession.handleMessage()` 收窄
   在前四个模块稳定后，把主流程改成更清晰的 turn pipeline 调用。

暂不做：
- 不抽 `SessionLifecycleManager`，因为会同时影响 `MessageSessionManager` 过期清理、`SessionStore` 恢复、wakeup、`/exit`、`reset/clear` 和 `pendingRestore`
- 不实现新的子 agent 功能或调度系统
- 不把 `ConversationRunner` 立即重命名/拆成 `ModelToolLoop`，先避免大范围测试震荡

测试要求：
- 每个切片必须先跑对应模块化测试，再跑 `npm run build`
- 涉及 context/compaction 时先修正 `tests/context-compressor.test.ts` 的 mock，使其覆盖当前 `chatStream` 调用路径
- 阶段收尾必须跑 `npm test`，并让独立子 agent 做只读 review

完成结果：
- `AgentSession` 已不再直接持有 runtime feedback 队列逻辑
- `AgentSession` 已不再直接理解 session log tool call 映射细节
- `AgentSession` 已不再直接拼 runtime feedback / subagent status / skills list 的 provider input
- `AgentSession` 已不再直接执行上下文 token 判断和压缩
- lifecycle 暂未拆，作为下一阶段独立处理

### Phase I-A - Test And Doc Closure

状态：完成。

目标：把 Phase H 后的测试入口和文档状态收口，避免继续重构时被旧测试和过时路线图干扰。

本次收敛：
- `npm test` 改为运行当前可靠的 runtime 测试集，不再依赖 shell 展开 `tests/**/*.test.ts`
- 新增 `npm run test:runtime`、`npm run test:legacy`、`npm run test:all`、`npm run test:list`
- legacy 测试使用显式 denylist，只隔离旧 COO / Gauzmem / reminder 相关 5 个测试；未来新增 `.test.ts` 默认进入 `npm test`
- 路线图顶部同步 Phase H 完成状态

不做：
- 不直接删除旧 COO / Gauzmem / reminder 测试
- 不在本阶段继续拆 lifecycle
- 不做 CatsCo 品牌改名

下一步：
- 进入 Phase I-B：`AgentSession` lifecycle 瘦身
- 先规划清楚 restore、cleanup、clear/reset、wakeup、summary、session store 的职责边界，再小步迁移

独立 review 修正：
- 第一版脚本使用 runtime allowlist，review 指出未来新增 `.test.ts` 会被误归入 legacy，已改为显式 legacy denylist
- review 指出 Windows 直接 spawn `.cmd` 不够可靠，已改为用 `process.execPath` 执行 `tsx/cli`
- review 指出 Windows 路径分隔符可能让 legacy denylist 失效，已统一把 glob 结果 normalize 为 `/`

Slice 31 当时验证：
- `npm run test:list`
  runtime suite 当前 34 个文件；未来新增 `.test.ts` 默认进入 runtime suite
- `node scripts/run-tests.mjs legacy --list`
  legacy suite 当前只包含旧 COO / Gauzmem / reminder 相关 5 个测试
- `npm test`
  49 个 top-level TAP tests / 45 suites / 163 tests 全部通过
- `npm run build`
  TypeScript 构建通过

### Phase I-B - AgentSession Lifecycle Slimming

状态：完成；Slice 28/29/30/31 已完成。

目标：继续收窄 `AgentSession`，把“单个 session 的生命周期杂务”从 turn path 和公开入口里拆出去。

白话目标：
- `AgentSession` 保留公开 API、session id、busy/interrupt、messages 状态，以及对 turn/lifecycle 模块的调用
- `SessionLifecycleManager` 接管 restore、persist、reset/clear、cleanup
- `MessageSessionManager` 继续只管多平台 session map、TTL 和 adapter session 创建，不下沉到单个 session 的内部状态

关键原则：
- 先迁低风险的本地状态/存储边界；避免在 cleanup / exit 中保留隐式 LLM 判断和平台主动发送
- 不改变 `injectContext` 的跨 turn 内存语义；保存到 `SessionStore` 时仍过滤 injected/system 消息
- 不改变 `restore -> system prompt -> persisted history -> injected context` 的顺序
- 不改变 `/clear` 当前语义：默认只清内存，`/clear --all` 同时删除持久化文件
- 不改变 `MessageSessionManager` 的 TTL 清理和 destroy 调用方式
- 明确区分调用顺序和最终消息顺序：`restoreFromStore()` 标记待恢复、adapter `contextInjector` 可先注入；`init()` 后最终 messages 必须是 system -> persisted history -> injected context
- TTL cleanup 的 `destroying` guard、从 session map 删除的时机、同 key 新消息创建新 session 的语义继续属于 `MessageSessionManager`，不下沉到单 session lifecycle manager

计划顺序：
1. Slice 28: `SessionLifecycleManager` 初版
   - 已完成：接管 `pendingRestore` 的保存、消费、清空，以及 `restoreFromStore()`、`reset()`、`clear()`
   - 已完成：接管普通 `cleanup()` 的 `SessionStore.saveContext()` 与清空内存路径
   - 已固定：恢复顺序仍是 system -> persisted history -> injected context
2. Slice 29: `SessionWakeupService`
   - 已完成：把过期 cleanup 的 wakeup prompt、AI 判断、JSON 解析、平台回调拆出 `AgentSession`
   - 已被 Slice 31 移除：主动 wakeup 被判断为历史遗留隐式行为，不再保留
3. Slice 30: `SessionExitService`
   - 已完成：把 `/exit` summary prompt、可选 wakeup JSON 解析、wakeup reply、成功后清空 messages 拆出 `AgentSession`
   - 已被 Slice 31 移除：`/exit` summary 没有落盘或用户输出，属于无产出的隐藏 AI 调用
4. Slice 31: 移除隐式 wakeup 与无产出 exit summary
   - 已完成：TTL cleanup 只保存并清空，不再主动调用模型判断是否唤醒
   - 已完成：`/exit` 只销毁当前内存 session，不再调用模型生成未使用的 summary

测试要求：
- 每个 slice 先跑对应模块化测试，再跑 `npm run build`
- 阶段收尾跑 `npm test`
- 每轮关键切片后开干净子 agent 做只读 review，并在 review 后关闭子 agent
- 必须覆盖真实 `SessionStore` 恢复顺序、`reset/clear` 丢弃 pending restore、`cleanup` 不落盘 injected/system、`MessageSessionManager` TTL cleanup 仍允许同 key 新 session 不被旧 cleanup 影响

独立 review 修正：
- 采纳建议：`pendingRestore` ownership 迁移不能拆成半迁移，改为同一 slice 原子迁移保存/消费/清空
- 采纳建议：TTL cleanup 的 session map / destroying guard 继续留在 `MessageSessionManager`
- 采纳建议：`cleanup` 保存路径必须保留空 messages early return，避免 `/clear` 后覆盖历史文件

### Phase I-C - Closure And Release Prep

状态：完成。

目标：停止继续拆核心代码，把本轮 runtime slimming 收口到可发布检查点。

完成内容：
- 更新 `docs/runtime-slimming-report.md`，使阶段报告覆盖 Phase H / I-A / I-B / I-C
- 明确本轮 runtime slimming 可以收口，但整个项目不是“所有后续方向完成”
- 明确 Dashboard 可视化配置、profile schema、external agent 生产接入都应另开任务
- 记录发布前检查项：build、runtime tests、CatsCo smoke、提交前清理无关临时文件
- 独立 review 指出旧 `/exit` summary 注释和 TTL cleanup 同 key 新 session 竞态覆盖缺口；已修正注释并补测试

当前发布边界：
- 本轮只交付 runtime slimming / logging / profile foundation / read-only dashboard snapshot / external-agent primitives
- 不交付 Dashboard profile 编辑
- 不交付 external agent 主路径接入
- 不交付复杂 tool policy / permission engine

验证：
- 定向：`npx tsx --test tests/message-session-manager.test.ts tests/session-lifecycle-manager.test.ts`，2 suites / 14 tests 通过
- `npm run build` 通过
- `npm test` 通过，35 个 runtime test files；50 top-level TAP tests / 46 suites / 172 tests 全部通过

下一任务建议：
- 单独开启 `runtime-profile-schema-and-dashboard-config`
- 先定义 profile file schema、加载优先级、secret 边界和 dashboard preview/save/rollback
- 不把 dashboard 变成隐式配置源，不直接编辑 `.env`

## 切片记录

### 2026-04-30 - Slice 1: 日志链路止血

状态：完成

目标：
- 修复 session mixed log 对日报解析的破坏
- 修复上传链路对文件名推导 `session_id` 的错误依赖
- 为这两个点补回归测试

原则：
- session log 以后按“内容优先”消费，不再把文件名当语义真相源
- mixed event stream 是既成事实，消费方必须先按 `entry_type` 做兼容
- 历史 turn-only JSONL 仍然要能被读取，不能因为引入 `entry_type` 丢掉旧日志

本次修改：
- `src/utils/daily-report-generator.ts`
  消费 `entry_type === 'turn'` 的记录，忽略 runtime entries，并兼容旧格式无 `entry_type` 的 turn logs
- `src/utils/log-uploader.ts`
  从日志内容中解析真实 `session_id`，并兼容旧的 filename-derived upload state key
- `tests/daily-report-generator.test.ts`
  覆盖 mixed session log 和 legacy turn-only log 解析
- `tests/log-uploader.test.ts`
  覆盖上传时的真实 `session_id` 读取和旧 state key 迁移

后续接续：
- 定义统一的 session event schema
- 补 prompt / tool / surface / skill activation 的 characterization tests
- 让 uploader 和 report generator 都只依赖 event content

### 2026-05-01 - Slice 2: 统一 session event schema

状态：完成

目标：
- 把 session log 的共享类型、解析、turn 判断和 `session_id` 读取集中到一个小模块
- 减少 uploader、日报、ingest scheduler 各自理解 JSONL 结构的重复逻辑
- 保持当前日志文件格式不变，只收敛读取契约

原则：
- schema 层只定义事件形状和轻量解析函数，不承载上传、日报、云端 ingest 等业务策略
- `session-turn-logger` 继续作为写入端入口，并重新导出 schema 类型，减少外部导入迁移成本
- 历史无 `entry_type` 的 turn log 继续被视为有效 turn event

本次修改：
- `src/utils/session-log-schema.ts`
  新增共享 session event 类型、JSONL 解析、turn 识别、`session_id` 解析函数
- `src/utils/session-turn-logger.ts`
  复用并重新导出 schema 类型
- `src/utils/daily-report-generator.ts`
  通过 schema 读取和筛选 turn events
- `src/utils/log-uploader.ts`
  通过 schema 解析 JSONL 并解析真实 `session_id`
- `src/utils/log-ingest-scheduler.ts`
  通过 schema 读取 JSONL 中的 `session_id`
- `tests/session-log-schema.test.ts`
  覆盖 current turn、runtime、legacy turn、CRLF JSONL 和 `session_id` 读取
- `tests/logger.test.ts`
  改为在切换临时 cwd 后再加载 logger/session logger，避免日志路径在模块加载时固定到工作区

后续接续：
- 给 prompt / tool / surface / skill activation 补 characterization tests
- 开始定义最小版 `RuntimeProfile`
- 把 `workingDirectory`、system prompt 和 tool 默认值纳入统一 runtime 配置源

### 2026-05-01 - Slice 3: Runtime 行为保护测试

状态：完成

目标：
- 在抽 `RuntimeProfile` / `RuntimeFactory` 前，先固定当前关键行为
- 覆盖 prompt 组装、默认工具清单、Feishu/CatsCompany surface prompt、skill activation protocol
- 确保后续重构如果改变这些行为，会有明确测试失败提醒

原则：
- 只做 characterization tests，不改变 runtime 行为
- 测试关注稳定契约，不为当前冗余设计背书
- 对会在模块加载时绑定路径的对象，测试必须先切换临时 cwd 再加载模块

本次修改：
- `tests/runtime-characterization.test.ts`
  覆盖 `PromptManager.buildSystemPrompt()` 的运行时信息追加、`ToolManager` 默认工具清单、`AgentSession.init()` 的 Feishu/CatsCompany surface prompt 注入
- `tests/skill-activation-protocol.test.ts`
  覆盖 skill activation signal 构建、解析、拒绝非法 payload，以及 skill system prompt upsert 语义

后续接续：
- 定义最小版 `RuntimeProfile`
- 先让 profile 表达当前默认 prompt、默认工具清单、surface 和 working directory，不改变行为
- 再引入 `RuntimeFactory`，把 CLI 入口作为第一个迁移对象

### 2026-05-01 - Slice 4: 定义最小 RuntimeProfile

状态：完成

目标：
- 先用类型和 resolver 表达当前 runtime 事实
- 固定 `workingDirectory`、surface、displayName、prompt 来源、默认工具、skills、logging 的配置边界
- 不改现有 CLI/Feishu/CatsCompany/Weixin 的 runtime 创建路径

原则：
- `RuntimeProfile` 只是配置契约，不直接创建服务
- 默认 profile 必须复刻当前行为，而不是提前引入新策略
- 当前工具清单显式化，但不引入复杂 policy
- `workingDirectory` 使用真实绝对路径，后续再让 prompt 和 tools 共同读取同一来源

本次修改：
- `src/runtime/runtime-profile.ts`
  新增 `RuntimeProfile`、`RuntimeSurface`、默认工具清单和 `resolveDefaultRuntimeProfile()`
- `tests/runtime-profile.test.ts`
  覆盖默认 CLI profile、env identity/surface 解析和显式 override

后续接续：
- 引入最小 `RuntimeFactory`
- 先让 CLI 入口通过 factory 创建 `AIService`、`ToolManager`、`SkillManager`、`AgentSession`
- factory 初版只复刻当前创建流程，不迁移 Feishu/CatsCompany/Weixin

### 2026-05-01 - Slice 5: 引入最小 RuntimeFactory

状态：完成

目标：
- 统一 CLI 路径里的 runtime 对象创建
- 先让 factory 创建 `AIService`、`ToolManager`、`SkillManager`、`AgentSession`
- 只迁 CLI 入口，不碰 Feishu/CatsCompany/Weixin 和 MessageSessionManager

原则：
- factory 初版只复刻当前创建流程，不承载 prompt composition 或 tool policy
- CLI 的日志顺序保持原样：先记录工具数量，再加载并记录 skills
- `RuntimeProfile` 的工具清单只作为配置契约，当前 `ToolManager` 仍注册完整默认工具集

本次修改：
- `src/runtime/runtime-factory.ts`
  新增 `RuntimeFactory.createSession()`、`createServices()` 和 `loadSkills()`
- `src/commands/chat.ts`
  改为通过 `RuntimeFactory` 创建 CLI session 和 services
- `tests/runtime-factory.test.ts`
  覆盖 CLI service graph、session 创建、禁用 skill load，以及 `AIService` model overrides 透传

后续接续：
- 进入 Phase B，开始 `PromptComposer`
- `PromptComposer` 初版只复刻当前 `PromptManager.buildSystemPrompt()` 行为
- 后续再让 prompt runtime info 从 `RuntimeProfile` 读取

### 2026-05-01 - Slice 6: 行为保持型 PromptComposer

状态：完成

目标：
- 把 `PromptManager.buildSystemPrompt()` 的拼接逻辑迁到 `PromptComposer`
- 保持现有 system prompt 输出不变
- 为后续 prompt 简化和 runtime profile 注入建立明确入口

原则：
- 本 slice 不删 prompt 内容，不合并 base/behavior/surface
- `PromptManager` 保留旧接口，避免直接影响 `AgentSession` 和 `SubAgentSession`
- `PromptComposer` 初版只接受 promptsDir/default/env/now，不依赖 `RuntimeProfile`

本次修改：
- `src/runtime/prompt-composer.ts`
  新增行为保持型 prompt 组合器
- `src/utils/prompt-manager.ts`
  委托 `PromptComposer`，保留旧静态 API
- `tests/prompt-composer.test.ts`
  覆盖拼接顺序、behavior 模板抑制、fallback prompt，以及 `PromptManager` 与 `PromptComposer` 输出等价

后续接续：
- 让 `PromptComposer` 支持从 `RuntimeProfile` 读取 displayName/platform/workingDirectory
- 先保持输出等价，再把 prompt 中的默认工作目录和 tool 实际 workingDirectory 对齐
- 最后再清理冗余 prompt 内容

### 2026-05-01 - Slice 7: PromptComposer 支持 RuntimeProfile 元数据

状态：完成

目标：
- 让 `PromptComposer` 可以从 `RuntimeProfile.prompt` 读取 displayName/platform
- 保持现有 system prompt 输出等价
- 暂时不把 profile 的真实 `workingDirectory` 写进 prompt，避免行为漂移

原则：
- profile-aware path 先作为并行 API，不接入 `AgentSession`
- 当前 workspace 文案仍保持 `~/xiaoba-workspace/${displayName || 'default'}`
- 下一步再单独处理 prompt workspace 与 tool workingDirectory 的对齐

本次修改：
- `src/runtime/prompt-composer.ts`
  新增 `composeSystemPromptFromProfile()`
- `tests/prompt-composer.test.ts`
  覆盖 profile-aware 输出与 env 输出等价，以及空 prompt metadata 时仍使用 `default` workspace 文案

后续接续：
- 把 `PromptManager` / `AgentSession` 逐步改为通过 runtime profile 调用 composer
- 单独设计 workingDirectory 对齐，避免 prompt 文案和工具实际 cwd 继续分裂
- 再清理冗余 prompt 内容

### 2026-05-01 - Slice 8: Prompt workspace 对齐 RuntimeProfile workingDirectory

状态：完成

目标：
- 让 factory 创建的 runtime session 里，system prompt 声明的默认工作目录和 `ToolManager` 实际执行目录来自同一个 `RuntimeProfile.workingDirectory`
- 保持 legacy `PromptManager.buildSystemPrompt()` 行为不变，避免一次性影响 Feishu/CatsCompany/Weixin 等尚未迁移 factory 的入口
- 为后续 dashboard 展示真实 runtime 配置打基础

原则：
- 只对 `RuntimeFactory` 创建的 session 注入 profile-aware prompt provider
- `AgentSession` 只接受 system prompt provider，不直接依赖 `RuntimeProfile`
- prompt workspace 对齐是配置真相源修正，不在本 slice 清理 prompt 内容

本次修改：
- `src/runtime/prompt-composer.ts`
  `composeSystemPromptFromProfile()` 使用 `RuntimeProfile.workingDirectory` 生成默认工作目录文案
- `src/core/agent-session.ts`
  新增 `setSystemPromptProvider()`，允许 runtime factory 注入 prompt 构建逻辑
- `src/runtime/runtime-factory.ts`
  为 factory 创建的 session 注入 profile-aware prompt provider，并捕获 profile 快照，避免 `init()` 前外部 mutation 破坏 prompt/tool cwd 对齐
- `src/core/agent-session.ts`
  `setSystemPromptProvider()` 初始化后显式拒绝，`init()` 不再在 prompt provider 成功前标记 initialized
- `tests/prompt-composer.test.ts`
  覆盖 profile-aware prompt 使用真实 workingDirectory，legacy env prompt 仍保持旧 workspace 文案
- `tests/runtime-factory.test.ts`
  覆盖 factory-created CLI session 的 system prompt workspace 与 profile workingDirectory 对齐、profile 快照语义，以及 provider 初始化后不可替换

后续接续：
- 通过后进入 prompt 内容简化：先审计 base/behavior/surface/runtime info 的真实价值，再做最小可回滚的内容收敛

### 2026-05-01 - Slice 9: Surface prompt 迁出 AgentSession

状态：完成

目标：
- 把 Feishu/CatsCompany surface prompt 的硬编码从 `AgentSession.init()` 提取到 core shared resolver
- 让 surface prompt 生成和工具执行 surface 推断使用同一个 session key 解析入口
- 暂不删减 surface prompt 内容，先保证行为保持

原则：
- 本 slice 只做责任边界迁移，不改变 Feishu/CatsCompany/CLI 的 prompt 文案和注入条件
- `AgentSession` 只负责在初始化时接收 surface prompt 并写入 messages
- 后续是否保留 surface prompt 内容，要基于测试和实际 adapter 需求单独决策

本次修改：
- `src/runtime/surface-prompt.ts`
  初版 surface prompt 模块，独立 review 后已下沉到 `src/core/session-surface.ts`，避免 `core -> runtime` 的反向依赖
- `src/core/session-surface.ts`
  新增 `resolveSessionSurface()` 和 `composeSurfacePrompt()`
- `src/core/agent-session.ts`
  复用 surface prompt composer 和统一 surface resolver，移除重复的 Feishu/CatsCompany prompt 拼接
- `tests/surface-prompt.test.ts`
  覆盖当前 session key 到 surface 的映射，以及 Feishu/CatsCompany/CLI prompt 的完整字符串行为
- `tests/runtime-characterization.test.ts`
  补充 `cc_group:` surface prompt 和工具执行 `toolExecutionContext.surface` 的行为保护

后续接续：
- `user:` 同时被 Feishu 和 Weixin 使用，这是既有行为，不适合作为长期 surface 真相源；后续需要改为 `sessionType` / `RuntimeProfile.surface`
- 通过后再进入 prompt 内容审计，不直接在本 slice 删除 surface prompt

### 2026-05-01 - Slice 10: 合并 base/behavior prompt 的工作空间规则

状态：完成

目标：
- 删除 `behavior.md` 里过时的固定源码目录提示，避免和 `RuntimeProfile.workingDirectory` 冲突
- 把必要的工作空间原则合并到 `system-prompt.md`
- 移除 base prompt 中对 `send_text` / `send_file` 的硬性要求，因为 CLI 等无 channel 场景下这些工具不可用

原则：
- prompt 不再假设固定工作目录或固定源码目录
- 是否能发送文本/文件以当前 runtime channel 和工具上下文为准，不在 base prompt 写死
- `behavior.md` 保留为可选用户偏好模板，由 `PromptComposer` 现有模板抑制逻辑跳过

本次修改：
- `prompts/system-prompt.md`
  收敛为行动原则、交流方式、工作方式三块，保留“不编造能力/历史/文件状态”和“按真实上下文行动”等核心规则
- `prompts/behavior.md`
  改为可选模板，不再默认注入冗余工作空间规则
- `src/runtime/prompt-composer.ts`
  behavior 模板抑制改为 exact match，避免用户在模板下方追加偏好时被整段吞掉
- `src/feishu/index.ts` / `src/catscompany/index.ts`
  附件-only 提示不再要求通过不存在的 `reply` 工具发送文本，改为沿用 surface 自动发送契约
- `src/tools/send-file-tool.ts` / `src/tools/spawn-subagent-tool.ts`
  移除工具描述和子 agent handoff 中残留的 `reply` 工具指令，改为最终回复自动发送语义
- `tests/runtime-characterization.test.ts`
  更新真实 prompt characterization，覆盖不再包含过时 `~/Documents/xiaoba`、硬性 `send_text/send_file` 和长度阈值规则
- `tests/prompt-composer.test.ts`
  覆盖用户在 behavior 模板下追加偏好时仍会被注入
- `tests/prompt-copy-regression.test.ts`
  覆盖工具描述和 `spawn_subagent` handoff 返回文案不再指示模型调用不存在的 `reply` 工具

后续接续：
- 后续如需要分段/文件发送规则，应放到 surface/channel 能力描述里，而不是 base prompt

### 2026-05-01 - Slice 11: Base prompt 去品牌化

状态：完成

目标：
- 移除 `system-prompt.md` 中写死的“小八”身份
- 让助理显示名只通过 `PromptComposer` 的 runtime info / `RuntimeProfile.prompt.displayName` 注入
- 为未来每个用户配置个性化私人助理名称留出入口

原则：
- base prompt 只描述通用助理行为，不承载具体品牌名或人格名
- runtime 名称仍通过 `你在这个平台上的名字是：...` 注入，保持当前 PromptComposer 结构不变

本次修改：
- `prompts/system-prompt.md`
  首句改为通用私人助理描述
- `src/utils/prompt-manager.ts`
  fallback default prompt 同步去品牌化，避免缺失 prompt 文件时回退到固定“小八”身份
- `tests/runtime-characterization.test.ts`
  覆盖 base prompt 不再包含 `你是小八`，同时仍注入运行时显示名
- `tests/prompt-composer.test.ts`
  覆盖 fallback default prompt 不再写死“小八”

后续接续：
- 后续 dashboard/profile 可以把显示名作为可视化配置项
- Feishu bot aliases 仍有默认“小八/xiaoba”，这是唤醒别名，不等同于 runtime identity，需要后续单独配置化

### 2026-05-01 - Slice 12: Feishu adapter 迁入 RuntimeFactory 创建服务

状态：完成

目标：
- 让 Feishu adapter 不再直接 new `AIService` / `ToolManager` / `SkillManager`
- 让 Feishu session 的 system prompt 通过 `RuntimeFactory` 注入 profile-aware provider
- 保持 Feishu 消息处理、附件队列、bridge、唤醒回调等 adapter 行为不变

原则：
- 本 slice 只迁服务创建和 prompt provider，不改 Feishu session key 规则
- `MessageSessionManager` 支持 provider 注入，但保持旧的 numeric ttl 构造方式兼容
- skills 仍在 adapter `start()` 时加载，避免 constructor 变 async

本次修改：
- `src/runtime/runtime-factory.ts`
  新增 `createServicesSync()` 和 `createSystemPromptProvider()`，供同步 adapter constructor 使用
- `src/core/message-session-manager.ts`
  支持 `systemPromptProviderFactory`，新建 `AgentSession` 时注入 system prompt provider
- `src/feishu/index.ts`
  通过 `RuntimeFactory.createServicesSync()` 创建 Feishu runtime services，并通过提前 snapshot 的 `RuntimeFactory.createSystemPromptProvider()` 注入 Feishu session prompt
- `tests/runtime-factory.test.ts`
  覆盖同步 services 创建和可复用 provider 的 profile snapshot 语义
- `tests/message-session-manager.test.ts`
  覆盖 session manager 的 provider 注入和 numeric ttl 兼容性

后续接续：
- 独立 review 重点检查 Feishu 构造路径是否无意改变 skill 加载、tool cwd、prompt identity
- 通过后迁 CatsCompany，最后处理 Weixin 的 `user:` session key 历史债务

### 2026-05-01 - Slice 13: CatsCompany adapter 迁入 RuntimeFactory 创建服务

状态：完成

目标：
- 让 CatsCompany adapter 不再直接 new `AIService` / `ToolManager` / `SkillManager`
- 让 CatsCompany session 的 system prompt 通过 `RuntimeFactory` 注入 profile-aware provider
- 保持 CatsCompany 消息处理、附件队列、连接事件、唤醒回调等 adapter 行为不变

原则：
- 复用 Feishu Slice 的 seam：同步创建 services，skills 仍在 `start()` 加载
- prompt provider 固定 workingDirectory，但允许 CatsCompany `ready` 事件在首个 session 前写入真实 bot displayName

本次修改：
- `src/catscompany/index.ts`
  新增 `createCatsCompanyRuntime()`，通过 `RuntimeFactory.createServicesSync()` 创建 runtime services，并向 `MessageSessionManager` 注入 prompt provider；`ready` 事件会写入 `runtimeProfile.prompt.displayName`
- `tests/catscompany-runtime-factory.test.ts`
  覆盖 CatsCompany runtime services、tool cwd、未在 constructor/helper 加载 skills、TTL 传递、provider 固定工作目录和延迟读取 displayName

后续接续：
- 独立 review 重点检查 CatsCompany ready 事件里的 display name env 是否和 provider snapshot 存在时序问题
- 最后迁 Weixin，并处理 `user:` session key 与 Feishu surface 推断冲突

### 2026-05-01 - Slice 14: Weixin adapter 迁入 RuntimeFactory 并修正 surface 判定

状态：完成

目标：
- 让 Weixin adapter 不再直接 new `AIService` / `ToolManager` / `SkillManager`
- 让 Weixin session 的 system prompt 通过 `RuntimeFactory` 注入 profile-aware provider
- 修复 `user:` session key 被误判成 Feishu surface 的历史债务

原则：
- `sessionType` 优先于 session key 前缀判定 surface
- Weixin 是 message surface，最终文本也应通过 channel 自动发送
- session key 暂不改格式，避免影响上下文存储和外部状态

本次修改：
- `src/weixin/index.ts`
  新增 `createWeixinRuntime()`，通过 `RuntimeFactory.createServicesSync()` 创建 runtime services，并向 `MessageSessionManager` 注入 prompt provider；skill 加载仍保持旧的 fail-fast 语义
- `src/core/session-surface.ts`
  `resolveSessionSurface()` 支持 `sessionType` override，并新增 `weixin` surface prompt
- `src/core/agent-session.ts`
  surface prompt 和 tool execution surface 改为优先使用 `sessionType`
- `src/core/conversation-runner.ts` / `src/types/tool.ts`
  将 `weixin` 纳入 message surface 和 tool execution surface 类型
- `tests/weixin-runtime-factory.test.ts`
  覆盖 Weixin runtime services、tool cwd、未在 helper 加载 skills 和 provider 注入
- `tests/surface-prompt.test.ts` / `tests/runtime-characterization.test.ts`
  覆盖 `user:` 前缀在 `sessionType='weixin'` 时不会被误判为 Feishu

后续接续：
- 独立 review 重点检查 Weixin final response 自动发送和 `sessionType` surface override 是否有行为回归
- 完成后再考虑把 Feishu/CatsCompany/Weixin 的 runtime helper 下沉到更纯的 adapter-runtime 模块，避免测试 import 平台 SDK

### 2026-05-01 - Slice 15: Adapter runtime helper 下沉到纯 runtime 模块

状态：完成

目标：
- 把 Feishu/CatsCompany/Weixin 重复的 runtime helper 收敛到 `src/runtime/adapter-runtime.ts`
- 避免 runtime helper 测试 import 平台 SDK
- 让 adapter 文件更接近纯通讯层

原则：
- `createAdapterRuntime()` 只创建 runtime profile、services 和 `MessageSessionManager` options
- Feishu/Weixin 使用 fixed prompt snapshot
- CatsCompany 使用 mutable identity 模式，允许 ready 事件在首个 session 前写入真实 displayName，但固定 workingDirectory

本次修改：
- `src/runtime/adapter-runtime.ts`
  新增 `createAdapterRuntime()`，统一 adapter runtime services 和 prompt provider 创建
- `src/feishu/index.ts` / `src/catscompany/index.ts` / `src/weixin/index.ts`
  三端 helper 改为薄 wrapper，调用 `createAdapterRuntime()`
- `tests/adapter-runtime.test.ts`
  覆盖 adapter runtime services、TTL、fixed snapshot 和 mutable identity 两种 prompt snapshot 策略
- 删除三端重复的 `*-runtime-factory.test.ts`
  由纯 runtime 测试替代，避免测试导入平台 SDK

验证：
- `npx tsx --test tests/adapter-runtime.test.ts tests/message-session-manager.test.ts tests/runtime-factory.test.ts tests/runtime-characterization.test.ts tests/prompt-composer.test.ts tests/runtime-profile.test.ts tests/surface-prompt.test.ts tests/prompt-copy-regression.test.ts`
  8 suites / 41 tests 全部通过
- `npm run build`
  TypeScript 构建通过
- 独立 review 子 agent 启动后因额度限制失败；本轮由主 session 完成第二轮本地复查，发现并移除了 `src/weixin/index.ts` 的无用 `RuntimeFactory` import

后续接续：
- 完成后进入 Tool Boundary：让 runtime profile 工具清单和 ToolManager 实际注册关系继续收敛

### 2026-05-02 - Slice 16: RuntimeProfile tools 成为 ToolManager 创建输入

状态：完成

目标：
- 让 `RuntimeProfile.tools.enabled` 不只是一份声明，而是 `RuntimeFactory` 创建 `ToolManager` 时的真实输入
- 保持工具管理简单：只做 enable list，不引入 `ToolPolicy` / `ToolPack` / permission engine
- 把默认工具名从 runtime profile 和 ToolManager 的双份手写清单收敛成一个共享来源

原则：
- 手动 `new ToolManager()` 继续默认注册全部内置工具，保持现有测试和脚本兼容
- `RuntimeFactory` 创建的 runtime 必须按 profile 启用工具
- 未启用的工具不出现在 `getToolDefinitions()`，也不能被 `executeTool()` 调用成功
- 安全 guard / 复杂审批后续作为独立 hook 设计，不塞进工具注册层

本次修改：
- 新增共享默认工具名模块
- `ToolManager` 支持可选 `enabledToolNames`
- `RuntimeFactory.createServicesSync()` 传入 `profile.tools.enabled`
- 补 `ToolManager` 和 `RuntimeFactory` regression tests

具体文件：
- `src/tools/default-tool-names.ts`
  新增默认工具名共享来源，避免 `RuntimeProfile` 和测试各自维护默认清单
- `src/runtime/runtime-profile.ts`
  `DEFAULT_RUNTIME_TOOL_NAMES` 改为复用共享默认工具名
- `src/tools/tool-manager.ts`
  保持 `new ToolManager()` 默认全工具；增加 `{ enabledToolNames }` options，允许 runtime 创建时只注册 profile 启用工具；未知工具名 warning 后忽略
- `src/runtime/runtime-factory.ts`
  创建 `ToolManager` 时传入 `profile.tools.enabled`
- `tests/tool-manager.test.ts`
  覆盖默认全工具、启用清单过滤、未启用工具执行返回 `TOOL_NOT_FOUND`
- `tests/runtime-factory.test.ts`
  覆盖 factory-created `ToolManager` 使用 profile enabled tools

验证：
- `npx tsx --test tests/tool-manager.test.ts tests/runtime-factory.test.ts tests/runtime-profile.test.ts tests/adapter-runtime.test.ts tests/runtime-characterization.test.ts`
  5 suites / 24 tests 全部通过
- `npm run build`
  TypeScript 构建通过
- 独立 review 子 agent 未发现阻塞问题

残留风险：
- `ToolManager` 直接传 unknown `enabledToolNames` 仍是 warning 后忽略；`RuntimeFactory` 路径已通过 profile validation fail-fast。后续如 dashboard / 外部 JSON 直接构造 profile，需要在输入解析层补 shape validation。

后续接续：
- 检查 `ConversationRunner.getToolDefinitions(allowedNames?)` 这个历史接口参数是否还有价值，避免接口层残留假能力

### 2026-05-02 - Slice 17: Tool profile 最小校验和 ToolExecutor 接口收口

状态：完成

目标：
- 给 `RuntimeProfile.tools.enabled` 增加最小 validation，避免外部 profile / dashboard 后续接入时工具名 typo 静默降能力
- 清理 `ToolExecutor.getToolDefinitions(allowedNames?)` 的历史参数，避免接口层暗示 runner 还能临时过滤工具
- 保持 Phase C 的简单边界：只校验已知工具名，不引入 policy、pack 或权限审批

原则：
- profile 校验放在 runtime profile / factory 边界，不塞进 `ConversationRunner`
- `ToolManager` 继续只负责注册和执行
- `AgentToolExecutor` 的 agent 内部 allowed tools 仍由构造前的工具数组决定，不通过 `getToolDefinitions()` 参数动态过滤

本次修改：
- 增加 `validateRuntimeProfile()` / `assertValidRuntimeProfile()`
- `RuntimeFactory` 创建 services 前执行 profile validation
- 移除 `ToolExecutor.getToolDefinitions(allowedNames?)` 的 unused 参数
- 补 unknown tool validation 和接口收口相关 tests

具体文件：
- `src/runtime/runtime-profile.ts`
  新增 `validateRuntimeProfile()` 和 `assertValidRuntimeProfile()`，校验 unknown / duplicate tool names
- `src/runtime/runtime-factory.ts`
  `createServicesSync()` 创建 services 前执行 profile validation，invalid profile 直接 fail-fast
- `src/types/tool.ts`
  `ToolExecutor.getToolDefinitions()` 移除 unused `allowedNames` 参数
- `tests/runtime-profile.test.ts`
  覆盖 unknown / duplicate tool validation
- `tests/runtime-factory.test.ts`
  覆盖 invalid tool profile 在创建 services 前被拒绝

验证：
- `npx tsx --test tests/tool-manager.test.ts tests/runtime-factory.test.ts tests/runtime-profile.test.ts tests/adapter-runtime.test.ts tests/runtime-characterization.test.ts`
  5 suites / 26 tests 全部通过
- `npm run build`
  TypeScript 构建通过
- 独立 review 子 agent 未发现阻塞问题，确认 Phase C 可以标记完成

非本阶段残留：
- 额外尝试运行 `tests/conversation-runner-transcript-normalization.test.ts` 时发现既有 `reply` transcript 相关测试失败；失败原因与本阶段 tool profile boundary 改动无关，不阻塞 Phase C，但后续进入 `ConversationRunner` / message surface 清理时应单独处理。

Phase C 结论：
- Tool Boundary 已完成当前阶段目标：工具清单从 runtime profile 显式进入 runtime service 创建路径；`ToolManager` 保持简单注册/执行职责；未引入复杂 policy。

### 2026-05-02 - Slice 18: Surface system prompt 注入迁出 AgentSession

状态：完成

目标：
- `AgentSession.init()` 不再直接调用 `composeSurfacePrompt()`
- 将 base system prompt 和 surface prompt 的组合放到 runtime/session manager 创建边界
- 保持 Feishu/CatsCompany/Weixin message session 的 surface prompt 行为不变

原则：
- `AgentSession` 只负责初始化已注入的 system prompt、恢复历史、维护会话状态
- surface prompt 属于 runtime/session 创建配置，不属于 session 内部推断逻辑
- `resolveSessionSurface()` 仍可用于 tool execution context，后续再决定是否继续外移

本次计划：
- 新增 `composeSessionSystemPromptProvider()`
- `RuntimeFactory.createSession()` 和 `MessageSessionManager` 使用该 provider wrapper
- 删除 `AgentSession.init()` 内部 surface prompt 注入
- 更新 surface 相关 characterization tests

本次修改：
- `src/core/session-system-prompt.ts`
  新增 session system prompt provider wrapper，统一组合 base prompt 和 surface prompt
- `src/core/agent-session.ts`
  `init()` 不再调用 `composeSurfacePrompt()`；skill activation、skill slash command、transient skill list 迁到 `SessionSkillRuntime`
- `src/core/message-session-manager.ts`
  新建 message session 时用 provider wrapper 注入 surface prompt
- `src/runtime/runtime-factory.ts`
  factory-created session 使用 session-aware system prompt provider
- `src/skills/session-skill-runtime.ts`
  新增 session skill runtime，承载 `/skills`、skill slash command、auto activation、skill system message 生命周期和 transient skills list
- `tests/session-skill-runtime.test.ts`
  覆盖 skill runtime 的独立行为
- `tests/runtime-characterization.test.ts` / `tests/message-session-manager.test.ts`
  更新 surface prompt 注入契约：由 provider 注入，不由 `AgentSession` 自行推断

验证：
- `npx tsx --test tests/session-skill-runtime.test.ts tests/skill-activation-protocol.test.ts tests/runtime-characterization.test.ts tests/message-session-manager.test.ts tests/runtime-factory.test.ts tests/adapter-runtime.test.ts tests/surface-prompt.test.ts`
  7 suites / 36 tests 全部通过
- `npm run build`
  TypeScript 构建通过

后续接续：
- Phase D 剩余判断：`AgentSession` 仍负责 runner 编排、状态、持久化、中断，这是当前阶段保留职责；更深的 wakeup/cleanup 拆分留到后续专门切片。

### 2026-05-02 - Slice 19: Adapter runtime lifecycle 下沉

状态：完成

目标：
- adapter 文件不再直接调用 `RuntimeFactory.loadSkills()` 或自行决定 skill loading 语义
- `createAdapterRuntime()` 返回 adapter 可调用的 runtime lifecycle hook
- 保持 Feishu/CatsCompany 原有 warning-on-failure 语义，Weixin 保持 fail-fast 语义

原则：
- adapter 继续只负责消息收发、身份映射、channel callbacks 和平台事件
- runtime services、prompt provider、skill loading lifecycle 都通过 `adapter-runtime` bundle 暴露
- 不改变 session key、channel callback、附件处理和消息队列行为

本次修改：
- `src/runtime/adapter-runtime.ts`
  `AdapterRuntimeBundle` 增加 `loadSkills()` lifecycle hook；支持 `skillLoadMode: 'warn' | 'fail-fast'`
- `src/feishu/index.ts` / `src/catscompany/index.ts`
  移除对 `RuntimeFactory` 的直接依赖，启动时调用 `runtime.loadSkills()`
- `src/weixin/index.ts`
  保持 fail-fast skill loading 语义，但通过 adapter runtime bundle 执行
- `tests/adapter-runtime.test.ts`
  覆盖 warn 和 fail-fast 两种 adapter skill loading 模式

验证：
- `npx tsx --test tests/adapter-runtime.test.ts tests/message-session-manager.test.ts tests/runtime-factory.test.ts tests/runtime-characterization.test.ts tests/session-skill-runtime.test.ts tests/runtime-profile.test.ts tests/tool-manager.test.ts tests/surface-prompt.test.ts`
  8 suites / 40 tests 全部通过
- `npm run build`
  TypeScript 构建通过

独立 review 修复：
- `/clear` / `/clear --all` 通过 `reset()` 清掉 `pendingRestore`，避免 restore 后未 init 又恢复旧历史
- `AgentSession.init()` 合并顺序调整为 `system -> restored history -> injected context`
- 每轮 skill reload policy 通过 `MessageSessionManagerOptions.skillReloadHandler` 注入，跟随 adapter runtime lifecycle

补充验证：
- `npx tsx --test tests/adapter-runtime.test.ts tests/message-session-manager.test.ts tests/runtime-characterization.test.ts tests/session-skill-runtime.test.ts tests/runtime-factory.test.ts tests/runtime-profile.test.ts tests/tool-manager.test.ts tests/surface-prompt.test.ts`
  8 suites / 44 tests 全部通过
- `npm run build`
  TypeScript 构建通过
- 独立 review 子 agent 复查未发现阻塞问题，确认 Phase D/E 可以标记完成

Residual risks：
- `SkillTool` 和 `SpawnSubagentTool` 内部仍有自己的 skill manager 使用路径，不属于 message session per-turn reload 主路径；后续如要求所有 skill loading 生命周期完全统一，需要单独收敛。
- 历史遗留 session 文件如果曾保存 injected 消息，恢复时仍可能作为普通 history 带回；正常持久化路径已过滤 `__injected`。

Phase D/E 结论：
- Phase D 当前目标已完成：`AgentSession` 明显瘦身，prompt/surface/skill 规则已外移到 provider/runtime helper，核心保留会话状态、历史、busy/interrupt、cleanup、runner 编排和 session log。
- Phase E 当前目标已完成：CLI 和 message adapters 都通过 runtime factory/helper 获取 runtime；message adapters 保留通讯层职责，不再直接决定 runtime services/prompt/tool/skill 默认值。

### 2026-05-03 - Slice 20: Runtime feedback 与 transcript 日志边界

状态：完成

目标：
- 运行时可恢复错误可以反馈给 agent 自己判断，但必须使用标准 SDK message 形态
- runtime feedback 只属于当前 turn，不进入长期 `messages[]`、compaction summary 或 session store
- session log 继续统一为一份 JSONL：`turn` + `runtime` entries，不新增自定义 observation entry
- 外发型工具的 transport 细节不污染长期 transcript

原则：
- 不新增非 OpenAI/Anthropic 标准 role；agent 可见反馈统一为 `role: 'user'`
- `Logger` 继续记录人/系统看的 runtime log，不把所有 `Logger.error` 全量注入 agent
- adapter 不直接改 session 长期上下文；通过 `HandleMessageOptions.runtimeFeedback` 把本轮反馈交给 session
- 前端是否显示 tool / feedback 是展示层问题，不影响 runtime transcript 语义

本次修改：
- `src/core/runtime-feedback.ts`
  新增 runtime feedback 格式化、指纹去重和内容识别；统一前缀为 `[运行时反馈]`
- `src/core/agent-session.ts`
  新增 `HandleMessageOptions.runtimeFeedback`；runtime feedback 在通过 busy guard 后插入本轮本地 `contextMessages`，不写入长期 `messages[]`；`SessionTurnLogger.logTurn()` 记录本轮 `user.runtime_feedback`
- `src/providers/openai-provider.ts`
  OpenAI-compatible SDK 边界改为白名单消息字段，避免 `__injected` / `__runtimeFeedback` / 任意内部字段泄漏
- `src/providers/anthropic-provider.ts`
  保持重建消息对象的边界，并新增测试覆盖 runtime feedback 内部字段不泄漏
- `src/utils/session-log-schema.ts` / `src/utils/session-turn-logger.ts`
  `turn.user.runtime_feedback?: string[]` 作为 turn 输入的一部分记录；日报和上传仍通过 session log schema 解析
- `src/feishu/index.ts` / `src/catscompany/index.ts` / `src/weixin/index.ts`
  附件/媒体下载失败不再由平台层直接截断回复；改为本轮 runtime feedback 交给 agent，Feishu/CatsCompany 的 busy queue 同步携带该 feedback
- `src/core/conversation-runner.ts`
  恢复外发型工具 transcript normalization：`outbound_message` / `outbound_file` 成功后持久化为 assistant 已外发内容，不保留 transport tool_result；重复外发提示保持 transient
- `src/tools/send-text-tool.ts` / `src/tools/tool-manager.ts`
  `send_text` 标记为 `outbound_message`；生产工具清单只保留 `send_text` / `send_file`，不保留 `reply` 工具或 alias
- `tests/runtime-feedback.test.ts`
  覆盖 runtime feedback 格式、去重、busy 不污染 session、busy 期间 direct injection 延迟到下一轮、不会触发 runner summary
- `tests/openai-provider-runtime-feedback.test.ts` / `tests/anthropic-provider-runtime-feedback.test.ts`
  覆盖 provider 边界不泄漏内部字段
- `tests/session-log-schema.test.ts`
  覆盖 `user.runtime_feedback` 可被 session log schema 保留

关键修正：
- 第一轮独立 review 发现 adapter 在 busy 前直接注入 session，可能丢失或串到正在运行的 turn；已改为 queued message 携带 feedback，真正执行时才传给 `handleMessage`
- 第二轮独立 review 发现 runtime feedback 可能被 `ConversationRunner` compaction 摘要进长期上下文；已在 `AgentSession` 主会话路径禁用 runner-level AI compaction，保留同步 prompt guard 裁剪和 session-level pre-turn compaction
- 同时修复此前记录的 `conversation-runner-transcript-normalization` 失败，避免外发工具 tool_result 进入 durable history

验证：
- `npx tsx --test tests/runtime-feedback.test.ts tests/openai-provider-runtime-feedback.test.ts tests/anthropic-provider-runtime-feedback.test.ts tests/session-log-schema.test.ts tests/conversation-runner-transcript-normalization.test.ts tests/daily-report-generator.test.ts tests/log-uploader.test.ts tests/logger.test.ts tests/runtime-characterization.test.ts tests/message-session-manager.test.ts tests/adapter-runtime.test.ts tests/tool-manager.test.ts tests/anthropic-provider-extra-fields-bug.test.ts tests/anthropic-provider-image-bug.test.ts tests/anthropic-provider-block-order-bug.test.ts`
  22 suites / 50 tests 全部通过
- `npm run build`
  TypeScript 构建通过
- 独立 review 子 agent 复查未发现 blocker

Residual risks：
- `AgentSession` 主会话禁用 runner-level AI compaction 后，单个超长工具循环中的 durable in-memory transcript 可能增长到下一轮外部消息才被 session-level compaction 压缩；同步 prompt guard 仍会裁剪 provider input
- 如果 runtime feedback 被消费后、模型调用前发生少见生命周期异常，该 feedback 不会自动重试到下一轮
- `outbound_file` 的长期 transcript 仅记录 `file_name`，这是刻意避免 transport result 污染 history 的取舍

补充约束：
- `send_text` 的核心动机只针对 IM/message surface：当最终回复较长时，ReAct agent 一旦不再调用工具就会结束，无法把长回复拆成多条更可读的消息；`send_text` 允许 agent 在处理过程中主动分段发送。CLI 等非 message surface 不应依赖该工具。
- `send_text` / `send_file` 的 `tool_result` 只代表 transport 成功/失败，长期 transcript 不应保存“已发送”这类实现细节；成功外发后只记录 assistant 已发给用户的内容或文件名。

Slice 20 结论：
- 日志/反馈链路已收敛为：runtime 内部日志继续进 `runtime` entry；agent 需要看的可恢复错误作为当前 turn 的标准 user feedback 进入模型；最终一并记录在该 turn 的 `user.runtime_feedback`
- 没有新增自定义 SDK role 或独立 observation stream，符合“日志简单统一、session 核心更薄”的目标

### 2026-05-03 - Slice 21: Dashboard runtime 只读配置快照

状态：完成

目标：
- 让 dashboard 能看见当前 runtime 的真实配置源，而不是只看散落的 `.env` 字段
- 只读展示，不新增编辑能力，不把 Electron 页面变成新的配置真相源

原则：
- `RuntimeProfile` / `RuntimeFactory` / `PromptComposer` 仍是 runtime 配置和 prompt 展开的来源
- dashboard 只消费快照，不直接 new service graph 或修改 profile
- 快照不暴露 `apiKey` 等 secret

本次修改：
- `src/runtime/runtime-config-snapshot.ts`
  新增 `createRuntimeConfigSnapshot()`，聚合 `RuntimeProfile`、validation、工作目录、system prompt 展开结果、工具清单、skill 清单、日志路径和上传状态
- `src/dashboard/routes/api.ts`
  新增只读 `GET /api/runtime/config`
- `dashboard/index.html`
  配置页新增 “Runtime 当前快照” 只读区；不使用 `data-key`，不会被 `saveConfig()` 当作可保存配置
- `tests/dashboard-runtime-config.test.ts`
  覆盖 secret 不泄漏、工作目录/prompt/log path 对齐、`send_text`/`send_file` transcript mode、无 `reply` 工具、skill 加载展示

验证：
- `npx tsx --test tests/dashboard-runtime-config.test.ts tests/external-agent-orchestration.test.ts tests/config-manager-merge.test.ts tests/runtime-profile.test.ts tests/runtime-factory.test.ts tests/tool-manager.test.ts tests/conversation-runner-transcript-normalization.test.ts`
  5 suites / 36 tests 全部通过
- `npm run build`
  TypeScript 构建通过
- 独立 review 子 agent 发现两个 P2：GET route 间接创建 `~/.xiaoba`、上传 URL 可能泄漏凭据；已改为 `ConfigManager.getConfigReadonly()`，并对 upload/model URL 做 origin-only 脱敏
- 最终独立 review 确认 Phase F 仍是只读路径，未发现 blocker

Residual risks：
- dashboard 当前展示的是快照，不是长连接状态；服务启动后如果运行时环境变量变化，需要刷新页面/API 才能看到
- `systemPrompt.text` 会返回完整展开结果，适合本地只读 dashboard；如果未来支持远程 dashboard，需要加访问控制，并避免 prompt 文件中手写 secret

### 2026-05-03 - Slice 22: External agent orchestration 骨架

状态：完成

目标：
- 为后续 Codex / Claude Code / OpenCode 外部 worker runtime 留一个清晰边界
- 当前阶段只定义契约和小型 adapter spike，不接入 `AgentSession` / `ToolManager` / adapter 主路径

原则：
- 外部 agent 是 worker runtime，不是普通 tool，也不复用 `ShellTool`
- 主 runtime 继续保持薄；外部任务的进程生命周期由独立 `ProcessRunner` 管理
- 默认任务目录隔离到 `.xiaoba/external-agents/<task-id>`，当前不声称它是 git worktree；后续再升级为正式 git worktree / sandbox 策略
- 结果最终必须由 XiaoBa 验收，当前先把 `review` / `requiredTests` / `expectedOutputs` 作为契约字段保留

本次修改：
- `src/runtime/external-agent/types.ts`
  定义 `TaskPacket`、`ExternalAgentControl`、`ExternalAgentResult`、`ExternalAgentDescriptor`
- `src/runtime/external-agent/process-runner.ts`
  新增独立 `ProcessRunner`，使用 `child_process.spawn({ shell:false })`，支持 stdin、timeout、cancel、stdout/stderr 捕获
- `src/runtime/external-agent/task-directory.ts`
  新增默认隔离目录解析、创建和 task packet 序列化
- `src/runtime/external-agent/coding-agent-adapter.ts`
  新增最小 `CodingAgentAdapter`，把 task packet 通过 stdin 交给外部进程
- `src/runtime/external-agent/registry.ts`
  新增 `ExternalAgentRegistry`，只做注册、查找和 descriptor 输出
- `tests/external-agent-orchestration.test.ts`
  覆盖 registry、默认隔离任务目录、caller-owned workingDirectory override、ProcessRunner stdin/stdout/timeout、CodingAgentAdapter 独立工作目录、disabled agent 和非零退出

验证：
- 同 Slice 21 的最终模块化测试和 `npm run build`
- 独立 review 子 agent 确认 `external-agent` 未接入 `AgentSession` / `ToolManager` / `RuntimeFactory` / message adapters，未发现 blocker；建议把 “worktree” 命名收紧为 “task directory” 并补失败/timeout 测试，已完成

Residual risks：
- 当前只是 orchestration primitive，没有真正创建 git worktree、复制 repo 或做 diff/test 验收；正式接入前必须补 `TaskPacket` 校验、任务目录生命周期、结果验收和权限策略
- `CodingAgentAdapter` 当前只通过 stdin 传 task JSON；不同外部 agent 的 CLI 参数约定后续需要按 adapter 分别收敛
- 显式 `TaskPacket.workingDirectory` 当前是 caller-owned execution context，可以指向 `repositoryRoot` 之外；正式接入主路径前必须加策略限制

### 2026-05-03 - Phase H 计划复审：AgentSession turn pipeline

状态：计划确定；未开始改代码。

背景：
- 对比 Claude Code / Codex 后，结论是 XiaoBa 现在最该借鉴的是 session / turn / transcript / provider input 的边界，而不是复制复杂功能
- 当前 `AgentSession.handleMessage()` 仍同时处理 runtime feedback、pre-turn compaction、临时上下文拼装、skill reload、subagent status、runner 创建、日志转换和状态清理
- 用户当前目标是瘦身和模块化，不是添加子 agent、fork/resume、复杂 permission 或多层 compaction 功能

独立 review 结论：
- `RuntimeFeedbackInbox` 和 `TurnLogRecorder` 是低风险优先切片
- `TurnContextBuilder` 合理，但只能负责进入 runner 的初始上下文，不能和 `ConversationRunner` 内部 provider input normalization 混在一起
- `ContextWindowManager` 合理，但必须明确只处理 durable transcript
- `SessionLifecycleManager` 暂时不拆，影响面明显大于 turn path

采纳的批判性意见：
- `injectContext` 当前会跨 turn 保留在内存里，只在 session store 持久化时过滤；本阶段不能改成一次性注入
- busy 语义必须保持：`HandleMessageOptions.runtimeFeedback` 在 busy 时不入队；直接调用 `injectRuntimeFeedback()` 即使 busy 也保留到下一轮
- runner 的 emergency prompt budget guard 必须保留，避免临时 skills list / runtime feedback / subagent status 撑爆 provider input
- 动 compaction 前先修测试夹具，确保 `ContextCompressor.compact()` 的 `chatStream` 路径被测试覆盖

最终执行顺序：
1. Slice 23: 抽 `RuntimeFeedbackInbox`
   - 只迁移队列、去重、consume、reset
   - 不改 runtime feedback 插入 provider input 的位置
   - 验证：`tests/runtime-feedback.test.ts`、provider runtime feedback tests、`npm run build`
2. Slice 24: 抽 `TurnLogRecorder`
   - 只迁移 tool call 摘取和 `logTurn()` 参数组装
   - 不改 session log schema
   - 验证：runtime feedback / session log schema / daily report / uploader / logger tests、`npm run build`
3. Slice 25: 抽 `TurnContextBuilder`
   - 迁移 runtime feedback message、subagent status、skills list 的本轮上下文拼装
   - 保持 `injectContext` 跨 turn 行为
   - 验证：runtime feedback、runtime characterization、message session manager、session skill runtime、conversation runner transcript normalization tests、`npm run build`
4. Slice 26: 抽 `ContextWindowManager`
   - 只做 pre-turn durable history usage / compaction 决策
   - 补测 runtime feedback / transient skill list / subagent status 不进入 compaction summary
   - 验证：context compressor、runtime feedback、runtime characterization、conversation runner transcript normalization tests、`npm run build`
5. Slice 27: 收窄 `AgentSession.handleMessage()`
   - 把前面模块串成清晰 turn pipeline
   - 阶段收尾跑 `npm test`
   - 独立子 agent 只读 review，再根据 review 修正

阶段完成标准：
- `AgentSession` 不再直接持有 runtime feedback 队列逻辑
- `AgentSession` 不再直接理解 session log tool call 映射细节
- `AgentSession` 不再直接拼 runtime feedback / subagent status / skills list 的 provider input
- `AgentSession` 不再直接做上下文 token 判断和压缩执行
- 公开行为、adapter 行为、日志 schema 和已有 session 恢复语义不变

### 2026-05-03 - Slice 23: RuntimeFeedbackInbox

状态：完成

目标：
- 把 runtime feedback 的队列、去重、consume/reset 从 `AgentSession` 拆出
- 不改变 runtime feedback 进入 provider input 的位置
- 不改变 busy 语义

本次修改：
- `src/core/runtime-feedback-inbox.ts`
  新增 `RuntimeFeedbackInbox`，负责 enqueue、consume、dedupe、reset
- `src/core/agent-session.ts`
  使用 inbox 替代内部 `pendingRuntimeFeedback` / `runtimeFeedbackSeen`
- `tests/runtime-feedback.test.ts`
  更新私有状态断言，改为检查 inbox pending count

验证：
- `npx tsx --test tests/runtime-feedback.test.ts tests/openai-provider-runtime-feedback.test.ts tests/anthropic-provider-runtime-feedback.test.ts`
  3 suites / 7 tests 全部通过
- `npm run build`
  TypeScript 构建通过

保留语义：
- `HandleMessageOptions.runtimeFeedback` 在 busy 时不入队
- 直接 `injectRuntimeFeedback()` 即使 busy 也保留到下一轮
- runtime feedback 仍然只是当前 turn 的 user message，不进入长期 transcript

### 2026-05-03 - Slice 24: TurnLogRecorder

状态：完成

目标：
- 把 `RunResult.newMessages -> SessionTurnLogger.logTurn()` 的转换从 `AgentSession` 拆出
- 保持 session JSONL schema 完全不变
- `AgentSession` 仍保留 `SessionTurnLogger`，用于 log context 和文件路径

本次修改：
- `src/core/turn-log-recorder.ts`
  新增 `TurnLogRecorder`，负责从 `RunResult` 摘取 tool calls 和 tool result 文本
- `src/core/agent-session.ts`
  使用 `TurnLogRecorder.recordTurn()` 写本轮日志，不再内联理解 tool call 映射

验证：
- `npx tsx --test tests/runtime-feedback.test.ts tests/session-log-schema.test.ts tests/daily-report-generator.test.ts tests/log-uploader.test.ts tests/logger.test.ts`
  5 suites / 13 tests 全部通过
- `npm run build`
  TypeScript 构建通过

保留语义：
- `turn.user.runtime_feedback` 仍记录在同一个 turn event 内
- daily report / uploader / logger 继续按既有 schema 工作
- 没有新增日志 entry 类型

### 2026-05-03 - Slice 25: TurnContextBuilder

状态：完成

目标：
- 把本轮 provider input 的临时上下文拼装从 `AgentSession` 拆出
- 只构建进入 `ConversationRunner.run()` 的初始 `contextMessages`
- 不移动 `ConversationRunner` 内部 provider input normalization / prompt budget guard

本次修改：
- `src/core/turn-context-builder.ts`
  新增 `TurnContextBuilder`，负责 runtime feedback、subagent status、skills list 的本轮上下文注入，并提供 transient 清理
- `src/core/agent-session.ts`
  使用 builder 构建 `contextMessages`，并复用 builder 清理 runtime feedback / transient system hints

验证：
- `npx tsx --test tests/runtime-feedback.test.ts tests/runtime-characterization.test.ts tests/message-session-manager.test.ts tests/session-skill-runtime.test.ts tests/skill-activation-protocol.test.ts tests/conversation-runner-transcript-normalization.test.ts`
  5 suites / 34 tests 全部通过
- `npm run build`
  TypeScript 构建通过

保留语义：
- `injectContext` 仍是跨 turn 的内存注入，不是一次性 transient
- 每轮仍会 reload skills 并注入当前 skills list
- subagent status 仍只作为本轮 transient system context
- runner 内部 duplicate outbound hint / provider input cleanup 仍由 `ConversationRunner` 管理

### 2026-05-03 - Slice 26: ContextWindowManager

状态：完成

目标：
- 把 pre-turn context usage / compaction 决策从 `AgentSession` 拆出
- 压缩只处理 durable transcript
- 临时上下文在内存中保留，但不进入 compaction summary

本次修改：
- `src/core/context-window-manager.ts`
  新增 `ContextWindowManager`，封装 pre-turn compact-if-needed 流程
- `src/core/agent-session.ts`
  初始化恢复后、每轮处理前都通过 manager 检查压缩
- `tests/context-compressor.test.ts`
  修正压缩测试夹具，覆盖当前 `ContextCompressor.compact()` 使用的 `chatStream` 路径
- `tests/context-window-manager.test.ts`
  覆盖 injected/runtime feedback/transient skill list/subagent status 不进入 summary，以及只有 transient 过大时不触发压缩

验证：
- `npx tsx --test tests/context-compressor.test.ts tests/context-window-manager.test.ts tests/runtime-feedback.test.ts tests/runtime-characterization.test.ts tests/conversation-runner-transcript-normalization.test.ts`
  9 suites / 50 tests 全部通过
- `npm run build`
  TypeScript 构建通过

保留语义：
- `injectContext` 仍会跨 turn 留在内存消息里
- `ConversationRunner.ensurePromptBudget()` 仍保留为 provider input 的最后防线
- 压缩失败仍只记录日志并回退原 messages，不中断主流程

### 2026-05-03 - Slice 27: AgentTurnController

状态：完成

目标：
- 把单轮模型/工具执行主体从 `AgentSession.handleMessage()` 拆出
- `AgentSession` 保留公开入口、参数兼容、busy/interrupt、init、pre-turn compaction、错误兜底和状态写回
- 不拆 lifecycle，不动 `/clear` / restore / cleanup / wakeup

本次修改：
- `src/core/agent-turn-controller.ts`
  新增 `AgentTurnController`，负责本轮 auto skill activation、turn context、runner 创建、runner 执行、状态同步、metrics、base64 image placeholder、turn log
- `src/core/agent-session.ts`
  `handleMessage()` 改为调用 `turnController.run()`，并写回 messages / active skill 状态
- `src/skills/session-skill-runtime.ts`
  独立 review 发现旧 `AgentSession.isAttachmentOnlyInput()` 的 `[文件]` / `[图片]` guard 漏迁移；已补回，避免纯附件占位文本误触发 auto skill

验证：
- `npx tsx --test tests/runtime-feedback.test.ts tests/runtime-characterization.test.ts tests/message-session-manager.test.ts tests/session-skill-runtime.test.ts tests/skill-activation-protocol.test.ts tests/conversation-runner-transcript-normalization.test.ts tests/context-window-manager.test.ts tests/context-compressor.test.ts`
  12 suites / 62 tests 全部通过
- `npx tsx --test tests/session-skill-runtime.test.ts tests/runtime-feedback.test.ts tests/context-window-manager.test.ts tests/runtime-characterization.test.ts tests/conversation-runner-transcript-normalization.test.ts`
  review 修复后 4 suites / 28 tests 全部通过
- 稳定测试集：
  `npx tsx --test` 显式运行 34 个当前稳定 `.test.ts` 文件，45 suites / 163 tests 全部通过
- `npm run build`
  TypeScript 构建通过
- `npm test`
  当前 package 脚本 `tsx --test tests/**/*.test.ts` 在本地没有展开 glob，直接报找不到文件；改用显式文件列表验证
- 全量显式 `.test.ts`
  45 suites / 165 tests 通过，25 tests 失败；失败集中在当前仓库已有废弃/缺失模块测试：旧 COO prompt/skill、`gauzmem-service`、`reminder-scheduler`，与 Phase H 改动无关

保留语义：
- runner-level AI compaction 仍在主 session 路径禁用
- skill activation 仍是 turn-scoped，单轮结束后清理 skill system message
- outbound transcript normalization 仍在 `ConversationRunner`
- busy/interrupt 和 runtime feedback consume 时机不变

独立 review：
- 子 agent 只读 review 未发现 runtime feedback、compaction 主路径 blocker
- 采纳并修复 `[文件]` / `[图片]` attachment-only auto-skill guard 漏迁移
- 其余建议记录为后续命名/文档优化：`RuntimeFeedbackInbox` 既包含 pending buffer 也包含 dedupe window；`ContextWindowManager` 的 transient 是“不进入 summary，但可跨 turn 留在内存”

Phase H 结论：
- `AgentSession` 已不再直接持有 runtime feedback 队列逻辑
- `AgentSession` 已不再直接理解 session log tool call 映射细节
- `AgentSession` 已不再直接拼 runtime feedback / subagent status / skills list 的 provider input
- `AgentSession` 已不再直接执行上下文 token 判断和压缩
- lifecycle 暂未拆，作为后续独立阶段处理

### 2026-05-03 - Slice 28: SessionLifecycleManager 初版

状态：完成

目标：
- 把 `AgentSession` 的低风险本地 lifecycle/store 边界拆出
- 原子迁移 pending restore 的标记、消费、清空，避免半迁移 ownership
- 不改变 wakeup/summary/平台回调逻辑

本次修改：
- `src/core/session-lifecycle-manager.ts`
  新增 `SessionLifecycleManager`，接管 `restoreFromStore()` 的 store 读取和 pending restore、`reset()` / `clear()` 的 lifecycle 状态重置、`SessionStore.saveContext()` 和普通 persist-and-clear 包装
- `src/core/agent-session.ts`
  移除 `pendingRestore` 字段，`init()` 通过 lifecycle manager consume restored messages；`reset()` / `clear()` / `restoreFromStore()` / 普通 `cleanup()` 保存路径委托给 lifecycle manager
- `tests/session-lifecycle-manager.test.ts`
  覆盖真实 `SessionStore` 恢复顺序、`reset/clear` 丢弃 pending restore、`reset/clear` 清空 pending runtime feedback、cleanup 不落盘 injected/system，以及 reset 后 cleanup 不用空消息覆盖既有持久化文件

保留语义：
- `restoreFromStore()` 可以先于 adapter `contextInjector` 调用；最终 `init()` 后 messages 顺序仍是 system -> persisted history -> injected context
- `injectContext` 仍是跨 turn 内存注入，仍由 `AgentSession` 更新 `lastActiveAt` 和执行 30 条上限裁剪
- `/clear` 默认 reset 只清内存且不覆盖持久化文件；`/clear --all` 仍删除持久化文件
- `MessageSessionManager` 的 TTL cleanup map 删除、`destroying` guard、同 key 新 session 语义不变
- wakeup 判断和 `summarizeAndDestroy()` 仍留在 `AgentSession`，未改 prompt 内容

验证：
- `npx tsx --test tests/session-lifecycle-manager.test.ts tests/message-session-manager.test.ts tests/runtime-characterization.test.ts tests/runtime-feedback.test.ts`
  4 suites / 23 tests 全部通过
- `npm run build`
  TypeScript 构建通过
- `npm test`
  35 个 runtime test files；50 top-level TAP tests / 46 suites / 167 tests 全部通过

独立 review：
- 干净子 agent 只读 review 未发现 blocker，认可本 slice
- 采纳非阻塞建议：`markRestoreFromStore()` false path 清空 stale pending restore
- 采纳非阻塞建议：补 `reset/clear` 清空 pending runtime feedback 的显式测试
- 未采纳 `savedCount` 进一步调整：当前仅用于日志，保留为传入 messages 数，避免扩大本 slice 行为面

### 2026-05-03 - Slice 29: cleanup wakeup 判断拆出

状态：完成

目标：
- 继续瘦 `AgentSession.cleanup()`
- 把“过期清理时是否需要主动唤醒用户”的 LLM 判断拆成独立模块
- 不改变 wakeup prompt 内容、平台发送回调、TTL cleanup 或普通持久化行为

本次修改：
- `src/core/session-wakeup-service.ts`
  新增 `SessionWakeupService`，负责检查是否有用户消息、构造 wakeup 判断 prompt、调用 AI、解析 JSON、调用平台 wakeup reply
- `src/core/agent-session.ts`
  `cleanup()` 不再内联 wakeup prompt / JSON 解析；只在 `checkWakeup` 时调用 wakeup service，然后继续交给 lifecycle manager 保存并清空
- `tests/session-lifecycle-manager.test.ts`
  补充 `cleanup({ checkWakeup: true })` 会触发 wakeup 并保持持久化行为、未请求 wakeup / 无用户消息时不调用 AI，以及 wakeup 判断失败时仍保存并清空 session

保留语义：
- wakeup 只在 `cleanup({ checkWakeup: true })` 且已注入 `wakeupReply` 时可能发生
- 无用户消息不触发 wakeup 判断
- AI 返回 JSON 中有 `wakeup` 时才调用平台回调
- wakeup 判断失败只记录 warning，不阻断后续保存
- 注入型 user context 当前仍按原逻辑参与“是否存在用户消息”的判断；本 slice 不扩大为语义变更
- `summarizeAndDestroy()` 暂未拆，仍保留原有 `/exit` 路径行为

验证：
- `npx tsx --test tests/session-lifecycle-manager.test.ts tests/message-session-manager.test.ts tests/runtime-characterization.test.ts tests/runtime-feedback.test.ts`
  4 suites / 26 tests 全部通过
- `npm run build`
  TypeScript 构建通过
- `npm test`
  35 个 runtime test files；50 top-level TAP tests / 46 suites / 170 tests 全部通过

独立 review：
- 干净子 agent 只读 review 未发现 blocker，认可 wakeup 从 `AgentSession.cleanup()` 拆出
- 采纳 review 建议：补 wakeup AI/解析/回调失败时仍继续保存并清空 session 的测试
- 保留原语义：不在本 slice 过滤 `__injected` user message，避免把 lifecycle 瘦身变成上下文语义变更
- 保留原顺序：wakeup 判断仍先于持久化执行，和旧实现一致；失败路径已确保不阻断保存

### 2026-05-03 - Slice 30: /exit summary/destroy 拆出

状态：完成

目标：
- 继续瘦 `AgentSession.summarizeAndDestroy()`
- 把 `/exit` 时的 summary prompt、AI 调用、可选 wakeup JSON 解析、平台回调和成功后清空消息拆到独立模块
- 不改变 `/exit` 的外部语义，不新增持久化或用户功能

本次修改：
- `src/core/session-exit-service.ts`
  新增 `SessionExitService`，负责 `/exit` summary/destroy 流程；成功时返回空 messages，失败时保留原 messages
- `src/core/agent-session.ts`
  `summarizeAndDestroy()` 不再内联 summary prompt / wakeup JSON / 平台回调，只委托 exit service 并同步 `messages`
- `tests/session-lifecycle-manager.test.ts`
  补充 `/exit` summary 成功清空、带 wakeup reply 时解析 JSON 并回调、summary AI 失败保留原消息、wakeup JSON 无效仍清空且不唤醒、wakeup reply 失败仍清空的回归测试

保留语义：
- 没有 user message 或 messages 为空时，`summarizeAndDestroy()` 返回 false，messages 不变
- summary AI 调用失败时返回 false，messages 不被清空
- wakeup reply 只在设置了平台回调且 JSON 中存在 `wakeup` 时触发
- wakeup JSON 解析失败只记录 warning，不阻断 `/exit` 清空
- wakeup 平台回调失败只记录 warning，不阻断 `/exit` 清空
- summary 文本此前没有真正落盘，本 slice 不补功能，只保持行为等价

验证：
- `npx tsx --test tests/session-lifecycle-manager.test.ts tests/message-session-manager.test.ts tests/runtime-characterization.test.ts tests/runtime-feedback.test.ts`
  4 suites / 31 tests 全部通过
- `npm run build`
  TypeScript 构建通过
- `npm test`
  35 个 runtime test files；50 top-level TAP tests / 46 suites / 175 tests 全部通过

独立 review：
- 干净子 agent 只读 review 未发现 blocker，认可 `SessionExitService` 的职责边界和行为等价
- 采纳 review 建议：补 wakeup JSON 解析失败仍清空且不唤醒的测试
- 采纳 review 建议：补 wakeup reply 抛错仍返回成功并清空 messages 的测试
- 暂不抽 JSON fence stripping helper；当前只有 wakeup/exit 两处重复，等第三处再抽，避免过度抽象

### 2026-05-03 - Slice 31: 移除隐式 wakeup 与无产出 exit summary

状态：完成

目标：
- 继续审视 lifecycle 中是否还有没必要的历史遗留行为
- 删除 session 过期时主动唤醒用户的隐式后台 AI 判断
- 删除 `/exit` 时生成但不落盘、不返回用户的 summary AI 调用

本次修改：
- `src/core/session-wakeup-service.ts`
  删除。TTL cleanup 不再构造 wakeup prompt、不再调用 AI、不再主动发送消息
- `src/core/session-exit-service.ts`
  删除。`/exit` 不再做 hidden summary / wakeup JSON / 平台回调
- `src/core/message-session-manager.ts`
  删除 `WakeupSendFn`、`setWakeupSendFn()`、`lastChannelIdMap`、`injectWakeupReply()`；`getOrCreate()` 不再接收 channelId
- `src/core/agent-session.ts`
  删除 `wakeupReply`、`SessionWakeupService`、`SessionExitService` 依赖；`cleanup()` 只保存并清空，`summarizeAndDestroy()` 只清空当前 messages；`/history` 文案改为 `ContextWindowManager`
- `src/catscompany/index.ts` / `src/feishu/index.ts` / `src/weixin/index.ts`
  删除主动 wakeup 发送函数注入，创建 session 时不再传 channelId
- `tests/session-lifecycle-manager.test.ts` / `tests/message-session-manager.test.ts`
  删除旧 wakeup/summary 行为测试，新增 cleanup 不触发隐藏 AI、`/exit` 不触发隐藏 AI、TTL cleanup 保存过期 session 且不触发隐藏 AI 的测试

保留语义：
- TTL cleanup 仍会从 session map 中删除过期 session，并调用 `session.cleanup()` 保存可持久化上下文
- `/clear` 和 `/clear --all` 语义不变
- `/exit` 仍返回告别，并清空当前内存 session；只是不会再做无产出的 AI summary
- IM 平台主动发送仍只发生在正常 turn 输出、`send_text` / `send_file`、子 agent 平台回调等明确路径，不再由 session 过期隐式触发

验证：
- `npx tsx --test tests/session-lifecycle-manager.test.ts tests/message-session-manager.test.ts tests/runtime-characterization.test.ts tests/runtime-feedback.test.ts`
  4 suites / 27 tests 全部通过
- `npm run build`
  TypeScript 构建通过
- `npm test`
  35 个 runtime test files；50 top-level TAP tests / 46 suites / 171 tests 全部通过

独立 review：
- 干净子 agent 只读 review 未发现本次删除方向的 blocker
- 采纳 review 建议：`tests/message-session-manager.test.ts` 改为临时 cwd + `SessionStore.saveContext()` 显式播种，避免依赖真实工作区 session 文件偶然通过
- 采纳 review 建议：补 manager 层 TTL cleanup 测试，直接覆盖过期 session 从 map 删除、保存上下文、不触发隐藏 AI

## 待处理问题清单

- prompt 组成方式冗余，且存在明显过时噪音
- `AgentSession` 仍是公开入口聚合点，后续只在发现实际职责混杂时继续拆，不为拆而拆
- `npm test` 已改为稳定 runtime suite，且默认包含除显式 legacy denylist 之外的所有 `.test.ts`；`npm run test:legacy` 暂时保留旧 COO / Gauzmem / reminder 测试，后续需要迁移或删除
- 外部 JSON / dashboard profile 接入前仍需补输入解析层 shape validation
- Dashboard runtime config 如果从只读走向编辑，需要先定义 profile 文件 schema 和迁移策略，不能直接写散落 `.env`
- External agent 正式接入前需要补 git worktree / sandbox 生命周期、权限策略、diff/test 验收和 SubAgentManager 边界对齐
