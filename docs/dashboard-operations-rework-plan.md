# Dashboard Operations Rework Plan

日期：2026-05-04

## 结论

Dashboard 下一步不应该继续做零散美化，也不应该把现有 `.env` editor 包一层文案就当作产品化完成。

Dashboard 的第一任务应是回答：

> 当前本地 CatsCo agent 能不能启动并开始使用？如果不能，差哪一步？

因此后续重整主线是：

1. 用“模型来源”和 typed settings 取代 raw `.env` 作为用户主配置入口。
2. 在启动前做 service preflight，避免“点启动后才从日志里发现缺 key”。
3. 把运行首页改成 readiness dashboard，而不是 service/debug console。
4. 让 CatsCo Chat 与启动状态联动。
5. 把 Skill Hub 和 Companion 做成同一个产品域，但只让 Skill Hub 拥有 skill 写操作。
6. 把 version、host、paths、system prompt、raw env、command args 等放入 Diagnostics。

## Live Dashboard Observations

基于 2026-05-04 对 `http://localhost:3800/` 的只读检查：

- `/api/status` 返回 `version`、`hostname`、`platform`、`nodeVersion`、`provider`、`model`、`skillsPath` 和 services。
- 当前首页的 `Version / Provider / Host / Skills Path` 属于诊断信息，不是启动决策信息。
- `provider=anthropic`、`model=MiniMax-M2.7-highspeed` 这种组合说明单独展示 Provider 对用户没有意义；应该展示“模型配置是否可用”。
- `/api/cats/status` 可以判断 CatsCo 是否 connected/configured、用户、bot uid、topic id、本地 connector service 状态。
- 当前 CatsCo 已 connected/configured 且 service running，但首页没有把它翻译成“CatsCo Chat ready”。
- `/api/runtime/config` 当前 profile file 不存在，surface 为 `cli`；这说明 Settings 里的 runtime snapshot 是 Dashboard 进程视角，不等于某个 connector 的完整启动 readiness。
- live service label 仍可能显示 `Cats Company 机器人`，说明旧命名会在运行态继续影响用户感知。

## Product Principles

- **Start-first**：运行首页围绕启动和可用性，不围绕进程、hostname、路径。
- **User terms first**：使用“模型来源”“CatsCo 连接”“本地 Agent”“能力”这类用户语义；`Provider`、`.env`、`Host`、`Skills Path` 进入 diagnostics。
- **No raw secret round-trip**：Dashboard 正常路径不读取或回显 secret 值；只展示 presence / missing / replace / clear。
- **Dashboard is not hidden config source**：Dashboard 可以受控写入明确 schema 的 settings，但必须明确写入目标和生效范围。
- **Preflight before spawn**：服务启动前先返回 blocking checks；缺 key、缺 model、缺 connector binding 不应该表现为先 running 后 error。
- **Diagnostics isolated**：system prompt text、local paths、command args、raw env、service logs 只作为诊断入口。
- **Companion and Skill are one product domain, not one write surface**：Companion 只读表达能力和成长；Skill Hub 拥有 enable/disable/delete/install/reload。

## Target Information Architecture

### 1. Home / 运行

首页改成 readiness dashboard：

- **模型来源**
  - ready / missing key / missing model / invalid api base。
  - CTA：去设置。
- **CatsCo**
  - 未登录 / 已登录未绑定 / 已绑定但 connector 未运行 / 可对话。
  - CTA：去 CatsCo Chat。
- **本地 Agent**
  - stopped / running / error。
  - 主 CTA：启动 / 重启 / 查看错误。
- **Skills**
  - enabled count / loaded count / load error。
  - CTA：去 Skill Hub。
- **最近问题**
  - 最近 blocking preflight failure 或 service lastError。
  - 日志入口作为 secondary action。

当前 service cards 保留，但移到 `Service details` 或 Diagnostics。

### 2. CatsCo

CatsCo 页面保留 chat，但必须是状态机驱动的 chat 入口，而不是登录、绑定、启动、调试控件的堆叠。页面先呈现下一步和 checklist：

1. Model source ready。
2. Account signed in。
3. CatsCo agent/bot bound。
4. Local connector running。
5. Chat topic ready。

状态文案使用：

- 需要配置模型来源
- 未登录
- 已登录，未绑定 agent
- 已绑定，本地 connector 未启动
- 可对话

Endpoint、topic id、bot uid、raw service status 继续折叠，默认不展示。消息输入在未 ready 时禁用，并给出明确 CTA。

### 3. Settings

Settings 拆成三层：

1. **模型来源**
   - 默认展示 CatsCo 托管模型：用户只登录 CatsCo，不需要看到模型供应商 URL、provider key 或 BuildSense 网关。
   - 当前本地版本不伪装云端模型网关已经可用；如果后端未接入，明确提示“当前请使用自定义模型”。
   - 自定义模型放 Advanced：provider、model、api base、访问凭证 presence。
   - 保存访问凭证需要明确确认；secret 不回显，不进入 Runtime Profile。
   - 备用模型不再作为 Dashboard 配置项；后续如需要多模型，改做明确的“模型配置切换”。

2. **Runtime Profile**
   - display name、working directory、tools.enabled、skills.enabled。
   - profile file 状态、preview/save/rollback。
   - 明确保存后新 session 生效。

3. **Advanced / Diagnostics**
- raw `.env` 仅作为临时兼容入口。
   - system prompt、local paths、runtime root、log paths、command args。

### 4. Skill Hub

现有 `Skills` tab 从 store 改成 hub：

- Overview：skills enabled、loaded/disabled count、load error。
- Installed：名称、描述、enabled、user/auto invocable、path、files、load error。
- Manage：enable/disable/delete/reload，必须有确认和错误反馈。
- Discover：保留当前 store / GitHub install，但命名为 Discover / Install。
- Diagnostics：skills path、raw files、refresh inventory。

### 5. Companion

Companion 是 Skill Hub 的视觉/成长层：

- 宠物状态、工作过程、等级/解锁。
- 只读能力摘要。
- 不显示 enable/disable/delete/install。
- skill call count、success rate、XP 在真实 log/stats API 出现前标记为 pending，不能伪装成真实数据。
- 手动 pet state、frame strip、pet manifest/debug 放 Diagnostics。

## API Boundary Plan

### Model Source And Typed Settings

产品边界：

- CatsCo 托管模型是默认方向，但本地 Dashboard 只显示状态和后端未接入提示。
- CatsCo 后端未来负责模型目录、provider key、用量和限额；本地不保存这些 provider key。
- `buildsense.asia` 是迁移期内部网关/历史实现细节，不在普通 UI、readiness message 或配置表单中展示。
- 当前可运行路径仍是自定义模型，落到现有 `GAUZ_LLM_*`。

后续 CatsCo 后端接口契约建议单独实现：

- `GET /api/models`：返回当前 CatsCo 用户可用模型目录。
- `POST /api/model-sessions`：创建短期模型访问会话。
- `POST /v1/messages` 或 OpenAI-compatible endpoint：CatsCo 后端转发到真实 provider。
- usage 记录进入 CatsCo 后端，不让本地 Dashboard 成为计费真相源。

新增或替换为 typed settings API：

- `GET /api/settings`
  - 返回 allowlisted field metadata。
  - 非 secret 可返回 value。
  - secret 只返回 `present: boolean`、`canReplace: true`、`canClear: true`。

- `PUT /api/settings`
  - 只接受 allowlisted setting ids。
  - secret field 使用 `{ action: "keep" | "replace" | "clear", value?: string }`。
  - 非 secret field 做类型校验和 URL 校验。
  - 写入使用 dotenv-safe serializer，禁止 newline 注入。
  - 写入后更新 `process.env` 或统一 reload effective config，避免 Dashboard 显示 stale data。

第一批自定义模型 settings：

- `model.provider`
- `model.apiBase`
- `model.apiKey`
- `model.model`
- `catsco.httpBaseUrl`
- `catsco.wsUrl`

备用模型从 Dashboard 用户可见配置和 runtime 读取链路中移除；历史 `GAUZ_LLM_BACKUP_*` env 不再作为产品能力读取。后续如需要多模型，改做明确的“模型配置切换”。

### Readiness / Preflight

新增：

- `GET /api/readiness`
  - 聚合 model/key、CatsCo、services、skills、runtime profile summary。
  - 不返回 secret、raw local paths、system prompt text。

- `POST /api/services/:name/preflight`
  - 返回 `{ status: "ready" | "blocked" | "warning", checks: [...] }`。

- `POST /api/services/:name/start`
  - 默认先跑 preflight。
  - blocking 时不 spawn。
  - 需要强制启动时必须是显式 diagnostics action，不能是默认路径。

Common checks：

- runtime profile valid。
- working directory exists。
- model provider supported。
- model name present。
- primary API key present。
- API base URL valid。
- CatsCo 托管模型未接入时只给 warning，不作为已可用模型来源。
- runtime command exists。

Service checks：

- CatsCo：HTTP/WS URL valid、bot API key present；account/token/bot binding 由 CatsCo checklist 展示。
- Feishu：App ID / App Secret present。
- Weixin：Token present。

网络连接测试单独做“测试连接”按钮，不在 status polling 中自动触发。

### Runtime Config Snapshot

正常 Settings UI 使用 summary：

- profile file exists/loaded/issues。
- effective display name / cwd / model label / tools count / skills enabled。
- validation status。

Diagnostics 才取：

- full system prompt text。
- runtime root。
- log dirs。
- local paths。
- command args。

## Implementation Slices

### Slice A - Settings Typed Model Source API/UI

当前状态：后端最小闭环已实现，Dashboard UI 正在接入模型来源。

目标：
- 消除 raw `.env` read/write 作为主配置路径。
- 修复 secret mask 不完整和 arbitrary key write 风险。
- 将普通用户路径改为 CatsCo 托管模型状态，自定义模型放 Advanced。

范围：
- 新增 settings schema / API。
- secret presence-only。
- dotenv-safe writer。
- 写后刷新 effective config。
- Dashboard 增加 Model Source 区域。
- raw `.env` editor 保留在 Diagnostics/Advanced，默认不加载。

测试：
- secret 不出现在 `GET /api/settings`。
- 不允许 unknown setting id。
- newline value 不会注入额外 env line。
- keep / replace / clear 正确。
- save 后 status/runtime summary 使用新配置。

### Slice B - Service Preflight And Readiness API

当前状态：后端最小闭环已实现，Home UI 尚未接入。

目标：
- 启动前返回明确 blocking checks。
- Home 能展示“差哪一步”。

范围：
- `GET /api/readiness`。
- `POST /api/services/:name/preflight`。
- `start` 默认 preflight。
- 只做本地同步检查，不做自动网络探测。
- `restart` 同样先 preflight。
- `cats/setup` 完成绑定后只在 preflight 通过时自动启动 connector。

### Slice C - CatsCo Chat State Machine UI

当前状态：第一版 UI 完成。

目标：
- 把 Chat 页从控件堆叠改成状态机入口。
- 让用户先看到下一步：模型来源、CatsCo 登录、agent 绑定、connector 启动或直接对话。
- 保留 webapp chat 定位，不新增独立本地 chat。

范围：
- 增加 Chat readiness banner 和 checklist。
- 连接详情、endpoint、topic/raw status 默认折叠。
- 未 ready 时禁用消息输入并阻止发送。
- 使用现有 `/api/readiness` 和 `/api/cats/status`，不新增后端 API。

不做：
- 不重写 CatsCo webapp 后端。
- 不实现本地独立 chat。
- 不改电子宠物 UI 或 skill 管理 API。
- preflight 与实际启动兼容：读取 `.env` / `process.env`，并兼容旧 `~/.xiaoba/config.json` effective config；响应仍只返回 presence/status。

测试：
- 缺 model key 时 blocked。
- CatsCo 已绑定但 service stopped 时 warning/ready with action。
- Feishu/Weixin 缺字段时 blocked。
- start 遇到 blocked 不 spawn。
- normal readiness/preflight response 不包含 secret 或本地 runtime root path。
- Runtime Profile validation 不回显原始非法值。

### Slice C - Home Readiness UI

当前状态：第一版 UI 已实现，等待 live Dashboard 重启后验证真实 `/api/readiness` 数据。

目标：
- 运行首页从 service console 改成 startup dashboard。

范围：
- 顶部 readiness cards。
- 主 CTA 根据状态跳 Settings / CatsCo / Start。
- Service details 折叠。
- Version/Host/Skills Path 移到 Diagnostics。
- `/api/readiness` 不可用时显示产品化 fallback，不暴露 JSON parse 细节。

测试：
- Dashboard HTML/static tests。
- Live smoke：访问 `http://localhost:3800/`，确认 readiness cards 与 `/api/readiness` 一致。

### Slice D - CatsCo Checklist

目标：
- Chat 页面和启动状态联动。

范围：
- Account / binding / connector / chat 四步状态。
- Home CTA 可跳转到未完成步骤。
- 保留 endpoint Advanced。

测试：
- status fixture tests。
- UI smoke。

### Slice E - Skill Hub / Companion Boundary

目标：
- 让 Skills tab 成为能力 hub。
- Companion 不再拥有 skill 写操作。

范围：
- Companion skill cards 只读。
- Skill Hub 显示 installed inventory。
- Store/GitHub install 放 Discover。
- destructive operations 显式确认。
- localStorage growth stats 标记 pending 或隐藏。

测试：
- Skill Hub render tests。
- Delete/disable/enable confirmation tests。
- Companion no mutation action static test。

### Slice F - Diagnostics Cleanup

目标：
- 把开发/调试信息收束到一个明确区域。

范围：
- version、host、node、platform、paths、system prompt、logs、raw env、pet frame debug。
- 不默认读取 raw env / prompt text。

测试：
- diagnostics endpoint excludes secrets。
- normal readiness/settings endpoint excludes paths/prompt text。

## Risk Controls

- 每个 slice 只改一个边界：settings、preflight、home UI、CatsCo checklist、Skill Hub、Diagnostics。
- 每个 slice 有模块化测试。
- 每个关键实现后用独立只读 reviewer 检查。
- 不触碰并行 pet assets，除非 slice E 明确处理。
- 不 stage untracked parallel work。
- 不直接 commit/push，除非用户明确要求。
