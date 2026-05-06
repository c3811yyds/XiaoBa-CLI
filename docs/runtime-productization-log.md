# Runtime Productization Work Log

本文件记录 checkpoint `bb6b989 refactor(runtime): slim runtime foundation and add profile config` 之后的产品化主线工作。

历史 slimming / foundation 记录保留在 `docs/runtime-slimming-log.md` 和 `docs/runtime-slimming-report.md`，后续不继续向 slimming 口径追加新阶段。

## 2026-05-04 - Stage 0: 产品化主线基线

状态：完成。

目标：
- 从仓库和文档恢复 checkpoint 后现状。
- 建立 Runtime Productization And Dashboard Operations 的执行计划。
- 标记当前工作区中不应自动纳入后续切片的文件。

已确认：
- 当前分支：`codex/runtime-foundation`
- 当前 HEAD：`bb6b989 refactor(runtime): slim runtime foundation and add profile config`
- 顶层临时待办文件已按用户要求删除，不再作为后续工作入口。
- 存在多个 untracked 顶层历史文档、旧测试、候选 skills 和 `dashboard/pet/` 资源，后续实现不得默认 stage。
- `package.json` 保持 `npm run start -- catscompany` 与 `npm run start -- dashboard` 启动方式。

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

本次改动：
- 新增 `docs/runtime-productization-plan.md`，作为 checkpoint 后新主线入口。
- 新增本工作记录文件。
- 更新 `docs/runtime-next-requirements.md` 的当前执行计划指向，避免继续把已完成的 profile dashboard plan 当作下一阶段入口。
- 删除顶层临时待办文件，避免后续阶段继续把它当成待办来源。

为什么这样做：
- 旧文档对 foundation 和 release checkpoint 很有价值，但继续在 slimming 文档里追加 Dashboard/Skill/Logs/Subagent 产品化任务会让边界变模糊。
- 当前工作区有较多未归属文件，先写清楚归属可以降低后续误提交风险。

验证：
- `git status --short` 已运行，用于确认当前 dirty / untracked 范围。
- `git diff --stat` 已运行，用于确认本阶段没有 runtime 代码 diff。
- `git diff --check` 通过。
- 独立只读 review 已完成，无 blocker。
- 已采纳 review 建议：旧需求文档中的 Dashboard 编辑范围改为当前安全字段 + 后续待评估字段。
- 已采纳 review 建议：补充阶段 0 开始前已存在的 dirty / untracked 路径清单。

剩余风险：
- 旧文档中仍会出现 CatsCompany/slimming 语境，后续切片查阅时需要以本计划为当前入口。
- `dashboard/pet/` 中的电子宠物方向可能与 Skill Management 有交集，但当前不纳入最小 Skill Management 闭环。

## 2026-05-04 - Stage 1A/1B: CatsCo identity and compatibility rebrand

状态：完成当前低风险切片。

目标：
- 把 CatsCo 明确为本地 agent 产品名，而不是仅作为历史 `catscompany` adapter 的显示名。
- 先做兼容式 rebrand，不迁移内部 surface id、session key、持久化路径或远程仓库。

代码盘点结论：
- `src/index.ts` 只有 `catscompany` 命令，需要增加 `catsco` alias，但保留旧命令。
- `src/commands/catscompany.ts` 读取 `CATSCOMPANY_*`，需要支持 `CATSCO_*` alias，并移除会打印 bot config 的 debug 输出，避免 API key 进入日志。
- `src/core/session-surface.ts` 的 surface id 必须保留 `catscompany`，但给 agent 看的会话文案可以改为 CatsCo。
- `src/dashboard/service-manager.ts` 的 service key 必须保留 `catscompany`，但 Dashboard service label 可以改为 CatsCo。
- `src/dashboard/routes/api.ts` 的 `/cats/*` API 与 service lookup 可保留，错误文案可改为 CatsCo；读取 env 时可支持 `CATSCO_*`，但本切片不扩大写 `.env` 的 secret 行为。
- `src/catscompany/**` 目录和 class/type 名称暂不迁移，先只改用户可见日志和提示。

本切片不做：
- 不改 `src/catscompany/` 目录名。
- 不改 `RuntimeSurface = 'catscompany'`。
- 不改 session key、log schema、profile surface 值。
- 不改 `dashboard/index.html` 或电子宠物资源。
- 不改远程仓或 package name。
- 不删除旧 `xiaoba` binary alias。

验证计划：
- 增加命令配置解析单测。
- 更新 surface prompt 测试。
- 跑相关定向测试和 `npm run build`。
- 关键切片后做独立只读 review。

本次改动：
- `package.json` / `package-lock.json` 增加 `catsco` binary；`xiaoba` binary 仍保留为兼容 alias。
- `src/index.ts` 把主 CLI 名称改为 `catsco`，并增加 `connect` 作为 CatsCo webapp connector 主命令；`catscompany` 和 `catsco` 子命令仍保留并调用同一路径。
- `src/commands/catscompany.ts` 增加 `resolveCatsCoCommandConfig()`，读取优先级为 `CATSCO_*` > `CATSCOMPANY_*` > `config.catscompany`。
- 移除 `catscompanyCommand()` 中会打印完整 bot config 的 debug 输出，避免 API key 进入日志。
- `src/core/session-surface.ts`、CatsCo adapter 日志、附件提示、日报标题、Dashboard service label 改成用户可见 CatsCo 文案。
- `src/runtime/runtime-profile.ts` 支持 `CURRENT_PLATFORM=CatsCo` 解析到内部兼容 surface id `catscompany`。
- `src/dashboard/routes/api.ts` 读取 `CATSCO_*` alias，并继续 fallback 到 `CATSCOMPANY_*`；本切片没有新增写 `.env` 的 secret 行为。
- `tests/catsco-command-config.test.ts` 覆盖 CLI env alias 优先级。
- `tests/dashboard-catsco-env.test.ts` 覆盖 Dashboard env alias 优先级。

验证结果：
- `npx tsx --test tests/catsco-command-config.test.ts tests/dashboard-catsco-env.test.ts tests/surface-prompt.test.ts tests/runtime-profile.test.ts tests/runtime-characterization.test.ts tests/daily-report-generator.test.ts` 通过：6 suites / 31 tests。
- `npm run build` 通过。
- `git diff --check` 通过。
- `node dist/index.js --help` 显示 `catsco` 作为主 CLI 名称，并保留 `connect`、`catscompany` legacy alias 和 `catsco` compatibility subcommand。

独立 review：
- 无 legacy `catscompany` 启动破坏。
- 无内部 surface/session/log schema 迁移。
- 确认 debug config 输出移除是正向 secret 泄漏修复。
- Reviewer 指出 Dashboard env precedence 对 exported `CATSCO_*` 不一致；已修复并补测试。
- Reviewer 把并行存在的 `dashboard/index.html` / `dashboard/pet/` 改动列为本切片风险；这些是用户并行电子宠物改动，本切片未修改，也不会 stage。

剩余风险：
- `src/catscompany/**` 目录、class/type 名称和内部 `catscompany` service key 仍保留；这是兼容策略，不代表最终命名完成。
- Dashboard CatsCo webapp setup 仍沿用已有 `.env` 写入方式保存连接信息；secret storage 需要后续单独设计，当前切片不扩大该行为。
- 远程仓库名和 package name 仍未 rebrand。

## 2026-05-04 - Stage 2 prep: Dashboard IA analysis

状态：完成分析，尚未改 Dashboard UI。

目标：
- 把 Dashboard 从“开发期功能堆叠”拆解成用户任务导向的信息架构。
- 将 Runtime Profile 产品化与 Companion / 电子宠物 UI 放在同一 Dashboard 结构下考虑。
- 先明确边界，避免配置页、宠物页、skill 管理和日志分析互相抢职责。

当前发现：
- `dashboard/index.html` 是大单页，包含 services、companion、chat、config、store 五个页面。
- `services` 和 `chat` 都能影响 CatsCo connector，用户路径重复。
- `config` 同时展示 Runtime Profile 和原始 `.env`，主次不清。
- Runtime Profile preview/save/rollback 已有能力，但 UI 仍偏调试表单。
- `companion` 已有宠物状态、工作过程、XP、技能卡片，但当前也展示 skill 启用/禁用/删除按钮，容易和 Stage 3 Skill Management 冲突。
- Chat 页面仍有 CatsCompany / XiaoBa 旧文案，与 CatsCo rebrand 不一致。
- 原始 system prompt、logs、manual pet state/frame strip、advanced endpoint 等 debug 能力需要降级为 Advanced / Diagnostics。

本次改动：
- 新增 `docs/dashboard-productization-ia.md`。
- 更新 Stage 2 计划，把 Dashboard IA 和 Companion 边界纳入阶段范围。

下一步推荐：
- Slice 2.1：只做 Dashboard IA 文案和入口整理，不改 API 行为。
- 优先改导航、页面标题、CatsCo/XiaoBa/CatsCompany 文案、Store -> Skills、Config -> Runtime Profile / Settings。
- 暂不改 skill 操作逻辑，下一步只把其产品归属写清楚。

## 2026-05-04 - Stage 2.1: Dashboard Settings IA slice

状态：实现完成，review 问题已处理。

目标：
- 把 Settings 页面从“Runtime Profile + 原始 `.env` 并列”改成 Runtime Profile 为主路径。
- 明确 profile 文件来源、最终生效配置、保存影响范围和校验问题。
- 把原始 `.env` 编辑降级为高级入口，并明确它会写入 `.env`。
- 不碰正在并行修改的 companion/pet 逻辑，不迁移 skill 管理 API。

本次改动：
- `dashboard/index.html` 的 Settings 页面增加 Runtime Profile 状态、profile 文件、运行根目录、生效范围和最终生效配置分层。
- Runtime Profile 编辑器改为“受控编辑”，只展示 display name、working directory、enabled tools、skills enabled。
- Profile 保存前增加确认，明确保存后只影响新 session，当前 session 不热更新。
- 原始 `.env` 配置移入“高级”折叠区，`.env` 保存前增加确认，提示可能包含 API key、token 或 secret。
- 原始 `.env` 配置不再随 Dashboard 初始化预加载，只在用户展开高级区后按需读取。
- 旧 `.env` 表单渲染补充 HTML escaping，避免 `.env` 值破坏 Dashboard DOM。
- 新增 `tests/dashboard-productization-html.test.ts`，锁住 Settings 页面 IA 和确认边界。

不做：
- 不让 Dashboard 成为新的隐藏配置源。
- 不写 API key/token/secret 到 Runtime Profile。
- 不改 skill 启用/禁用/删除逻辑。
- 不改 companion 的 XP、skill stats 或 pet process 数据来源。

验证结果：
- `npx tsx --test tests/dashboard-productization-html.test.ts tests/runtime-profile-editor.test.ts tests/dashboard-runtime-profile-api.test.ts tests/dashboard-runtime-config.test.ts` 通过：19 tests。
- `npm run build` 通过。
- `git diff --check` 通过。
- Dashboard script syntax check 通过。
- Browser smoke 以静态 `file://` 页面完成：Settings 页面可切换，能看到 Runtime Profile、原始 `.env` 高级入口和新导航文案。当前工具环境下独立命令启动的 localhost Dashboard 对浏览器/curl 不可达，因此未完成 live API browser smoke。

独立 review：
- Reviewer 提醒当前 `dashboard/index.html` diff 中存在 companion/pet localStorage 和 process state 改动。判断：这是并行电子宠物工作带来的同文件 diff，不属于本 Settings 切片；不回滚、不 stage 为本切片的一部分。
- Reviewer 指出 `.env` editor 仍在初始化时调用 `fetchConfig()`，会提前读取 raw config。判断：有效，已修复为展开 Advanced 区后按需加载，并补静态测试。

剩余风险：
- 当前工具环境下独立命令启动的 localhost Dashboard 对 browser/curl 不可达，后续需要在同一宿主浏览器环境补一次 live Dashboard API smoke。

## 2026-05-04 - Stage 2 re-scope: Dashboard Operations rework

状态：完成设计重整，尚未改 runtime/dashboard 代码。

触发原因：
- 用户指出 Dashboard 当前仍像开发期需求堆叠，不像面向用户的启动和运营工作台。
- live `http://localhost:3800/` 只读检查显示首页核心卡片仍是 `Version / Provider / Host / Skills Path`，这些更适合 Diagnostics。
- live `/api/status` 显示 `provider=anthropic`、`model=MiniMax-M2.7-highspeed`，单独展示 Provider 会误导用户；应展示“模型与密钥是否可用”。
- live `/api/cats/status` 已能判断 CatsCo connected/configured 和 connector running，但首页没有转译成“CatsCo Chat ready”。
- live `/api/runtime/config` 显示 profile file 不存在且 surface 为 `cli`，说明 runtime snapshot 不能直接代表某个 connector 的启动 readiness。

本次改动：
- 新增 `docs/dashboard-operations-rework-plan.md`。
- 更新 `docs/runtime-productization-plan.md` 的 Stage 2：把 typed settings、service preflight、readiness dashboard 提到 Runtime Profile 继续细化之前。
- 更新 `docs/dashboard-productization-ia.md`：标记 Runtime Profile 状态分层后置，新增 Model & Key Setup / Typed Settings 和 Service Preflight / Readiness 切片。

下一步执行顺序：
1. Slice A：Settings Typed Model & Key API。
2. Slice B：Service Preflight / Readiness API。
3. Slice C：Home readiness UI。
4. Slice D：CatsCo checklist 与 Chat 联动。
5. Slice E：Skill Hub / Companion 边界。
6. Slice F：Diagnostics cleanup。

风险记录：
- 现有 `/api/config` raw `.env` 读写边界需要收紧；不能继续把它作为用户主设置入口。
- service start 需要 preflight；否则缺 key/model 时仍会变成“先 running 后 error”。
- Companion 和 Skill Hub 必须拆清写操作所有权，避免宠物页继续拥有 skill delete/disable。

## 2026-05-04 - Slice A implementation: typed settings API

状态：后端最小闭环完成，Dashboard UI 尚未接入。

目标：
- 新增用户态 typed settings API，先支撑 Model & Key Setup。
- 避免 normal settings API 回显 secret。
- 收紧 legacy `/api/config` 的 secret mask、allowlist 和 newline 防注入。
- 保存后刷新 `process.env`，避免 Dashboard status/runtime 后续读取 stale config。

本次改动：
- 新增 `src/dashboard/settings.ts`。
- 新增 `GET /api/settings`：返回 allowlisted setting fields，secret 仅返回 `present` / replace-clear 能力。
- 新增 `PUT /api/settings`：只接受 `model.provider`、`model.apiBase`、`model.model`、`model.apiKey`、`catsco.httpBaseUrl`、`catsco.wsUrl`。
- secret update 使用 `keep` / `replace` / `clear`，不需要 masked value round-trip。
- dotenv 写入统一走 safe serializer，并拒绝 newline。
- legacy `GET /api/config` 改为按 key pattern mask sensitive values。
- legacy `PUT /api/config` 增加 allowlist 和 newline 拒绝，并写后更新 `process.env`。
- 新增 `tests/dashboard-settings-api.test.ts`。

验证结果：
- `npx tsx --test tests/dashboard-settings-api.test.ts tests/dashboard-catsco-env.test.ts tests/dashboard-runtime-profile-api.test.ts tests/dashboard-runtime-config.test.ts` 通过：17 tests。
- `npm run build` 通过。
- `git diff --check` 通过。

独立 review：
- Reviewer 指出 secret suffix 仍然会泄漏凭据特征；已改为 settings API 和 UI 完全 presence-only。
- Reviewer 指出 legacy `/api/config` 对 credential URL / DSN 类 key mask 不足；已扩展 sensitive key pattern，并补 `DATABASE_URL` / `SENTRY_DSN` 测试。

剩余风险：
- Dashboard UI 仍未接入 `/api/settings`，设置页暂时还是旧 raw advanced editor + Runtime Profile UI。
- preflight / readiness API 尚未实现；Home 仍不能解释“差哪一步”。
- legacy `/api/config` 仍存在，仅已收紧；后续应迁入 Diagnostics。

## 2026-05-04 - Slice B implementation: service preflight and readiness API

状态：后端最小闭环完成，Home UI 尚未接入。

目标：
- 在 service start 前做本地 preflight，缺模型 key、connector 凭据或无效 Runtime Profile 时不 spawn。
- 提供 Dashboard 首页后续可消费的 readiness summary。
- 只做本地同步检查，不在轮询状态中自动发起网络探测。

本次改动：
- 新增 `src/dashboard/readiness.ts`，集中维护 readiness / preflight 检查，不放进 `AgentSession` 或 adapter。
- 新增 `GET /api/readiness`，聚合模型与密钥、CatsCo Chat、Runtime Profile、Skills 和 service preflight 状态。
- 新增 `POST /api/services/:name/preflight`。
- `POST /api/services/:name/start` 默认先跑 preflight，blocking 时返回 `400` 和 preflight 详情，不启动进程。
- `POST /api/services/:name/restart` 同样先跑 preflight。
- `/api/cats/setup` 完成 CatsCo 账号和 agent 绑定后，只在 preflight 不 blocked 时自动启动 connector。
- readiness/preflight 使用 `.env` + 当前 `process.env` + 旧 user config 的本地有效配置，不返回 secret、system prompt text 或本地 runtime root path。
- Runtime Profile validation issue 在 readiness/preflight 中只返回泛化错误，不回显非法 tool 原值。
- `ConfigManager` 增加 `XIAOBA_CONFIG_PATH` 覆盖入口，用于测试和受控配置文件定位；默认仍是 `~/.xiaoba/config.json`。
- 新增 `tests/dashboard-readiness.test.ts`。

验证结果：
- `npx tsx --test tests/dashboard-readiness.test.ts tests/dashboard-settings-api.test.ts tests/dashboard-catsco-env.test.ts tests/dashboard-runtime-profile-api.test.ts tests/dashboard-runtime-config.test.ts tests/config-manager-merge.test.ts` 通过：29 tests。
- `npm run build` 通过。
- `git diff --check` 通过。

独立 review：
- Reviewer 指出 preflight 起初只读 `.env` / `process.env`，与 `catscompany` / `feishu` 命令支持 `~/.xiaoba/config.json` 不一致。判断：有效，已修复为 route 传入 `ConfigManager.getConfigReadonly()`，preflight 按 env 优先、user config fallback 判断 presence。
- Reviewer 指出 Runtime Profile validation 可能把非法 tool 原值带进 readiness/preflight。判断：有效，已改为泛化 validation message，并补“不泄漏非法 tool/path/secret 原值”测试。
- Reviewer 建议补 `restart`、`force`、config fallback 测试。判断：有效，已补覆盖。

剩余风险：
- Home UI 仍未消费 `/api/readiness`，首页还没有从诊断卡片改成启动 readiness dashboard。
- 当前 live Dashboard 进程需要重启后才能看到新 endpoint。

## 2026-05-05 - Slice C implementation: Home readiness UI

状态：第一版 UI 完成，真实 readiness 数据需要重启 live Dashboard 后复验。

目标：
- 把运行页从开发期 service/debug console 调整为启动 readiness dashboard。
- 让用户先看到模型与密钥、CatsCo Chat、Runtime Profile、Skills 的可用性，再看 service details。
- 将 Version / Host / Skills Path 等诊断信息降级到 Diagnostics。

本次改动：
- `dashboard/index.html` 的运行页新增 `run-summary` 和 `readiness-grid`。
- 前端新增 `fetchReadiness()` / `renderReadiness()`，消费 `GET /api/readiness`。
- Service details 保留 connector 卡片；Diagnostics 折叠展示 version / runtime / model / skills path。
- service start/restart blocked 时，前端会读取 `preflight` payload 并显示阻断原因。
- `/api/readiness` 不可用或 live 后端未重启时，显示“Readiness API 暂不可用，请重启 Dashboard 后重试”，不暴露 JSON parse 细节。
- 更新 `tests/dashboard-productization-html.test.ts`，锁住运行页 readiness IA。

验证结果：
- `npx tsx --test tests/dashboard-productization-html.test.ts tests/dashboard-readiness.test.ts tests/dashboard-settings-api.test.ts tests/config-manager-merge.test.ts` 通过：22 tests。
- `npm run build` 通过。
- `git diff --check` 通过。
- Playwright live smoke 打开 `http://localhost:3800/`：新运行页结构可加载；当前 3800 后端仍返回旧 HTML 给 `/api/readiness`，因此显示 fallback。重启 Dashboard 后应显示真实 readiness cards。

独立 review：
- Reviewer 指出 Service details 仍默认展开，不符合 readiness-first IA。判断：有效，已去掉 `open`。
- Reviewer 建议静态测试锁住 Service details 默认折叠。判断：有效，已补测试。

剩余风险：
- 尚未在重启后的 live Dashboard 上确认真实 `/api/readiness` cards 数据渲染。
- Home UI 已接入 readiness，但 Settings typed fields 还没有前端表单；用户仍需要下一步进入 Settings UI 整理。

## 2026-05-05 - Model source boundary decision

状态：设计边界已确认，进入本地 Dashboard 实现。

结论：
- 普通用户只注册/登录 CatsCo。
- CatsCo 托管模型是默认产品路径；CatsCo 后端未来负责模型目录、provider key、用户用量和限额。
- 本地 CLI/Dashboard 当前不实现云端模型网关，也不把未完成的托管模型伪装成 ready。
- 自定义模型保留为 Advanced 路径，继续落到现有 `GAUZ_LLM_*` 配置。
- `buildsense.asia` 只作为迁移期内部网关/历史实现细节，不作为本地用户配置项。

本地实现要求：
- Settings 页面从“模型 API 配置”改为“模型来源”。
- 默认展示 CatsCo 托管模型状态，未登录时提示先登录，后端未接入时提示当前使用自定义模型。
- Advanced 自定义模型保存 provider、API base、model 和访问凭证；访问凭证只写入本地，不回显。
- Readiness 中托管模型未接入只能是 warning；缺自定义模型访问凭证仍然 block 本地启动。

后端后续契约：
- `GET /api/models`
- `POST /api/model-sessions`
- `POST /v1/messages` 或兼容 OpenAI/Anthropic 的模型网关 endpoint。
- usage 由 CatsCo 后端记录，本地 Dashboard 不成为计费真相源。

## 2026-05-05 - Slice C implementation: CatsCo Chat state machine UI

状态：第一版完成。

目标：
- 把 Chat 页从登录、绑定、启动、调试控件堆叠改成状态机入口。
- 明确 Dashboard Chat 连接的是 CatsCo webapp 会话，不新增独立本地 chat。
- 未 ready 时禁用消息输入，避免用户把消息发到一个本地 agent 还不会回复的 topic。

实现：
- `dashboard/index.html` 的 CatsCo Chat 顶部新增 state banner 和五步 checklist：模型来源、CatsCo 账号、Agent 绑定、Connector、Chat 会话。
- 连接详情、topic、service raw status 和 endpoint 设置默认折叠到 `连接详情 / 高级 endpoint`。
- 前端用现有 `/api/readiness` 和 `/api/cats/status` 组合状态，不新增后端 API。
- `sendCatsMessage()` 在非 ready 状态下直接阻止发送，并展示当前阻断原因。
- `tests/dashboard-productization-html.test.ts` 增加 Chat 状态机静态测试。

验证：
- `npx tsx --test tests/dashboard-productization-html.test.ts tests/dashboard-settings-api.test.ts tests/dashboard-readiness.test.ts` 通过：20 tests。
- `npm run build` 通过。
- `git diff --check` 通过。
- `npm run start -- dashboard` 启动后，`GET /` 和 `GET /api/readiness` 返回正常。
- Playwright smoke：Chat 页显示“启动本地 connector”，五步 checklist 正常，输入框禁用；Settings 页显示“模型来源与 Runtime Profile”、CatsCo 托管模型和自定义模型入口。

剩余风险：
- Chat 页仍在单文件 Dashboard 内，后续继续改动容易和电子宠物并行工作产生同文件冲突。
- 当前 CatsCo 托管模型仍是后端未接入状态；本地只做状态展示和自定义模型 fallback。

Review 处理：
- Reviewer 指出 Chat 在 `/api/readiness` 尚未返回时可能乐观解锁输入。判断：有效，已增加 `appReadinessLoaded/appReadinessError` gate，并让输入框和发送按钮在 HTML 初始状态即禁用。
- Reviewer 指出前端用 `user.uid` / `botUid` 代替服务端 `connected/configured`，可能绕过 token/API key readiness。判断：有效，已改为只信 `/api/cats/status` 的 `connected/tokenPresent` 和 `configured` 布尔值。
- Reviewer 指出 settings API/UI 仍暴露 secret suffix 和 credential URL/query。判断：有效，已改为 secret 完全 presence-only，URL 展示前移除 username/password/query/hash，写入时拒绝带 credentials/query/hash 的 URL。
- Reviewer 指出测试未覆盖风险路径。判断：有效，已补静态 gate 断言和 settings API URL/secret 泄漏测试。

## 2026-05-05 - Cleanup: remove backup model from Dashboard config

状态：完成。

结论：
- 备用模型不再符合“CatsCo 托管模型默认 + 自定义模型高级入口”的产品路径。
- Dashboard 不再展示或写入 `GAUZ_LLM_BACKUP_*`。
- `AIService` 不再读取 `GAUZ_LLM_BACKUP_*`，也不再支持隐藏的 failover env。后续如要多模型，应做成明确的模型配置切换，而不是备用模型表单。

实现：
- 从 Dashboard 高级 `.env` 表单移除“备用模型兼容配置”。
- legacy `/api/config` 写入 allowlist 移除 `GAUZ_LLM_BACKUP_*`，直接 API 写入会被拒绝。
- 保留 `GET /api/config` 对任意 secret-like key 的 masking，避免读取历史 `.env` 时泄漏。
- 简化 `AIService` 为单一 provider 调用入口：保留 retry，移除 backup provider chain、备模型切换和 `GAUZ_LLM_FAILOVER_ON_ANY_ERROR` / `GAUZ_STREAM_FAILOVER_ON_PARTIAL`。
- 补静态测试和 API 测试。
