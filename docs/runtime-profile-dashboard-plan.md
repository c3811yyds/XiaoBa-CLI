# Runtime Profile And Dashboard Config Plan

日期：2026-05-03

## 阶段目标

把 runtime 的配置来源从“散落在环境变量、adapter 默认值、prompt 拼接逻辑里”收敛成一条明确链路：

`default profile -> environment/config -> runtime profile file -> surface override -> RuntimeFactory`

Dashboard 的角色是查看、预览、校验、受控编辑 profile。它不能绕过 schema 直接写 `.env`，也不能成为另一个隐式配置源。

## 当前切片顺序

### Slice 1 - Profile File Schema And Loader

状态：完成。

目标：
- 定义 runtime profile 文件 schema。
- 支持读取 profile 文件并合并到 `RuntimeProfile`。
- 暴露 profile 文件路径、是否存在、是否加载、校验问题。
- CLI / adapters / dashboard snapshot 都走同一个 profile resolution。

不做：
- 不写 profile 文件。
- 不做 dashboard 编辑 UI。
- 不迁移旧 `.env`。
- 不保存 secret。

完成内容：
- 新增 `src/runtime/runtime-profile-config.ts`，负责 profile 文件路径解析、schema 解析、合并和配置元信息。
- 默认 profile 文件路径为 `~/.xiaoba/runtime-profile.json`。
- 支持通过 `XIAOBA_RUNTIME_PROFILE_PATH` 或 `XIAOBA_PROFILE_PATH` 指定 profile 文件路径。
- CLI、adapter runtime、dashboard runtime snapshot 都接入同一套 profile resolution。
- adapter surface 仍由调用方决定，profile 文件不能改变当前 adapter 的 surface。
- profile 文件中的 `model.apiKey` 被拒绝进入 runtime profile，并作为 config issue 暴露。
- dashboard snapshot 对 profile file 中的 `model.apiUrl` 做展示级脱敏，避免 credential/query token 泄漏。
- dashboard `/api/status` 使用 readonly config，不创建用户配置目录。

验证：
- 定向：`npx tsx --test tests/dashboard-runtime-config.test.ts tests/config-manager-merge.test.ts tests/runtime-profile.test.ts tests/adapter-runtime.test.ts`，通过 3 suites / 20 tests。
- Slice 1 初始定向：`npx tsx --test tests/runtime-profile.test.ts tests/adapter-runtime.test.ts tests/dashboard-runtime-config.test.ts tests/runtime-factory.test.ts`，通过 4 suites / 27 tests。
- `npm run build` 通过。
- `npm test` 通过，35 个 runtime test files；51 top-level TAP tests / 46 suites / 179 tests 全部通过。

独立 review 修正：
- 采纳建议：dashboard `/api/status` 从 `ConfigManager.getConfig()` 改为 `getConfigReadonly()`，避免 GET 创建 `~/.xiaoba`。
- 采纳建议：dashboard snapshot 返回 profile 时对 `profile.model.apiUrl` 做脱敏展示，避免 profile file URL 中的凭据或 query token 泄漏。
- 采纳建议：补 `GET /api/status` 不创建配置目录测试。
- 采纳建议：补 profile file `apiUrl` 脱敏测试。

### Slice 2 - Dashboard Read-Only Alignment

状态：完成。

目标：
- Dashboard 清楚展示 profile 来源、最终生效值、validation issues。
- 对 secret 和 URL 继续脱敏。
- 明确哪些字段将来可编辑，哪些只读。

完成内容：
- `/api/runtime/config` 增加 `profileEditing` 元信息，明确 editable fields、read-only fields、preview/save/rollback endpoints。
- Dashboard runtime 面板展示 profile 文件路径、是否存在、是否 loaded、validation/config issues。
- Dashboard runtime 面板展示“保存后新 session 生效”，避免误导为热更新当前 session。

### Slice 3 - Safe Profile Editing API

状态：完成。

目标：
- 增加 schema validation。
- 增加 preview diff。
- 增加 save / rollback。
- 只允许安全字段：displayName、workingDirectory、enabled tools、skills.enabled。

完成内容：
- 新增 `src/runtime/runtime-profile-editor.ts`。
- 新增 `GET /api/runtime/profile/edit`，只读返回当前编辑状态，不创建 profile 文件。
- 新增 `POST /api/runtime/profile/preview`，返回 diff 与 validation，不写文件。
- 新增 `PUT /api/runtime/profile`，只保存安全字段到 profile 文件。
- 新增 `POST /api/runtime/profile/rollback`，恢复上一次保存前的文件状态；如果上一次是新建，则删除 profile 文件。
- 编辑 API 响应中对 profile/draft 的 `model.apiUrl` 做脱敏，不泄漏 URL credentials/query token。

### Slice 4 - Dashboard Editing UI

状态：完成。

目标：
- 做一个清晰、可回滚的配置界面。
- 不直接暴露 secret。
- 不提供“保存即热生效”的误导，明确哪些变更需要重启或新 session。

完成内容：
- Dashboard 配置页新增 Runtime Profile 编辑卡片。
- 支持编辑 assistant display name、working directory、enabled tools、skills.enabled。
- 支持预览变更、保存 profile、回滚上次保存。
- 继续保留旧 `.env` 高级配置区域；profile 编辑不直接写 `.env`。

验证：
- 定向：`npx tsx --test tests/runtime-profile-editor.test.ts tests/dashboard-runtime-profile-api.test.ts tests/dashboard-runtime-config.test.ts tests/config-manager-merge.test.ts tests/runtime-profile.test.ts tests/adapter-runtime.test.ts`，通过 5 suites / 33 tests。
- `npm run build` 通过。
- `npm test` 通过，37 个 runtime test files；53 top-level TAP tests / 48 suites / 192 tests 全部通过。
- Browser smoke：通过临时静态 server 加载 dashboard，并调用 `renderRuntimeConfig()` 验证 Runtime Profile 编辑卡片、字段值、工具勾选和“保存后新 session 生效”提示能正确渲染。完整 API browser server 在当前沙箱里受端口绑定 / `sharp` 原生模块限制，API 行为由模块测试覆盖。

独立 review 修正：
- 采纳建议：profile editor 只保存 dashboard 明确允许的 editable fields，不再把旧 profile 文件中的 unknown nested fields 原样带入新文件。
- 采纳建议：保存前先拒绝已有 profile 文件里的 secret、未知字段和 malformed allowed leaf values，避免 rollback sidecar 持久化不安全内容。
- 采纳建议：补充 unsafe existing profile 不写入 rollback sidecar 的回归测试。
- 独立 review 复查后未发现剩余 blocker。

## 设计约束

- Surface 由 adapter 决定，profile 文件不能让 Feishu adapter 变成 CatsCo adapter。
- Working directory 可以来自 profile 文件，但必须显示最终绝对路径。
- Tool list 只允许注册过的默认工具名。
- API key 等 secret 不进入 runtime profile 文件。
- Dashboard GET 请求不能创建用户配置目录或写文件。
- `dashboard/pet/` 属于下一阶段 UI 资源，不作为临时文件删除。
- `.claude/`、`.kiro/`、`.playwright-mcp/` 属于本地 agent / IDE / 浏览器测试生成配置，已加入 ignore，不进入项目提交。
