# Runtime Foundation Release Checkpoint

日期：2026-05-04

## 目标

把当前 `codex/runtime-foundation` 分支整理成一个可 review、可提交、可开 PR 的检查点。

这个 checkpoint 的主题是：
- runtime slimming / foundation
- unified session logging
- prompt / tool / adapter / AgentSession 边界收敛
- runtime profile schema / loader / dashboard config Slice 1-4
- 测试入口和文档收口

不把后续产品化任务混进来：
- Dashboard 产品化完善
- Skill 管理优化
- 本地日志分析 UI
- subagent 管理完善
- CatsCo 全量命名迁移

## 当前分支

当前分支：`codex/runtime-foundation`

当前 `HEAD` 与 `main` 指向同一提交，所有 runtime foundation 工作都在工作区 diff 中，尚未提交。

## 建议纳入本次 checkpoint

代码主线：
- `src/runtime/**`，包含 external-agent primitives；它们只作为 foundation primitives 纳入，不接入主 runtime 路径
- `src/core/agent-session.ts`
- `src/core/agent-turn-controller.ts`
- `src/core/context-window-manager.ts`
- `src/core/runtime-feedback*.ts`
- `src/core/session-lifecycle-manager.ts`
- `src/core/session-surface.ts`
- `src/core/session-system-prompt.ts`
- `src/core/turn-context-builder.ts`
- `src/core/turn-log-recorder.ts`
- `src/core/message-session-manager.ts`
- `src/core/conversation-runner.ts`
- `src/commands/chat.ts`
- `src/commands/dashboard.ts`
- `src/dashboard/**`
- `dashboard/index.html`
- `src/catscompany/index.ts`
- `src/feishu/index.ts`
- `src/weixin/index.ts`
- `src/providers/openai-provider.ts`
- `src/tools/default-tool-names.ts`
- `src/tools/tool-manager.ts`
- `src/tools/send-text-tool.ts`
- `src/tools/send-file-tool.ts`
- `src/tools/spawn-subagent-tool.ts`
- `src/types/**`
- `src/utils/session-log-schema.ts`
- `src/utils/session-turn-logger.ts`
- `src/utils/daily-report-generator.ts`
- `src/utils/log-uploader.ts`
- `src/utils/log-ingest-scheduler.ts`
- `src/utils/config.ts`
- `src/utils/prompt-manager.ts`
- `src/skills/session-skill-runtime.ts`
- `prompts/behavior.md`
- `prompts/system-prompt.md`

测试与工具：
- `scripts/run-tests.mjs`
- runtime/profile/dashboard/session/logging 相关 `.test.ts`
- `tests/external-agent-orchestration.test.ts`
- `tests/context-compressor.test.ts`
- `tests/logger.test.ts`

文档：
- `docs/runtime-slimming-log.md`
- `docs/runtime-slimming-report.md`
- `docs/runtime-next-requirements.md`
- `docs/runtime-profile-dashboard-plan.md`
- `docs/release-checkpoint-plan.md`

配置：
- `.gitignore`
- `package.json`

## 建议暂不纳入，除非单独确认

后续资源或可能属于独立 PR：
- `dashboard/pet/**`
- `skills/officecli/**`
- `skills/sc-analysis/**`

历史/规划文档，建议后续决定归档或保留：
- `ARCHITECTURE.md`
- `LOG_SYSTEM_SUMMARY.md`
- `REFACTOR_PLAN.md`
- `SKILL-DEVELOPMENT.md`
- `TEST-PLAN.md`
- `bug-report-image-upload.md`
- `docs/architecture-split-plan.md`
- `docs/implementation-summary.md`
- `docs/message-based-mode-design.md`
- `docs/message-mode-test-plan.md`
- `docs/tool-architecture-refactor.md`

评测资产，建议不混入本次 checkpoint：
- `tests/ai-test-framework/**`
- `tests/eval-results/**`
- `tests/coo-*.ts`
- `tests/engineer-skill-eval.ts`
- `tests/gauzmem-speaker-identity.test.ts`
- `tests/reminder-scheduler.test.ts`
- `tests/skill-publish-debug.test.ts`

## 提交前验证

必须通过：
- `git diff --check`
- `npm run build`
- `npm test`

建议本机 smoke：
- `npm run start -- catscompany`
- `npm run start -- dashboard`

## 提交策略

建议不要一次性把所有 untracked 文件都 `git add .`。

推荐提交方式：
1. 先 stage 本次 checkpoint 明确纳入的代码、测试、文档和配置。
2. 保持后续资源和历史规划文档 unstaged。
3. 提交信息建议：`refactor(runtime): slim runtime foundation and add profile config`
4. PR 描述明确说明：这是 foundation checkpoint，不是 Dashboard/Skill/Subagent 产品化完成态。
