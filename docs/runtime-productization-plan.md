# Runtime Productization And Dashboard Operations Plan

日期：2026-05-04

## 定位

本计划接在本地 checkpoint `bb6b989 refactor(runtime): slim runtime foundation and add profile config` 之后。

后续主线不再是 runtime slimming，而是把 XiaoBa/CatsCo 从“能跑的 agent runtime”推进到“更好配置、更好观察、更好调试、更方便扩展的本地 agent runtime”。

核心方向：
1. CatsCo Identity And Compatibility Rebrand
2. Dashboard / Runtime Profile 产品化
3. Skill Management
4. Unified Logs And Local Analysis
5. Subagent Management

## 当前基线

已完成的 foundation：
- `RuntimeProfile`、profile file schema、loader、validation、safe editor API 已存在。
- Dashboard 已支持 runtime config snapshot、profile preview/save/rollback。
- CLI、Feishu、Weixin、CatsCompany/CatsCo adapter 已基本走统一 runtime creation 边界。
- `AgentSession` 已把 turn context、runtime feedback、logging、context window、lifecycle 拆到专门模块。
- session event logs 已有统一 schema，runtime feedback 可作为标准 SDK user message 进入本轮上下文。
- external agent primitives 已存在，但不在主 runtime 路径。

当前工作区注意事项：
- 顶层临时待办文件已按用户要求删除，不再作为后续工作入口。
- 多个顶层历史文档、旧规划、评测测试、候选 skills、`dashboard/pet/` 仍是 untracked；后续切片不应默认 stage 或修改它们。
- `release-checkpoint-plan.md` 是 checkpoint 历史文档，其中“工作区 diff 尚未提交”的描述已被 `bb6b989` 取代，不作为当前状态来源。

阶段 0 开始前已存在、暂不纳入本主线的 dirty / untracked 路径：
- `ARCHITECTURE.md`
- `LOG_SYSTEM_SUMMARY.md`
- `REFACTOR_PLAN.md`
- `SKILL-DEVELOPMENT.md`
- `TEST-PLAN.md`
- `bug-report-image-upload.md`
- `dashboard/pet/`
- `docs/architecture-split-plan.md`
- `docs/implementation-summary.md`
- `docs/message-based-mode-design.md`
- `docs/message-mode-test-plan.md`
- `docs/tool-architecture-refactor.md`
- `skills/officecli/`
- `skills/sc-analysis/`
- `tests/ai-test-framework/`
- `tests/coo-agent-eval.ts`
- `tests/coo-message-integration.test.ts`
- `tests/coo-prompt-and-data.test.ts`
- `tests/coo-scenario.test.ts`
- `tests/engineer-skill-eval.ts`
- `tests/eval-results/`
- `tests/gauzmem-speaker-identity.test.ts`
- `tests/reminder-scheduler.test.ts`
- `tests/skill-publish-debug.test.ts`

## 不变边界

- Dashboard 不是隐式配置源；它只能查看、预览、校验、受控编辑明确 schema 内的安全字段。
- 不直接写 `.env`；API key、token、secret 不写入 runtime profile。
- adapter 继续是通讯层；Feishu / Weixin / CatsCo / CLI 不重新持有 runtime 规则。
- `AgentSession` 不重新变成大而杂的调度中心。
- 不做复杂 tool policy engine；工具保持通用、少而清晰，定制能力优先通过 skill。
- 删除、发送、上传、改权限、保存敏感信息等用户确认型行为必须显式确认。
- 保持 `npm run start -- catscompany` 和 `npm run start -- dashboard` 的启动方式。
- 不直接 push、不开 PR，除非用户明确要求。
- 不使用 `git add .`；需要提交时必须精确 stage。

## 阶段 0 - 产品化主线基线

状态：完成。

目标：
- 把 checkpoint 后的新主线从 slimming 语境里切出来。
- 明确当前 dirty / untracked 工作区归属。
- 建立后续实现切片的计划、记录和测试约束。

范围：
- 新增本计划文档。
- 新增 checkpoint 后工作记录。
- 只更新文档入口，不改 runtime 代码。

不做：
- 不整理、删除、stage untracked 文件。
- 不改 Dashboard / runtime / skill 代码。
- 不跑完整测试套件；本阶段只做文档和 git 状态校验。

风险：
- 工作区已有大量无关 untracked 文件，后续实现容易误纳入。
- 旧文档仍存在 CatsCompany/slimming 语境，后续查阅时需要优先看本计划。
- 顶层临时待办文件删除需要作为单独清理变更看待，避免后续误认为它是产品化设计输入。

测试方法：
- `git status --short`
- `git diff --stat`
- 文档只读 review。

## 阶段 1 - CatsCo Identity And Compatibility Rebrand

状态：Stage 1A/1B 当前低风险切片完成；深层仓库/package/目录迁移待单独评估。

目标：
- 把 CatsCo 明确为本地 agent 产品名；`app.catsco.cc` 是 CatsCo webapp / IM surface。
- 开始对外 rebrand，同时保持历史 `catscompany` adapter / surface / config 兼容。
- 为后续 Dashboard、Skill Management、电子宠物和日志分析建立稳定命名，不让 CatsCompany 文案继续扩散。

范围：
- Stage 1A：更新本计划中的命名边界，并盘点代码中的 CatsCompany/CatsCo 引用。
- Stage 1B：增加 `catsco` 启动命令 alias，保留 `catscompany`。当前已完成。
- Stage 1B：增加 `catsco` CLI binary，保留 `xiaoba` binary 兼容 alias。当前已完成。
- Stage 1B：增加 `connect` 作为 CatsCo webapp connector 主命令，保留 `catscompany` / `catsco` 子命令兼容 alias。当前已完成。
- Stage 1B：命令读取 `CATSCO_*` 环境变量 alias，并继续兼容 `CATSCOMPANY_*` 和 `config.catscompany`。当前已完成。
- Stage 1B：用户可见日志、错误、surface prompt、Dashboard service label 改为 CatsCo。当前低风险范围已完成。
- Stage 1B：内部 adapter class、目录名、service key、surface id、session key 暂时保留 `catscompany`。

不做：
- 不做目录名、文件名、package 字段、session surface id 的大规模迁移。
- 不改持久化路径、session key、日志 schema。
- 不删除 CatsCompany 兼容别名。
- 不改远程仓库名、npm package name。
- 不删除旧 `xiaoba` binary alias。
- 不触碰正在并行修改的电子宠物 UI、`dashboard/index.html`、`dashboard/pet/`。
- 不扩大 Dashboard 写 `.env` 的能力；现有 CatsCo webapp setup 的 secret 存储方式后续单独设计。

风险：
- prompt 文案变化可能影响行为测试。
- 日志显示名变化可能影响使用者的 grep / dashboard 筛选习惯。
- `CATSCO_*` 与 `CATSCOMPANY_*` 同时存在时需要明确优先级，避免连接到错误环境。
- 如果一次性迁移 internal id，会破坏 profile、logs、tests 和历史配置；本阶段必须保持兼容键。

测试方法：
- `rg -n "CatsCompany|Cats Company|CatsCo|catscompany" src dashboard docs prompts package.json`
- 命名相关 characterization tests。
- 命令配置解析单测覆盖 `CATSCO_*` 优先、`CATSCOMPANY_*` fallback、user config fallback。
- `npm run build`
- 定向 smoke：确认 `catsco` / `xiaoba` binary metadata、`connect` / `catscompany` 入口仍存在。

## 阶段 2 - Dashboard / Runtime Profile 产品化

参考设计：`docs/dashboard-operations-rework-plan.md`。

目标：
- 把 Dashboard 从开发期 service/debug console 整理成面向“启动并使用 CatsCo”的本地 agent 运营工作台。
- 让用户清楚知道当前是否可以启动；如果不能，明确缺模型来源、CatsCo binding、connector、skill load 还是 runtime profile。
- 用 typed settings 和“模型来源”替代 raw `.env` 作为用户主配置路径。
- 默认产品路径是 CatsCo 托管模型；当前本地实现只做边界和 UI，不把未完成的云端模型网关伪装成可用。
- 在 service start 前做 preflight，避免先启动再从日志里发现缺配置。
- 让用户清楚理解 Runtime Profile 文件、最终生效配置、校验问题、保存影响范围和 rollback 状态。
- 与 Companion / 电子宠物 UI 对齐信息架构，但不让宠物持有 runtime、skill 或 log 规则。

范围：
- 按 `docs/dashboard-productization-ia.md` 和 `docs/dashboard-operations-rework-plan.md` 做 Dashboard 信息架构整理。
- Model Source：默认展示 CatsCo 托管模型，依赖 CatsCo 登录态；自定义模型作为 Advanced，继续写现有 `GAUZ_LLM_*`。
- 自定义模型：provider、model、api base、访问凭证 presence、保存确认。
- typed settings API：allowlisted settings、secret presence-only、keep/replace/clear、dotenv-safe writer。
- readiness / preflight API：model/key、CatsCo、service、skill、profile 状态聚合。
- 运行首页从 Version/Provider/Host/Skills Path 改成 readiness dashboard。
- service details、version、host、paths、system prompt、raw env 进入 Diagnostics / Advanced。
- profile 文件不存在时的空状态和引导。
- config issues / validation issues / unsafe existing profile 的可读展示。
- save / preview / rollback 的错误提示和不可用状态。
- 最终生效配置与 profile draft 的对比说明。
- 仅继续支持已定义安全字段：`displayName`、`workingDirectory`、`tools.enabled`、`skills.enabled`。
- Dashboard 导航和文案收敛：运行、CatsCo Chat、Companion、Runtime Profile / Settings、Skills。
- 原始 `.env` 配置降级为 Advanced，不作为推荐配置入口。
- `buildsense.asia` 仅作为迁移期内部网关/历史实现细节，不出现在普通用户路径。

不做：
- 不新增 Runtime Profile 写 `.env` 的能力；现有 `.env` editor 仅作为 Advanced 入口保留并要求确认，后续单独设计 secret 存储。
- 不硬编码共享模型 secret，不把 BuildSense key 写入本地代码。
- 不在普通 Dashboard UI 暴露 `buildsense.asia`、provider key 或模型供应商 URL。
- 不通过 Runtime Profile 保存 secret。
- 不在 normal settings/readiness API 中回显 secret、system prompt text 或本地路径。
- 不做复杂多 profile、多租户、权限系统。
- 不直接编辑完整 system prompt 大文本。
- 不把 Dashboard 设置变成绕过 schema 的新配置源。
- 不实现完整 Skill Management。
- 不让 Companion 修改 skill、profile 或 log。
- 不接真实 log analyzer 到宠物 XP。

风险：
- UI 容易让用户误以为保存会影响当前 running session。
- profile 与 env/user config/surface override 的优先级展示如果不清楚，会造成错误调试方向。
- rollback sidecar 必须继续避免持久化 unsafe profile 内容。
- Dashboard 当前 `dashboard/index.html` 是大单文件，容易和并行电子宠物 UI 修改冲突；切片需要小步、先读后改。
- 伙伴页当前直接显示 skill 操作按钮，容易和 Stage 3 Skill Management 冲突。

测试方法：
- `npx tsx --test tests/dashboard-settings-api.test.ts`
- `npx tsx --test tests/dashboard-readiness.test.ts`
- `npx tsx --test tests/dashboard-productization-html.test.ts`
- `npx tsx --test tests/runtime-profile-editor.test.ts tests/dashboard-runtime-profile-api.test.ts tests/dashboard-runtime-config.test.ts`
- `npm run build`
- Dashboard browser smoke：profile missing、validation error、preview diff、save success、rollback unavailable/available。
- Live smoke：用户或本地进程启动 `http://localhost:3800/` 后，确认 readiness 与 API 一致。

## 阶段 3 - Skill Management

目标：
- Dashboard/CLI 清楚展示当前 skills 的加载状态和可调用边界。
- 支持安全的启用、禁用、重载和错误反馈。

范围：
- 展示名称、描述、路径、`userInvocable`、`autoInvocable`、加载错误。
- 梳理现有 Dashboard skill API 与 `SkillManager` 的职责边界。
- skill load/reload failure 进入清楚反馈；会影响 agent 决策的错误可作为 transient runtime feedback。
- 安装、删除、更新、启停等风险操作必须显式确认。

不做：
- 不做 marketplace。
- 不把所有 tool 改造成 skill。
- 不做权限/计费/远程托管体系。
- 不自动更新或删除 skill。

风险：
- Dashboard 现有 skill API 已有 install/delete/enable/disable 路径，需要先识别哪些行为缺少确认或反馈。
- skill list 作为 transient context 可能产生噪音，需要控制展示内容。
- reload failure 如果只写日志，agent 可能无法理解能力不可用；如果全进上下文，又可能污染推理。

测试方法：
- `npx tsx --test tests/session-skill-runtime.test.ts tests/skill-activation-protocol.test.ts`
- 新增 skill inventory / load failure / enable-disable / reload tests。
- Dashboard API tests 覆盖失败反馈和确认要求。

## 阶段 4 - Unified Logs And Local Analysis

目标：
- 先把本地日志查看、上传状态和基础分析做稳，不急着做云端分析。
- 明确 agent-visible runtime feedback 与 audit/debug log 的边界。

范围：
- Dashboard 查看 session event logs、runtime logs、上传状态、最近错误。
- 基础分析：错误聚类、tool failure、token 使用、异常 session 结束、日志上传失败。
- 从 session event content 解析，不从文件名猜 session id。
- 只把影响 agent 决策的错误作为标准 SDK user message 语境反馈给 agent。

不做：
- 不做复杂 BI dashboard。
- 不做大规模云端数据挖掘。
- 不引入非标准 SDK role 或自定义 observation role。

风险：
- 日志展示可能泄漏路径、URL query、用户内容或凭据，需要脱敏策略。
- 分析结果如果进入 agent context，必须保持短、准、可行动。
- 上传失败状态和去重 key 不能再次回到文件名推断。

测试方法：
- `npx tsx --test tests/session-log-schema.test.ts tests/daily-report-generator.test.ts tests/log-uploader.test.ts tests/log-ingest-scheduler.test.ts`
- 新增 local log analyzer fixture tests。
- 脱敏与上传状态 regression tests。

## 阶段 5 - Subagent Management

目标：
- 把 subagent 变成可观察、可取消、可验收的任务能力。
- 不做复杂自动调度系统。

范围：
- 先补设计文档，再做最小实现。
- 明确 lifecycle：created / running / waiting / completed / failed / cancelled。
- 明确 task working directory / isolation。
- parent session 通过 transient context 看到 subagent status。
- subagent 结果进入主 session transcript 的路径由主 agent 验收和转述。
- Dashboard 展示正在运行和历史 subagent tasks。

不做：
- 不让 `AgentSession` 直接管理子进程。
- 不让 subagent 绕过主 agent 给用户做最终判断。
- 不接全自动多 agent 调度。
- 不把 external coding agent 深接入生产主路径，除非设计先通过。

风险：
- 现有 `src/core/sub-agent-manager.ts`、subagent tools 和 external-agent primitives 存在两条能力线，需要先统一概念再实现。
- 取消、等待用户确认、结果验收容易变成隐式行为。
- 如果状态长期写入 durable transcript，会污染历史；给 agent 的状态应保持 transient。

测试方法：
- subagent manager lifecycle tests。
- cancel / timeout / waiting / resume regression tests。
- parent transient context tests。
- Dashboard task list smoke。

## Review 和记录规则

- 每个关键实现切片前，先更新或新增设计文档。
- 每个实现切片必须有模块化测试。
- 关键切片完成后，用干净上下文的独立子 agent 做只读 review；review 完关闭。
- reviewer 发现的问题先判断价值，再修正实现或更新计划。
- 每个阶段完成后更新 `docs/runtime-productization-log.md`，记录做了什么、为什么、验证结果、剩余风险。
