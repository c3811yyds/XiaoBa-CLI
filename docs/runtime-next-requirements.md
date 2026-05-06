# XiaoBa Runtime 后续需求整理

日期：2026-05-03

## 定位

`runtime slimming` 到这里应当收口。后续不再叫 slimming，因为主要工作已经不是“拆薄、去冗余、修边界”，而是把现有 runtime 基础产品化、配置化、可视化和可运营化。

后续工作建议拆成新的主线：

1. Runtime Profile And Dashboard Config
2. Skill Management
3. Unified Logs And Local Analysis
4. Subagent Management
5. Remaining Architecture Hygiene

当前执行计划见 `docs/runtime-productization-plan.md`。
当前状态：Runtime Profile And Dashboard Config 已完成 Slice 1-4，具备 profile schema/loading、dashboard read-only alignment、safe edit API 和 dashboard 编辑 UI。后续如果继续做 dashboard，应从新的产品化任务开始，不再归入 slimming；历史 profile 计划保留在 `docs/runtime-profile-dashboard-plan.md`。

## 总目标

把 XiaoBa 从“一个写死较多的助手项目”推进到“可配置、可观察、可扩展的 agent runtime”。

核心约束：
- 不把 dashboard 变成新的隐式配置源。
- 不让 adapter 重新持有 runtime 规则。
- 不把 tool 管理复杂化成过早的 policy engine。
- 不引入新功能时顺手破坏当前 CatsCo / Feishu / Weixin / CLI 的稳定行为。
- 每个阶段继续保留 characterization tests、模块化测试和独立 review。

## 1. Runtime Profile And Dashboard Config

目标：
- 让 runtime 的真实配置源明确、可查看、可编辑、可验证。
- Dashboard 从只读 runtime snapshot 进入受控配置管理，但不是直接编辑散落 `.env`。

需要定义：
- profile 文件 schema。
- 默认 profile、环境变量、用户 profile、surface override 的加载优先级。
- 哪些字段可以在 dashboard 编辑，哪些只能展示。
- secret 字段的展示、保存和脱敏规则。
- preview diff、schema validation、保存、回滚路径。

当前已允许的安全编辑字段：
- assistant display name。
- working directory。
- enabled tools。
- skills.enabled。

后续待评估字段：
- prompt file references。
- surface 名称与基础 surface metadata。
- model/provider 非敏感配置。

这些待评估字段不作为当前 Dashboard 编辑范围；只有在单独设计清楚 schema、展示/保存边界、回滚和测试后，才考虑纳入。

暂不做：
- dashboard 直接编辑完整 system prompt 大文本并立即热生效。
- dashboard 直接写 `.env`。
- 多租户权限模型。

## 2. Skill Management

目标：
- skills 继续作为定制化能力的主要承载方式，而不是把定制逻辑塞进 tool。
- Dashboard 或 CLI 能更清楚地展示、启用、禁用、重载、调试 skill。

需要整理：
- skill manifest 字段是否足够稳定。
- user-invocable / auto-invocable 的展示和开关。
- skill activation 过程的可观测日志。
- skill reload 失败时如何反馈给 agent 和用户。
- skill 列表进入 prompt 的形式是否还能继续简化。

优先问题：
- 当前 skill list 是 transient context，方向正确，但需要减少噪音。
- skill 的错误反馈要进入 agent 可见上下文，但不一定展示给用户。
- skill 安装/删除/启停要有测试，避免 dashboard 修改后 runtime 不一致。

暂不做：
- skill marketplace。
- skill 权限和计费体系。
- 把所有 tool 都改造成 skill。

## 3. Unified Logs And Local Analysis

目标：
- 先把日志作为稳定数据源，而不是先做复杂云端分析。
- 本地能可靠查看、上传、回放、基础分析。

当前原则：
- session event schema 是主线。
- 日报、上传、本地分析都应从日志内容解析，不从文件名猜 session id。
- runtime 错误如果影响 agent 行为，应作为标准 SDK 消息中的用户侧反馈进入下一轮上下文。
- 只用于审计或调试、对 agent 决策无帮助的信息，只记录日志，不进入上下文。

需要整理：
- turn / runtime feedback / tool result / outbound message 的统一事件语义。
- 本地日志查看器或 dashboard 页面。
- 上传状态、失败重试、去重 key。
- 本地自动分析：错误聚类、常见 tool failure、prompt 噪音、token 使用、session 异常结束。

暂不做：
- 大规模云端数据挖掘。
- 复杂 BI dashboard。
- 非标准 SDK role 或自定义 observation role。

## 4. Subagent Management

目标：
- 参考 Codex / Claude Code 的 session 和子任务处理方式，但只采纳能让核心更清晰的部分。
- 子 agent 是长任务/并行任务能力，不应把 `AgentSession` 重新变胖。

需要整理：
- subagent task lifecycle：created / running / waiting / completed / failed / cancelled。
- task directory 和工作目录边界。
- parent session 如何看到 subagent status。
- subagent 结果如何进入 transcript。
- 用户如何取消、查看进度、验收结果。
- adapter 如何发送中间结果。

优先原则：
- `AgentSession` 不直接管理子进程。
- 子任务状态由独立 manager/registry 维护。
- 给 agent 看的 subagent status 是 transient context。
- 最终结果要由主 agent 验收和转述，不直接绕过主 agent 给用户做最终判断。

暂不做：
- 全自动多 agent 调度系统。
- 复杂任务市场或队列服务。
- 和外部 coding agent 的生产主路径深度耦合。

## 5. Remaining Architecture Hygiene

这部分仍属于“瘦身后的小收口”，但不应继续扩大成大规模重构。

建议只做低风险项：
- 删除确认无用的历史文档或把它们归档到 `docs/archive/`。
- 收敛顶层临时测试脚本，决定保留、迁移到 `tests/legacy/`，或删除。
- 明确 CatsCo 命名，逐步替代 CatsCompany 文案，但保持兼容命令不变。
- 检查 adapter 里是否还有 runtime 规则残留。
- 检查 prompt 文件中是否还有过时身份、路径、工具说明。
- 对 dashboard 现有 pet / UI assets 做归属判断，避免未确认资源混入 runtime PR。
- `.claude/`、`.kiro/` 属于本地生成配置，已清理，不进入项目提交。
- `dashboard/pet/` 属于下一步 Dashboard UI 资源候选，暂时保留。

不建议继续做：
- 为了“更漂亮”继续拆 `AgentSession`，除非有明确问题。
- 继续抽象 tool registry/policy。
- 在没有 profile schema 的情况下继续堆 dashboard 配置入口。

## 建议顺序

第一阶段：需求和边界
- 整理 profile schema draft。
- 决定 dashboard 能编辑哪些字段。
- 决定旧文档、临时脚本、assets 的归档策略。

第二阶段：Profile 配置主线
- 实现 profile file schema。
- 实现加载优先级和 validation。
- Dashboard 只做安全字段的 preview/edit/save/rollback。

状态：已完成 Slice 1-4。当前不继续扩大 profile 编辑范围；prompt 文件引用、model/provider 非敏感字段和多 profile 支持留给后续单独评估。

第三阶段：Skill 管理
- Dashboard/CLI 展示当前 skills。
- 启用、禁用、重载和错误反馈规范化。
- 补 skill 管理测试。

第四阶段：日志本地分析
- Dashboard 增加本地日志视图。
- 增加基础错误分析和上传状态视图。
- 明确哪些 runtime error 进入 agent 上下文。

第五阶段：Subagent 管理
- 明确 lifecycle 和状态展示。
- 完善取消、进度、结果验收。
- 再决定是否接入 external coding agent 主路径。

## 当前不确定项

- Dashboard 是否应该成为主要入口，还是只作为配置/观察辅助面板。
- profile 是否支持多个 assistant 实例，还是先只支持一个本地实例。
- CatsCo 是否要作为正式品牌名同步改目录/命令，还是先只改用户可见文案。
- 旧顶层 `test-*.ts` 文件是否还有保留价值。
- `.claude/`、`.kiro/` 是否属于个人本地配置，是否应加入 `.gitignore`。
