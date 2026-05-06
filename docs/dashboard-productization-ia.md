# Dashboard Productization IA

日期：2026-05-04

## 结论

当前 Dashboard 的主要问题不是缺功能，而是信息架构还停留在开发期：服务、状态、CatsCo webapp 登录、聊天窗口、Runtime Profile、原始 `.env`、skills、store、更新中心、日志弹窗、电子宠物状态都被堆到同一个单页里，用户很难判断“我现在要完成什么任务”。

2026-05-04 live Dashboard 复查后，Stage 2 的优先级进一步收紧：先处理 settings / preflight / readiness 的产品和 API 边界，再继续做首页视觉和 Runtime Profile 细节。详细执行计划见 `docs/dashboard-operations-rework-plan.md`。

Stage 2 的核心不是做一层视觉美化，而是把 Dashboard 从功能堆叠整理成面向本地 agent 运营的工作台：

- 连接：让 CatsCo webapp / Feishu / Weixin connector 是否可用一眼清楚。
- 配置：让 Runtime Profile 的真实来源、最终生效配置、保存影响范围清楚。
- 观察：让服务状态、最近错误、日志入口和上传状态清楚。
- 扩展：让 skills 是能力清单和后续管理入口，而不是混在宠物或 store 里。
- 陪伴：让电子宠物表达 agent 活动，不持有 runtime 规则。

## 当前页面盘点

当前 `dashboard/index.html` 有五个主页面：

- `services`：展示 managed services 和基础状态。
- `companion`：电子宠物、工作过程、解锁预告、宠物能力。
- `chat`：CatsCo webapp 登录、bot 绑定、本地服务启动、聊天窗口。
- `config`：Runtime Config snapshot、Runtime Profile editor、原始 `.env` 配置。
- `store`：skill install/store。

当前横切元素：

- sidebar footer：在线状态、platform、node、更新按钮。
- floating pet：全局活动状态与工作过程面板。
- logs modal：service logs 和微信二维码共用。
- update modal：更新检查、下载、安装。

## 当前问题

### 1. 用户任务和系统对象混在一起

`services` 页面按进程列服务，`chat` 页面又会启动 CatsCo service，`config` 页面又展示 runtime snapshot。用户如果想“让 CatsCo 本地 agent 跑起来”，需要理解 service、connector、profile、env、chat 的关系，路径太工程化。

### 2. Runtime Profile 和原始 `.env` 同页并列，主次不清楚

Runtime Profile 是受控配置链路，但下面紧跟原始 env 编辑区域。用户容易误以为两者是同等推荐入口，也容易误会 Dashboard 是完整配置真相源。

### 3. Runtime Profile 编辑器缺少产品语义

已有 preview / save / rollback 能力，但 UI 还像表单调试面板：

- profile 文件不存在时没有清楚的“当前使用默认配置，保存会创建 profile 文件”引导。
- save / preview / rollback 的影响范围不够突出。
- validation issues、unsafe existing profile、rollback unavailable 没有按用户可理解的状态分层。
- “保存后新 session 生效”有提示，但不像主约束。

### 4. Companion UI 和 Skill Management 边界容易混

伙伴页显示“宠物能力”，但它现在直接消费 `/api/skills-all` 并显示启用/禁用/删除按钮。长期看，电子宠物应该消费 read-only skill/stats，不应持有 skill 操作逻辑；skill 管理需要独立的确认、错误反馈和测试。

### 5. Chat 页面仍有旧命名和多重责任

Chat 页面同时处理 CatsCo account login、bot setup、service start、message window 和高级 endpoint 设置；这可以保留，但文案和布局要更像“连接 CatsCo webapp”，而不是开发期 connector 调试页。

### 6. Developer/debug controls 暴露在产品路径里

宠物状态手动切换、frame strip、原始 system prompt、原始 env groups、service raw logs 都有价值，但应该作为 debug / advanced / diagnostics，而不是默认任务路径。

## 目标信息架构

Stage 2 先不大拆文件，不引入前端框架，只在现有单页上整理任务层级。

建议目标导航：

1. **Home / 运行**
   - 本地 agent 是否可用。
   - CatsCo webapp connector、Feishu、Weixin 的状态。
   - 最近错误、日志入口、更新状态。
   - Companion 只作为轻量状态提示。

2. **Chat / CatsCo**
   - CatsCo webapp 登录和连接。
   - Bot 绑定、本地 connector 状态。
   - Chat window。
   - 高级 endpoint 设置折叠。

3. **Companion**
   - 宠物状态、工作过程、等级/解锁。
   - 只读能力卡片和占位成长统计。
   - 不提供 skill 安装、删除、启停。
   - 手动状态切换和 frame strip 放到 debug 区或后续隐藏。

4. **Settings / Runtime Profile**
   - 运行中有效配置。
   - profile 文件状态。
   - validation / config issues。
   - 受控字段编辑、preview、save、rollback。
   - 原始 `.env` 作为 Advanced 区域，不作为推荐入口。

5. **Skills**
   - 当前 installed skills inventory。
   - user-invocable / auto-invocable / enabled / load error。
   - 安装/删除/启停属于后续 Skill Management 阶段，必须显式确认。

## Stage 2 实现边界

本阶段做：

- Runtime Profile 配置页产品化。
- Dashboard 页面标签和任务层级清理。
- CatsCo 命名在 Dashboard UI 中继续收敛。
- Companion 与 Dashboard 的信息架构对齐。
- 把危险或开发调试型入口降级为 Advanced / Diagnostics。

本阶段不做：

- 不实现完整 Skill Management。
- 不把 Companion 接入真实 log analyzer。
- 不让 Companion 修改 skill 或 runtime profile。
- 不直接编辑完整 system prompt 大文本。
- 不把 Dashboard 变成 `.env` 或 secret 的主要配置入口。
- 不做复杂多 profile、多租户、权限系统。

## 推荐切片

### Slice 2.1 - Dashboard IA 文案和入口整理

当前状态：已开始落地。Dashboard 主导航、CatsCo 文案、Settings / Runtime Profile 主入口、原始 `.env` Advanced 降级和保存确认已完成第一版；尚未迁移 Companion 的 skill 操作。

目标：
- 把 Dashboard 当前页面从功能堆叠改成任务导向。
- 不改 API 行为。
- 避免和电子宠物并行 UI 大范围冲突。

范围：
- sidebar brand 从 XiaoBa TEST 收敛为 CatsCo。
- `services` 命名为运行 / Operations。
- `chat` 命名为 CatsCo Chat 或 CatsCo。
- `config` 命名为 Runtime Profile / Settings。
- `store` 暂改为 Skills，避免 marketplace 预期。
- Chat 页面旧 CatsCompany/XiaoBa 文案改 CatsCo。

测试：
- Browser smoke 检查页面可加载，导航可切换。
- `npm run build`。

### Slice 2.2A - Model & Key Setup / Typed Settings

目标：
- 把模型和密钥设置做成用户主路径。
- 不再把 raw `.env` 作为推荐配置入口。
- 不让 secret 值在 Dashboard 中 round-trip。

范围：
- 新增 typed settings API。
- secret 只返回 presence / replace / clear 状态。
- API 写入只接受 allowlisted setting ids。
- 写入后刷新 effective config，避免 Dashboard 显示 stale provider/model。
- Settings 页面增加 Model & Key Setup 区域。

测试：
- `tests/dashboard-settings-api.test.ts`
- secret 不出现在 API response。
- unknown key / newline injection 被拒绝。
- keep / replace / clear 行为正确。

### Slice 2.2B - Service Preflight / Readiness

当前状态：后端最小闭环已实现，Home UI 尚未接入。

目标：
- 启动前清楚提示缺少哪些必要配置。
- Home 页面能展示“能否启动”和“差哪一步”。

范围：
- 新增 readiness summary API。
- 新增 service preflight API。
- `start` 默认先跑 preflight，blocking 时不 spawn。
- `restart` 默认先跑 preflight。
- 不做自动网络验证；网络测试作为显式按钮。
- `cats/setup` 自动启动 connector 前同样看 preflight。
- 兼容旧 user config 作为实际启动配置来源，但 response 不返回 secret 值。

测试：
- `tests/dashboard-readiness.test.ts`
- 缺 model key、缺 Feishu secret、缺 Weixin token、CatsCo 未绑定等 fixture。
- API response 不泄漏 secret 或本地 runtime root path。
- Runtime Profile validation 不回显非法 tool 原值。

### Slice 2.2C - Home Readiness UI

当前状态：第一版 UI 已实现。

目标：
- 让运行页第一屏回答“现在能不能启动/使用 CatsCo，如果不能差哪一步”。
- 把 Version / Host / Skills Path 从主信息降级到 Diagnostics。

范围：
- `run-summary` 顶部启动状态。
- `readiness-grid` 展示模型与密钥、CatsCo Chat、Runtime Profile、Skills 四个区块。
- Service details 保留为 connector 细节区。
- Diagnostics 折叠展示 version / host / paths / model 诊断信息。
- start/restart 被 preflight 阻断时，UI 显示阻断原因。

测试：
- `tests/dashboard-productization-html.test.ts`
- Playwright live smoke 验证页面结构可加载。
- 当前 3800 进程未重启时，UI 应显示 Readiness API fallback。

### Slice 2.2 - Runtime Profile 状态分层

当前状态：后置。live Dashboard 复查发现 key/model setup 和 service preflight 更基础；在 typed settings 与 readiness API 完成前，不继续扩大 Runtime Profile UI。

目标：
- 配置页优先解释“当前生效配置”和“profile 文件状态”。
- 让 profile missing / loaded / invalid / rollback unavailable 都有明确状态。

范围：
- Runtime Profile summary：source、path、exists、loaded、issues、effective surface/cwd/model/tools/skills。
- 主提示：保存后只影响新 session。
- issues 分为 blocking / warning / info 视觉层级。
- rollback 按可用性禁用按钮。

测试：
- Dashboard render smoke。
- `tests/dashboard-runtime-config.test.ts`
- `tests/dashboard-runtime-profile-api.test.ts`

### Slice 2.3 - Profile 编辑器可理解化

目标：
- 让 preview / save / rollback 成为清楚流程，而不是裸按钮。

范围：
- Preview 结果按字段 diff 展示。
- Save 前显示影响范围。
- Save 成功后提示“新 session 生效”。
- Rollback 无状态时不显示或禁用。
- Unsafe existing profile 显示成明确错误，不写 sidecar。

测试：
- `tests/runtime-profile-editor.test.ts`
- API tests。
- Browser smoke。

### Slice 2.4 - Companion/Skills 临时边界整理

目标：
- 电子宠物继续可见，但不抢 skill management 所有权。

范围：
- 伙伴页“宠物能力”改成只读能力/成长占位。
- 禁用/删除 skill 操作迁出伙伴页，后续放 Skills 管理页。
- 继续使用 mock/localStorage 统计，不接真实 log analyzer。

测试：
- Browser smoke。
- 不新增 runtime 逻辑。

## 后续接入点

- Stage 3 Skill Management 稳定后，Companion 从 skill inventory/stats API 读取只读能力状态。
- Stage 4 Unified Logs 稳定后，Companion 从 log analysis summary 读取 XP、skill call count、failure rate、recent work process。
- Subagent Management 稳定后，Companion 可以展示 long-running task progress，但 status 仍应来自 transient task registry，不写 durable transcript。
