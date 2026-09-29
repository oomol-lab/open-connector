# SaaS Project 作为远端连接与执行来源

状态：实施中。2026-09-29 按确认调整为普通 SaaS project 客户端，不引入 Connect 专属的远端账号生命周期；下文标为新增或扩展的契约仍需按实施计划交付。

日期：2026-09-28

涉及项目：OpenConnector（本仓库，以下简称 Connect）与 OOMOL Connector SaaS（以下简称 SaaS）。

源码依据：Connect `70a6f7797122d3dfb711eb9bfa2c3c9d643a0769`；SaaS `068bd1212b60ed8dc405941b933191e024d7ac74`。SaaS 核查路径为 `/Users/su/oomol/oomol-connector`。本文是跨仓库契约的评审入口，双方实现 PR 引用本文版本和对端实现 commit，契约测试随对应模块维护；首版不建立独立 fixture 发布、版本或跨仓库内容摘要校验机制。后续源码变更需重新核对现状。

## 1. 目标与确定的执行边界

Connect 管理员绑定一个 SaaS project，为 provider 选择该 project 中的 OAuth 配置。用户在 SaaS 完成账号授权后，Connect 保存一个可按本地 ID 和 alias 使用的远端连接。通过这个连接调用 action 或 proxy 时，由 SaaS 读取凭证、刷新 token、执行 provider 并返回结果。

| 连接来源                   | 授权和凭证归属   | Provider 执行位置 |
| -------------------------- | ---------------- | ----------------- |
| 本地自建连接               | Connect          | Connect           |
| 本方案的 SaaS project 连接 | SaaS             | OOMOL Connector   |
| 已有 Marketplace 虚拟连接  | Marketplace 服务 | Marketplace 服务  |

执行位置由最终选中的连接决定，不由 service 的当前默认授权配置决定。SaaS 失败时不得换用本地账号或 Marketplace 自动执行，反之亦然。

Connect 不取得第三方 access token、refresh token、client secret 或 providerSecret，不加载本地 provider executor 来执行 project 连接，不进行本地 OAuth token 刷新。SaaS provider 执行逻辑继续只有原有 owner。

### 1.1 选择此方案的原因与代价

用户目标是复用 SaaS project 的 OAuth 应用和用户账号，并没有要求具体 provider 请求必须从本地发出。SaaS 已有 connected-account action/proxy 执行接口，应直接利用。

本方案不需要 token 输出权限、access-token 接口、本地 token 缓存、五分钟复核或跨系统 token metadata 适配。仍然需要 project 配置、本地连接引用、授权结果同步、远端执行适配和本地删除待办。SaaS 只拥有普通 project 请求、账号及凭证，不维护 Connect 本地连接是否已接收账号的状态。

明确接受的代价：业务输入和输出经过 SaaS，第三方请求使用 SaaS 网络出口，每次执行依赖 SaaS 可用性。计量和额度遵循 SaaS 实际契约，不承诺免费、不计量或更低延迟。仅存在本地的 action、只能由本地访问的文件路径和私网资源，不自动成为远端执行能力。

### 1.2 与 Marketplace 的关系

默认 Marketplace discovery 在 `https://connector.oomol.com`，但同 host 不代表同一凭证。现有 SaaS Marketplace controller 使用 user/service-account/Team principal 链路，托管 provider 凭证配置为 API key；SaaS project 通过 `oo_proj` project key 识别 project，选择其外部用户账号。

首版分别标明“Marketplace 执行凭证”和“Project API key”，不按 origin 合并、复制或交替尝试 key。若网关未来明确提供统一身份，再按实际权限统一凭证引用。

复用 Marketplace 的远端执行接入模式、外部 HTTP 请求与基础信封解析；保留各自的配置身份、账号选择、发现协议和错误语义。Project 连接是持久化的用户账号连接，不伪装成一个无账号的 Marketplace 虚拟连接。

## 2. 范围与现有基础

首版支持一个 Connect 逻辑部署绑定一个 SaaS project；支持多个 provider config、多个 OAuth 账号、新建与重连、删除、action 和符合双方代理契约的 proxy。支持 SQLite、PostgreSQL、D1，以及 Console 和程序化连接管理。

不包含多 project 路由、普通用户各自配置 project、自动导入既有 SaaS 账号、自动迁移本地连接、项目 API-key/custom-credential 连接创建、任意第三方远端执行插件。首版以 Gmail 验证完整 OAuth/action 链路，proxy 使用实际支持代理的 OAuth provider 验证，不假设全部 provider 均可用。

Connect 现有 owner：

- `src/marketplace/marketplace-service.ts`：外部托管服务配置、secret codec、发现、健康状态及 action 请求。
- `src/connection-service.ts`、`src/server/actions/action-runner.ts`、`src/server/proxy/proxy-runner.ts`：连接选择、访问策略和执行分发。
- `src/oauth/oauth-flow-service.ts`、`src/server/storage/connection-request-store.ts`：授权入口、请求结果、事务与 revision 检查。
- `src/server/api/runtime-api.ts`：公共响应序列化。
- `web/src/marketplace-page.tsx`、`web/src/oauth-apps-page.tsx`：现有配置交互。

SaaS 已有接口：

| 接口                                          | 现有用途                                 |
| --------------------------------------------- | ---------------------------------------- |
| `POST /v1/saas/connected-accounts/link`       | 通过 project key 创建 OAuth 授权请求     |
| `GET /v1/saas/connection-requests/:id`        | 查询授权状态和 connectedAccountId        |
| `GET /v1/saas/connected-accounts/:id/profile` | 取得账号 profile，可能涉及凭证解析及刷新 |
| `POST /v1/saas/actions/:actionId`             | 使用选定账号执行 action                  |
| `POST /v1/saas/proxy/:service`                | 使用选定账号执行 proxy                   |

源码位置为 SaaS 的 `src/saas/controller.ts`、`service.ts`、`runtime-connect-service.ts`、`schema.ts`。管理端已有账号删除；project key 的配置发现、只读账号摘要和通用账号删除入口仍需补充。新增入口复用普通账号 owner，不引入 Connect 专属协议。

## 3. 数据归属与类型边界

| 数据                                              | Owner / Connect 保存内容                           |
| ------------------------------------------------- | -------------------------------------------------- |
| 第三方 OAuth 应用配置、token、签名材料            | 全部由 SaaS 保存和使用                             |
| Project API key                                   | Connect 按现有 secret codec 加密保存，仅服务端使用 |
| 实例身份                                          | Connect 数据库唯一事实源                           |
| 本地连接 ID、alias、comment、revision、访问策略   | Connect                                            |
| SaaS 账号及其真实授权权限                         | SaaS                                               |
| 远端账号引用与本地展示摘要                        | Connect 保存绑定引用和非敏感摘要，不作为执行凭证   |
| Action/proxy 执行与计量、action 声明式 scope 检查 | SaaS                                               |
| 本地请求授权、输入校验、执行审计                  | Connect，执行前完成                                |

存储的连接应以明确的 local / saas 来源区分。SaaS 引用包含 `managedProjectId`、`projectId`、`providerConfigId`、`connectedAccountId`、`externalUserId` 和创建它的 `localRequestId`。业务授权类型仍为 oauth2，来源摘要另行表达，不能填假的 accessToken 以适配本地 credential 类型。

执行目标在共享分发层明确区分 local、marketplace、saas，具体判别类型复用现有结构；不继续堆叠可能同时为真的布尔值。Provider executor 不感知 project，也不增加 provider 目录下的通用转发实现。

## 4. Project 配置和实例身份

### 4.1 Project 绑定

保存 `managedProjectId`、`baseUrl`、从 key 验证得到的 `projectId`、加密 `projectApiKey`。managedProjectId 是本地绑定 ID，projectId 是 SaaS 身份，service 的 oauthSource 是默认来源选择，三者不混用。

同一绑定可轮换同 project key；baseUrl/projectId 不能原地切换到其他来源。轮换不改变连接 revision；已发出的执行请求不透明重试。service 默认来源、连接、pending 授权或远端待办仍引用的 project 不可删除。删除前须显式将引用它的 service 默认来源切回 local，不自动切换。引用检查与删除、并发设置默认来源必须通过同一事务/锁边界保证不产生悬空引用。更换 project 需先解除关联并处理远端清理。

复用 configured 与健康状态分离的语义：配置保留时 configured 为 true；远端 status 区分 available、unavailable、auth_error。故障不伪装成未配置。首版没有独立 enabled 开关，不复制 Marketplace 的全部状态机。

### 4.2 Instance ID

首次需要时，在实例级数据库配置中原子插入 UUID 并读取最终值；多副本竞争时不得使用各自未入库的候选值。

```text
externalUserId = "open-connector:" + instanceId
```

数据库是唯一事实源，不提供环境变量覆盖或在线修改入口。一个逻辑部署对应一个 external user，进程、副本和 runtime token 不分别创建用户。Project key 才是鉴权凭证，external user ID 不是安全隔离边界。

重启、升级、同数据库多副本、同部署备份恢复、API key 轮换及 project 重新绑定都保持 instanceId。独立数据库初次部署生成不同 ID；同 project 下的独立部署因此有不同外部用户。

SQLite/PostgreSQL 新增离线维护命令 `node scripts/runtime-data.ts reset-instance --yes`。所有使用目标数据库的 Connect 副本必须停止服务；命令展示受影响记录数量，在一个事务内清除 SaaS 连接、SaaS 授权请求、service 的 saas 绑定、project 配置及待处理远端操作，生成新 instanceId。保留本地自有连接和 Marketplace 配置；失败完整回滚，不发送任何远端删除请求。现有 Node 脚本不能操作 D1，D1 使用 §10.3 的独立维护入口，不能只给 store 加方法就宣称命令支持 D1。

该命令用于从数据库副本建立独立部署。恢复原部署不要执行。克隆后仅改变 ID 不会让旧的远端账号引用独立，因此身份和相关数据必须一起处理。系统不能自动识别恢复与克隆；遗漏此操作仍可能共享账号。正常删除/退役应通过在线清理流程，不能使用 reset-instance 替代。

### 4.3 管理接口与模式

| 新增管理员接口                                    | 行为                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| `GET /api/oauth/managed-project`                  | project 摘要、健康状态、清理积压，不返回 key                     |
| `PUT /api/oauth/managed-project`                  | 输入 baseUrl/projectApiKey，验证成功后绑定或轮换                 |
| `DELETE /api/oauth/managed-project`               | 无 service 默认来源、连接、请求和待办引用时删除                  |
| `GET /api/oauth/managed-project/provider-configs` | 查询 project 可用 OAuth 配置及远端执行能力                       |
| `GET /api/oauth/sources/:service`                 | 读回新连接默认来源                                               |
| `PUT /api/oauth/sources/:service`                 | 保存 `{ mode: "local" }` 或 `{ mode: "saas", providerConfigId }` |

mode 决定新建连接的授权路径。已有连接及重连使用其原有来源，不能因修改默认值改变执行位置。不采用本地未配置就静默使用 SaaS 的 fallback。

## 5. SaaS 发现与账号契约

### 5.1 配置和执行能力发现（新增）

新增 `GET /v1/saas/oauth/provider-configs`，使用 project key，返回所属 projectId、未删除且实际可授权的 OAuth provider config 摘要。每项包含 id、service、displayName、callbackUrl、effectiveScopes，以及该 service 的远端 action ID 集合和 proxy 是否可用。远端能力来自 SaaS 既有 catalog/执行能力 owner，不手写第二份 registry。

发现响应为 `{ projectId, providerConfigs }`，每项能力字段为 `actionIds` 和 `proxyAvailable`。effectiveScopes 复用授权准备结果；旧 provider 未提供该结果时读取其生成授权 URL 的标准 scope 参数。无法从这两处确认的 scope 不做推断，空数组不能被视为所有权限可用。

不增加 localExecutionEnabled、token-export 权限或 access-token 接口。Project key 的既有执行授权继续由 SaaS 检查。

全局本地 catalog 保持完整；本地 catalog 与远端 action 的交集仅用于指定 SaaS 来源/连接的能力展示和执行检查。未选择连接的 action 列表不因绑定 SaaS 而删除本地可执行能力，远端也不能借发现数据加载任意本地代码。选中连接后再检查该来源是否支持 action；proxy 能力同样按来源判断。ID 相同不保证 schema 相同；双方均校验输入。远端 schema 不兼容时明确报错，不换成本地执行、不静默删改字段。上线样本验证双方动作 schema；远端能力变更可通过显式刷新和重新读取配置更新，未知 action 不自动重放。

选择 config 时校验 service、authType、可用性，并预检 effectiveScopes 覆盖本地 UI 声明的必选原生授权项。SaaS 在授权和每次执行时验证实际权限，Connect 的 scope 摘要不能授权原本被 SaaS 拒绝的 action。首版 scopes/extra/secretExtra 在 SaaS config 上管理，不允许按次覆盖。

这里的 action scope 检查指 SaaS 既有 requiredScopes 校验。现有 SaaS proxy 传入的 requiredScopes 为空，不提供同等的 action 声明式 scope 闸门；它仍执行账号/代理访问控制，第三方 API 负责检查 token 实际权限。本方案不改变这一区别，不将 proxy 能力展示成“已预先验证所有 endpoint scopes”。

### 5.2 只读账号摘要（新增）

新增 project-key 鉴权的 `GET /v1/saas/connected-accounts/:id`，返回 projectId、providerConfigId、service、externalUserId、connectedAccountId、状态、账号 label/ID、非敏感 scope 摘要。先按 project 查询，跨 project 与不存在统一未找到，不返回 credential 或任意原始 metadata。

响应字段固定为 projectId、providerConfigId、service、externalUserId、connectedAccountId、alias、status、providerAccountId、accountLabel、scopes。scopes 是持久化 app scope 展示值，不代表新一次 token 验证或刷新结果。

该端点只读取持久化绑定、状态和展示字段：不得调用 provider profile、OAuth credential resolver 或 token refresh，不得触发上游网络请求或修改账号状态。不能通过复用现有 profile 服务实现这个摘要接口。摘要陈旧不自动刷新，实际执行可用性由后续业务调用确定。

Connect 完成授权时核对全部身份字段，而不是仅凭 profile 或浏览器回跳中的 account ID 建立关联。使用 strict schema 读取摘要，不直接展开远端对象进本地 credential、控制字段或 validation.metadata。远端 oauthClientConfig、client secret、token、providerSecret 等禁止字段视为协议错误，不能缓存或记录。

profile 接口按需使用；每次 action/proxy 不额外先查 profile，避免无意义的远端往返。非敏感展示摘要可保留上次结果，真实权限和可用性始终以本次 SaaS 执行为准。

## 6. 授权与连接请求

复用 SaaS link 和请求结果接口。Connect 始终传明确 providerConfigId、派生的 userId，不按 service 或“最新账号”隐式选择。

### 6.1 发起与入口规则

1. 在要求本地 client config 之前按来源分流，校验管理员权限和配置兼容性。
2. 生成不透明 localRequestId，预分配新本地 connection ID；重连记录原 ID/revision。持久化 owner、project/config/user 引用、return URI 和创建状态。本地请求 ID 沿用现有生成方式，不编码跨系统防重放时间窗口。
3. 调用 SaaS link，保存远端 request ID/授权地址后返回现有 connectionRequestId、authorizationUrl、stateHandle、status、expiresAt 字段。本地 stateHandle 仅为不透明关联标识，不接收第三方 code。
4. 第三方 callback 到 SaaS。Connect 回跳页仅触发鉴权结果查询，不相信 URL 中的成功状态。

调用普通 SaaS link，只传现有 providerConfigId、userId、alias、returnUri。每次授权尝试使用独立 alias，避免重连授权提前覆盖旧账号；alias 只用于账号区分，不是幂等键，也不代表已完成授权。SaaS 不接收本地 connection ID、project 绑定 ID 或额外生命周期对象。

现有 link 不保证跨请求幂等。Connect 在调用前持久化 creating，成功后保存远端 request ID；若请求结果不明或进程在保存前退出，不自动重新调用 link，也不宣称能够自动找回结果。向用户显示创建结果不明、需要检查 SaaS 账号列表并重新发起授权；可能留下的远端请求/账号按 §7 处理。通用 link 幂等若以后建设，应服务所有 project 客户端，不作为本次接入的前置条件。

SaaS 模式拒绝 authorizationOptionIds、extra、secretExtra、逐次 clientConfig。旧 `startAuthorization()` 路径在默认 saas 时返回 invalid_input，提示使用带 connectionRequestId 的 `/v1/connections/:service/connect`；local 模式保留原 SDK/自有 client 行为。Console 和 Gmail SDK 文档分别说明入口。

#### 两层回跳 URI

启用 SaaS 来源和发起授权前，必须具备显式配置并验证通过的 Connect 公共 HTTP(S) origin；缺失或非法时返回可操作的配置错误。Node 和 Workers 均不能以请求 URL、Host 或转发头补足该配置。Workers 必须设置 `OOMOL_CONNECT_ORIGIN`，现有 `resolvePublicOrigin()` 的请求 URL fallback 不满足此条件。完成页 URL 构造与同步 POST 的 Origin 校验共用这一可信配置；反向代理部署配置对外 origin，scheduled 初始化不依赖 HTTP 请求推导 origin。

用户提交的 `returnUri` 按 Connect 既有规则允许 http、https、oomol，验证后只保存在本地 pending 请求，不直接传给 SaaS。传给 SaaS link 的 returnUri 固定由 Connect 配置的 HTTP(S) origin 构造为 `/oauth/saas/complete?request=<localRequestId>`；不能使用未经验证的 Host 头或用户指定 origin。SaaS 只接受 HTTP(S)，因此 oomol 自定义 scheme 只用于本地完成后的最终回跳。

完成页中的 request 是不透明关联 ID，不是认证凭证。页面不相信 SaaS 附加的 status/service 等结果参数，不向未认证访问者暴露账号摘要或存储的最终 returnUri；有有效 Console 会话时，通过 §6.2 的同源受保护 POST 推进同步，再读取结果，只有本地 connected 后才按既有成功回跳参数跳转到存储的用户 returnUri。持久化失败终态可以携带安全失败信息回跳，临时故障保持等待/重试；没有最终 returnUri 时显示本地完成结果。

无浏览器会话的 SDK 流程在完成页仅提示回到发起客户端，不自动跳转成“成功”。由已认证 SDK 使用返回的 connectionRequestId 轮询，确认本地终态后再通知用户或处理其最终 returnUri。页面允许正常 Console 登录后继续，但不能将管理员 token、project key、owner token 或用户 returnUri 塞入 SaaS 回跳 URL。用户关闭完成页不影响已认证客户端继续查询。

### 6.2 查询与完成

同步服务与查询呈现分离，只有以下经过明确授权的入口可以调用同一个同步服务：

| 入口与认证                                               | 行为                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| `GET /v1/connection-requests/:id`，显式有效管理员 Bearer | SDK 兼容的查询并推进；校验 owner，可按下述规则创建本地连接                |
| 同一 GET，仅 Console cookie 或既有无认证本地模式         | 只读已持久化结果，不访问 SaaS、不创建连接                                 |
| 新增 `POST /api/oauth/connection-requests/:id/sync`      | Console 推进；校验管理员会话/既有本地管理权限及 owner，并执行下述同源保护 |

Console POST 要求 application/json、固定自定义请求头 `X-OpenConnector-Request: sync`，并严格验证 Origin 匹配可信配置中的 Connect origin；缺少或不匹配时拒绝，不从任意 Host 头构建允许值，不为此入口开放跨域带凭证 CORS。原有 SameSite=Strict cookie 继续保留，但不能用 SameSite 或幂等代替请求来源验证。无认证本地开发模式也执行同源保护；SDK 使用显式 Bearer 的 GET，不依赖浏览器 cookie 获得推进权限。无效 Bearer 不能回退到 cookie 并获得推进权限。

所有结果响应 private, no-store，推进按同一请求幂等。GET 的权限判定必须保留凭证来源，不能只看最后都映射成 local-admin 的 principal。OpenAPI、Console 和程序化文档明确区分只读 GET、Bearer 推进与 Console POST。首次 SaaS 回跳 GET 只加载完成页，不能自动在服务端推进授权。

同步依据持久化 kind/phase/status，不依据展示层派生的 expired。远端结果至少保留到请求过期后 24 小时；本地第 11 分钟首次查询仍可恢复此前已完成的授权。真正终态不再查询远端。

SaaS 现有 project 请求读取没有普通 app 请求相同的保留窗口过滤，普通 app 的 24 小时清理又排除了 project 请求；不能视作已经实现该契约。补充普通 project 请求的结果保留/有界清理：窗口内可查，窗口后可以回收结果。账号保留与请求结果 TTL 分开；清理请求不自动删除账号。Connect 在回收本地 pending 前保存已知远端 request/account 引用到清理待办。

内部 phase 为 creating、pending、completed，查询租约独立。按 `(localRequestId, owner)` 条件领取租约，不复用本地 OAuth 的 `claim(state)`。数据库保存 nextPollAt，正常最小查询间隔两秒，多副本租约与进程单飞共同避免重复；网络失败指数退避至 30 秒，遵守 Retry-After。高频 GET 返回已有快照，不每次访问 SaaS。

查询工作总预算 30 秒、租约 45 秒；超时/取消不永久失败请求，过期租约可恢复。已有远端 request ID 的 pending 状态查询 SaaS；结果不明的 creating 按 §6.1 显示恢复边界，不重发 link。取消、superseded 不能被晚到结果复活。

远端成功后，只需完成本地事务：

1. Connect 读取 §5.2 摘要，核对 project/config/user/service/account，并在 pending 请求中持久化候选 account ID；旧连接继续可用。
2. 本地事务检查请求 phase、租约版本和目标 revision，写入新引用和结果终态，同时记录旧账号删除待办。新建使用预分配 ID，重连保持 ID/alias；事务成功后才报告 connected。
3. 若目标已删除、替换或请求取消，记录候选账号删除待办，不能覆盖旧连接或复活连接。单纯租约丢失时停止写入，由后续工作者恢复，不能误删候选。

进程在取得结果后、本地提交前退出，可从远端 request ID 或持久化候选恢复。本地取消、supersede、保留到期和删除 payload 前，必须在同一事务先保存已知远端 request/account 清理引用；这一要求也覆盖 local OAuth 发起时触发的过期清理。异步写入匹配 localRequestId、候选 account ID 和目标 revision，晚到失败不能影响后续重连。

本地不验证或刷新第三方 token。读取远端摘要不修改已存在连接 revision；正常远端 action 也不更新连接 revision/updated_at，所以不会使重连快照因执行而失效。

## 7. 普通账号与 Connect 本地清理

SaaS OAuth 成功后，账号立即按普通 project 规则可用，不等待 Connect 确认接收。SaaS 不保存本地 connection ID，不增加 provisional/attached/released 状态、binding 表、tombstone、专属容量配额或账号自动回收任务。普通 OAuth 的事务一致性、callback 幂等和账号归属仍由既有 owner 负责，实际发现的通用缺陷在原 owner 修复。

Connect 使用独立 alias 创建账号，只对自身新建并通过请求结果核对的账号进行清理，不接管既有账号。新增普通 project-key 的 `DELETE /v1/saas/connected-accounts/:id`：providerConfigId 和 userId 放在必填 query 参数中；从 key 取得 project，核对 providerConfigId/userId/account 后，复用现有账号删除及无引用 app/credential 清理。跨 project 不得删除；不存在或已删除按安全的幂等结果处理。不自动调用第三方 revoke。响应为 `{ connectedAccountId, deleted: true }`；目标在当前 project 下不存在时也返回相同结果，不暴露其他 project 的账号是否存在。

- 本地删除立即阻止新的执行，并在同一事务记录账号删除待办。重连只在本地替换成功后记录旧账号删除待办；提交冲突仅清理候选。
- 待办记录已知 account ID，或尚未结束的远端 request ID。后者在结果保留窗口内继续查普通请求，成功后核对并删除账号，明确失败/过期则结束；不能把暂时错误当作没有账号。
- SaaS 没有请求取消协议；取消本地请求不保证阻止晚到 callback 创建账号。Connect 的后续查询可以清理已知请求产生的账号，但跨过结果保留窗口仍未取得结果时标记需人工检查，不假装清理成功。
- 待办通过数据库租约、有限批次和最多五分钟退避处理；key 失效暂停并提示修复。为未处理待办保留 project 配置。Node/Workers 接入持续调度，Console 可查看失败和重试。
- link 响应丢失且未保存远端 request ID、Connect 数据库永久丢失、或长期停机错过结果保留窗口时，接受可能留下远端账号。管理员通过普通 SaaS 账号列表按 externalUserId、provider config 和 alias 定位并删除；不承诺 SaaS 自动识别孤儿或自动回收。
- 不为本次接入新增 project 请求/账号配额，沿用 SaaS 普通 project 的限制与管理能力。独立克隆 reset-instance 不调用远端删除，避免误删原部署账号。

删除本地或远端账号不撤销已经发出的业务操作，不承诺跨系统 exactly-once 或无孤儿账号。

## 8. Action 和 proxy 远端执行

### 8.1 连接选择与本地策略

共享执行链先校验已有 runtime token/JWT 的 action/service 或 proxy 策略，解析选中连接的本地摘要，再按稳定本地 connection ID 校验 allowedConnections；所有检查都在远端请求之前完成。不能因 SaaS 连接不含本地 token 而跳过访问控制。

按现有 alias/default 选择规则解析本地记录；本方案不让 SaaS 连接天然优先于已有连接。不指定连接时仍遵循既有选择规则，账号有歧义时不选择远端“最新账号”。选中 saas 来源后直接进入远端执行分支，不加载本地 executor、credential validator 或 refresh service。

`ProxyRunner.run()` 当前在选择连接之前加载本地 proxy executor；加载返回 undefined 时是 501，加载抛异常时是 500。本次将加载及对应错误处理移到 local 分支。SaaS 分支使用该来源的 proxyAvailable 和协议校验，不以是否存在本地 executor 判断远端能力。Action 的来源能力检查也发生在选中连接之后，不能修改全局 catalog 来达成过滤。

本地校验已有 action 输入 schema；SaaS 再校验自己的 schema、配置、账号权限及 scope。兼容性失败显式返回，不降级执行。

### 8.2 Action 请求与结果

复用 `POST /v1/saas/actions/:actionId`，服务端携带 project key。请求体固定包含精确账号选择：

```json
{
  "providerConfigId": "provider-config-id",
  "userId": "open-connector:instance-uuid",
  "connectedAccountId": "connected-account-id",
  "input": { "example": "action input" }
}
```

不发送 alias/service 作为备选 selector，不把本地 runtime token、管理员 token 或连接秘密传给 SaaS。API key 从匹配的 managedProjectId 加载，不能通过 action input 覆盖。

现有 SaaS action 成功 data 是 `{ executionId, actionId, output }`。适配器核对 actionId 后将 `data.output` 转为本地 action output，不能照搬 Marketplace 的“整个 data 就是 output”解析。保留本地 executionId，并将 SaaS executionId 作为明确的远端关联字段进入执行日志和允许的响应 meta；两者不能互相覆盖。

### 8.3 Proxy 请求与结果

复用 `POST /v1/saas/proxy/:service`，传 providerConfigId、userId、connectedAccountId 和既有 `request` 结构。服务 URL只由已验证 baseUrl 和固定 API 路径构造，proxy 目标放在 JSON 请求内由 SaaS provider/egress 守卫处理。

SaaS proxy 响应的外层 `data` 是代理结果，executionId 位于 meta，与 action 信封不同；代理结果正文的字段也叫 `data`，不叫 body。不将外层 SaaS HTTP 200 当作第三方 HTTP 状态。

| 字段                       | SaaS 来源的首版映射和校验                                                            |
| -------------------------- | ------------------------------------------------------------------------------------ |
| request.endpoint           | 沿用既有 endpoint 字符串契约，由 SaaS 校验 provider 允许的目标                       |
| request.method             | 仅 GET、POST、PUT、PATCH、DELETE；HEAD 等其余值在发送前拒绝，本地分支原支持范围不变  |
| request.query              | 值仅为 string、有限 number、boolean 或 null；数组/对象在发送前拒绝，不自动 stringify |
| request.headers            | 值必须为 string，仍遵守现有非认证头限制；不强制转换其他类型                          |
| request.body               | 仅已有 JSON/文本请求可表达的值；不添加文件上传、流式或二进制编码协议                 |
| request.accessGrant        | 不接受也不转发；它属于 SaaS 受信工作负载输入，不能由这个公共适配器赋予               |
| 本地 response.status       | `envelope.data.status`                                                               |
| 本地 response.headers      | `envelope.data.headers`                                                              |
| 本地 response.data         | `envelope.data.data`                                                                 |
| 本地 response.bodyEncoding | 首版省略，不生成 base64 标记                                                         |
| 远端执行关联               | `envelope.meta.executionId`，不覆盖本地 ID                                           |

使用字段白名单构造 request，未知字段报 invalid_input，不能 spread 原请求对象。响应按上述 schema 验证后构造本地 ProxyResponse。

模块自动测试用代码构造序列化前出现 Infinity、-Infinity、NaN 的 query 值：Connect 必须拒绝，不能经 JSON.stringify 转成 null 后改变请求含义。当前 SaaS 安装的 Zod 4 `z.number()` 也拒绝这些值，不把该测试描述为修补 SaaS 允许 Infinity 的行为。

双方支持的序列化类型取交集。首版只承诺现有 SaaS JSON proxy 契约能无损表达的请求/响应，不承诺流式、任意二进制或本地文件句柄；不支持的输入执行前拒绝。不要自动上传本地路径或把临时本地 URL 当作 SaaS 可访问 URL。

沿用普通 SaaS proxy 的响应读取与序列化，不依据 Connect 来源增加响应分支。Connect 校验响应信封，并按返回的 Content-Type 拒绝明确不支持的二进制类型或 charset；但 SaaS 已经完成文本解码，因此不能承诺在 Connect 检测出被替换的非法原始字节。204/205 和空响应保持既有表示。首版只支持已有 JSON/text 场景；原始字节无损校验属于 SaaS 通用 proxy 能力的后续改进。

响应不支持或读取失败可能出现在第三方完成操作之后，不自动重试，不增加二进制编码协议。

### 8.4 失败、取消和可用性

每次执行都访问 SaaS；SaaS 不可用就失败，没有 token 缓存可继续执行，也没有定期五分钟复核。源健康状态用于展示，不能代替本次请求授权或在误判后永久阻止重试。

网络超时、响应丢失和取消可能发生在 SaaS 已执行之后。Connect 将取消信号传给访问 SaaS 的 HTTP 请求，中止等待并按本地语义报告。首版取消保证按执行路径区分：

- Action：只保证中止 Connect 对 SaaS 的等待，SaaS action 执行可能继续。现有共享 action 执行输入没有对应 signal 契约，本次不扩展其端到端取消能力。
- Proxy：SaaS project controller 将入站请求的 `c.req.raw.signal` 经 service 传给既有 proxy executor，复用已有取消/超时能力，使服务端已感知的取消传到支持中止的上游 fetch。不能仅中止 Connect 的等待而在 SaaS 中间层丢弃信号。

HTTP 断开不保证被 SaaS 运行时感知，取消也不保证撤销已经发生的第三方副作用。测试用受控 AbortSignal 分别验证 Connect 等待中止、SaaS proxy 入站已取消及在途取消传播，不将断开检测作为确定保证。首版不自动重试 action/proxy POST；本地幂等记录沿用既有行为，不能宣称它提供远端 exactly-once。跨网幂等需另行扩展 SaaS 契约，不能擅自添加未被服务端接受的字段。

区分本地管理认证、project key 失败、远端账号需重连、上游业务 401、配额/限流和 SaaS 网络故障。保留结构化业务错误，安全映射上游鉴权失败，不让本地用户误以为需要重新登录。

### 8.5 执行限制与首版边界

首版沿用 SaaS 现有执行限制与计量机制，不新增 project 级 action/proxy 速率或并发限制，也不将其作为 OpenConnector 接入的上线前置条件。Project 级执行限流作为 SaaS 独立治理工作后续设计，本次不扩展限流设施或引入分布式并发占用及恢复机制。

现有链路返回 429 时，Connect 保留明确业务错误和适用的 Retry-After，不自动重放 action/proxy。 SaaS 当前执行失败实际返回 `{ errorCode, errorMessage, executionId?, data? }`，Connect 按该契约解析，也识别标准失败信封；保留已知业务码和远端 ID，使用固定安全文案，不透传原始 errorMessage/data。错误适配可用受控响应测试，不要求先建成新的 project 限流设施。

明确接受的代价：本次接入不新增阻止失控调用或限制费用的保证，计量事件不等于实时执行保护或精确费用上限。授权查询的最小间隔、单飞、租约与退避，以及 Connect 本地删除待办仍属于首版；它们不提供 SaaS 账号容量或 action/proxy 限流保证。

## 9. Console、API 与错误

Console 显示“本地 OAuth”与“SaaS 托管连接”，连接详情明确执行位置和输入/输出经过 SaaS。Project URL/key 表单复用 Marketplace 已有可共用交互，凭证用途单独标注，不新增重复通用框架。

新增可选 oauthSource 摘要，mode 为 local/saas，saas 包含 managedProjectId/projectId/providerConfigId。连接列表用本地 ID/alias，账号 profile 为非敏感摘要；不得返回 key/token。

`/v1/providers/:service/setup` 保持既有嵌套 wire shape：`oauthClient.configured` 反映默认来源配置事实；saas 的 `oauthClient.expectedRedirectUri` 为 SaaS callback，`oauthClient.missingFields` 不要求本地应用 secret，`oauthClient.customClientAvailable` 为 false。不得把这四项移到顶层。local 模式维持现有能力判定；旧连接重连按原来源处理。source 模式提供独立 GET 读回。

| 情况                                | 行为                                                                |
| ----------------------------------- | ------------------------------------------------------------------- |
| Project key 无效/撤销               | oauth_source_unauthorized，提示管理员修复来源，不映射为本地登录 401 |
| SaaS 网络/服务故障                  | oauth_source_unavailable，不切换执行位置、不永久删除连接            |
| 请求/摘要身份不匹配                 | oauth_source_mismatch，拒绝绑定/执行                                |
| SaaS 账号明确失效                   | 连接呈现 reauth_required                                            |
| Action/schema/proxy 能力不兼容      | 明确能力或 invalid_input 错误，不执行替代动作                       |
| Proxy 返回明确不支持的媒体类型/编码 | 明确能力错误，不自动重试；原始字节校验受 SaaS 既有解码限制          |
| 授权完成时本地 revision 冲突        | 保持 request_key_conflict/请求替代语义                              |
| 本地连接被删除                      | connection_not_found                                                |
| 远端配额或限流                      | 保留明确业务代码/Retry-After，不自动重放业务请求                    |

更新 runtime-api.ts、OpenAPI、run-log-summary.ts 安全文案及 docs/runtime-api.md。错误码以既有等价语义优先，不透传含 secret 的原始错误体。源查询故障与用户账号失效分开，不因一次 5xx 将所有连接标为需重新授权。

## 10. HTTP、存储和部署

### 10.1 共享外部 HTTP owner

从 Marketplace 提取实际共用的请求、限长 JSON 读取及基础成功/失败信封模块，直接复用 providerFetch、assertPublicHttpUrl 和 DNS 校验。业务解析仍各自拥有：Marketplace data、SaaS action data.output、SaaS proxy data 是不同契约。

baseUrl 为公网 HTTPS，不含 user info/query/fragment。请求 `redirect: "manual"`，显式拒绝 300–399 并关闭 body；不能依赖 guarded fetch 的默认 follow，也不用 Workers 不支持的 redirect:error。Key 不随重定向发送，不设 skipDnsValidation/private-network 例外。

管理/发现 JSON 上限 4 MiB，包含解压后字节、无 Content-Length 和错误响应。Action/proxy 的响应上限必须按现有实际输出容量确定并在契约中公开；不能把 discovery 的 4 MiB 无声套用。Marketplace action 当前没有同样限长保证，共享提取不能偷偷改变其正常响应契约。所有读取覆盖超时与取消。

Marketplace action 响应限长列为独立后续工作，需单独评估已有输出容量、公开上限并做兼容性测试；本次提取共享客户端不默默承诺已经修复这项历史债务。

授权同步总工作预算 30 秒，租约 45 秒。Action/proxy 执行 POST 的首版预算为 300 秒，覆盖请求和响应读取，并接受调用方更早取消；执行前能力发现使用独立的 30 秒管理预算。不把授权同步预算强加给长耗时 action。执行响应 JSON（含错误响应、解压后字节）上限为 64 MiB；已用超过 4 MiB 的 action 输出和 10 MiB 文本最坏 JSON 转义约 60 MiB 的 proxy 输出验证。该边界参考 SaaS 现有 10 MiB proxy 覆盖和长耗时 provider 请求，不能承诺覆盖所有 provider 的无界输出，部署超时可能更短。

### 10.2 存储与维护

持久化 instance identity、managed project、service 默认来源、SaaS 连接引用、请求溯源/租约、远端操作待办。不新增 token 缓存或保存第三方 credential。

Project key 进入现有 secret codec。首版保存 SaaS 来源要求 codec.encrypted，提示使用现有加密设施；不改变 Marketplace 既有明文模式。请求/待办不重复存 key，日志只记录安全关联信息。

SQLite/PostgreSQL 已有 `rotateSecretCodec`。只要 managed project 配置仍存在，它们必须在任何轮换写入前拒绝非加密目标 codec，因此 `rotate-key --plain` 也会失败。校验放在 Node 维护契约/store 层，不能只在 CLI 拦截；检查与轮换处于同一事务/维护锁边界，避免并发新建 project 绕过。先按正常流程解除并删除 managed project，才能使用原有降级明文能力。加密 key 到另一加密 key 的轮换保持支持，失败不部分提交。

SQLite/D1 使用根 migrations，PostgreSQL 使用 migrations/postgresql，编号分别确定，更新 migration-source.test.ts。SQLite/PostgreSQL 的现有 resetRuntimeData、rotateSecretCodec、lock/事务清单覆盖新增数据及 project key；失败不能部分轮换。三库请求中的敏感 pending 字段沿用现有 codec。

Node 普通 runtime reset 保留 instanceId；reset-instance 显式改变身份。两者是离线本地维护，不发送远端删除请求；正常退役先在线完成账号删除待办；离线 reset 遗留的远端账号通过普通管理端清理。scripts/runtime-data.ts 更新 SQLite/PostgreSQL 操作和帮助，不宣称操作 D1。

D1 当前没有 Node 的完整密钥轮换/普通 reset 接口，本次不新增这些能力。首版 D1 提供 managed project 的加密保存和读取、正常在线连接管理，以及 §10.3 的 reset-instance；所有保存来源的入口都拒绝非加密 codec。直接修改或移除 Worker 加密密钥不是数据迁移，不能自动回退为明文，已有密文读取失败应阻止相关来源操作并提示恢复原密钥。D1 全库密钥轮换和普通 reset 独立后续设计，不写进本次验收；reset-instance 保留的本地连接和 Marketplace 仍可能依赖原加密密钥。

Connect 待办处理需要可持续调度，SaaS 普通 project 请求结果清理复用其后台入口。Node 多副本通过租约分配，Workers 使用定时入口；不把存在调度代码当作部署已启用。SaaS 的刷新仍复用原执行链，跨实例 Redis 刷新锁目前可选，多实例部署必须验证锁配置和轮换恢复，无需向 Connect 暴露这套实现。

### 10.3 D1 身份维护入口（新增）

D1 不通过 Node 的 createNodeRuntimeDatabase 路径。新增独立运维脚本入口 `node scripts/d1-runtime-data.ts reset-instance --config wrangler.local.jsonc --remote --yes`，仅用于已停止业务写入的目标 D1；命令与自动测试已实现，真实部署验证仍待用户验收。操作步骤见 `docs/saas-maintenance.md`。

脚本使用操作者已有 Cloudflare 部署授权，从指定配置读取 D1 database_id，部署一次性维护 Worker，通过与生产相同的 `DB` binding 调用 D1 store 的 resetInstance。维护 Worker 只暴露该操作，用脚本生成的一次性随机 bearer secret 认证，不复用 project key、不开放普通 Console 路由；结束后撤下 Worker 并删除临时 secret。数据库 ID、旧 instanceId 和影响数量在确认前明确显示，不能默认选择另一个环境。

执行前停用目标数据库所有业务 Worker 的 HTTP 写入、定时及队列消费者，等待在途工作结束；维护期间不得重新启动。维护 Worker 用一次原子 `DB.batch()` 执行清理与身份替换，和 SQLite/PostgreSQL 复用同一业务清理清单。不能为绕过限制拆成多个可部分提交的 batch；超限时完整失败并保留原身份。

选择维护 Worker 是为了直接使用 DB binding 的条件化原子 batch；不能用未经验证的多语句 `wrangler d1 execute` 替代该事务边界。不对 CLI 的所有用法作一般性判断，只要求任何替代方案证明同样的原子性、并发冲突和响应丢失恢复保证。

脚本在发送前持久化本次旧/新 instanceId，重试复用这一操作标识。Worker 只在当前 ID 等于预期旧值时执行；已经是本次新值则返回原成功结果，其他值返回冲突。不能因响应丢失重试而再次生成身份。完成验证后撤下维护 Worker、恢复正常部署与调度；Cloudflare 部署凭证只用于控制面，不能进入被重置的运行时数据库。

旧 ID 比较、每条清理语句和新 ID 写入必须在同一个 batch 中由 SQL 条件共同约束，不能依赖 batch 前的 Worker/JavaScript 读取判断。所有删除以当前 instanceId 等于预期旧值为条件，身份记录不在清理中途删除，新 ID 的条件更新放在清理之后；条件不匹配时整批零变更。两个不同新 ID 的并发操作只能有一个生效，另一个必须报告冲突；同一操作重试只读回成功结果，不再次删除数据。

该入口和所有后端一样不请求 SaaS、不执行待办，确保克隆重置不删除原部署的远端账号。文档需给出停用、执行、失败恢复和重新启用的完整操作步骤；未完成该入口及真实 D1 验证前，不能宣称 D1 支持 reset-instance。

### 10.4 部署与故障操作说明

- 数据库租约和过期判断依赖正常系统时间，部署保持时钟同步；不新增基于本地请求 ID 的跨系统时间窗口协议。
- SaaS 暂时故障时保留现有绑定和远端账号，检查来源健康、SaaS 服务、key、现有链路的 429 与额度；恢复后重试由调用方决定，写操作先核实远端是否已执行，不能自动重放。
- 长期需要本地执行时，另建本地连接：配置自己的 OAuth 应用并重新授权，验证只读及受控写操作，调整调用方的显式连接 selector 和 allowedConnections。验证切换后再决定是否删除旧 SaaS 连接；不先删旧连接，不迁移 SaaS token，不把更改 service 默认来源当成迁移已存在连接。两种来源可以同时保留以便手动切回。
- 远端清理失败时观察待办积压并修复 key/服务后重试；不要通过删除 project 配置或重置 instanceId 隐藏待办。独立克隆才走 reset-instance；恢复备份继续使用原身份。
- 部署检查覆盖 SaaS 现有限制、计量和 Connect 清理积压，并说明现有链路返回 429 时的排障入口。Project 级执行限流不属于本次部署依赖，不承诺计量事件能实时阻止失控调用。

## 11. 实现与消费者清单

| 位置                                                             | 必要变更                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Marketplace service / 共享 HTTP 模块                             | 提取请求与基础解析，保持各业务信封区别                                          |
| connection-service.ts / core types / connection store            | 明确远端引用、稳定 ID/alias、来源与本地 credential 分离                         |
| action-runner.ts / proxy-runner.ts                               | 策略之后按目标分发，远端分支不加载本地 provider                                 |
| OAuth flow / connection-request store                            | SaaS 分支在本地 client 校验前进入、按本地 ID 同步、已知请求恢复与事务完成       |
| runtime-api.ts / OpenAPI / 管理路由与认证边界                    | 来源读写、摘要、凭证来源判定、Bearer GET/同源 POST 同步、错误和远端 executionId |
| run-log-summary.ts                                               | 新错误安全文案与远端审计关联                                                    |
| oauth-apps-page.tsx / oauth-app-form.tsx / 连接流程              | 来源模式、远端执行提示、重连/清理状态                                           |
| 三套 store / 两套 migration 序列 / runtime-data.ts               | 三库来源/身份/请求/待办；Node reset/rotate/reset-instance，D1 不新增全库轮换    |
| 新增 d1-runtime-data.ts / 一次性维护 Worker / docs/cloudflare.md | D1 binding 维护入口、原子 batch、响应丢失重试、停服与恢复流程                   |
| docs/credentials.md、runtime-api.md、programmatic-connections.md | 凭证不出 SaaS、执行转发、账号选择、错误和轮询                                   |
| docs/marketplace.md、Gmail SDK、部署/恢复/Cloudflare 文档        | 两种远端来源区别、local-only clientConfig、调度与克隆操作                       |
| SaaS saas controller/service/store/schema、proxy 响应读取        | 普通 project 发现/摘要/删除、请求结果保留、精确账号归属与 proxy 取消透传        |

不修改 provider executor 来适配 project，不建立任意后端插件框架。SaaS 继续拥有 token、scope 和 provider 协议逻辑。双方 PR 以本文为共同契约，记录实现 commit，在对应模块补契约测试，避免复制两份独立演进的 spec。

## 12. 验收标准

1. 无本地 OAuth 应用也可完成 SaaS 授权；Connect 存储、API、日志均无第三方 token/client secret/providerSecret。
2. SaaS 连接的 action/proxy 在 OOMOL Connector 执行，本地 executor/validator/refresher 不被调用；本地自有连接和 Marketplace 保持原路径。
3. 本地 action/connection/proxy 访问策略在网络请求前生效；精确 config/user/account 选择，跨 project、错误 service/user/config 拒绝。
4. SaaS action 与 proxy 的不同信封正确解包，本地与远端 executionId 分开关联；错误状态、输出、scope_missing 和配额语义正确。
5. 断网、超时、取消、响应丢失不自动重放写操作，不切换账号；不声称远端副作用被撤销。受控信号验证 Connect 中止对 SaaS 的等待、SaaS project proxy 在入站已取消和在途取消时将信号传到 executor/可中止的 upstream fetch；action 本地取消后远端仍可能完成，首版不要求共享 action 执行链端到端中止，也不保证 HTTP 断开被 SaaS 感知。
6. 本地 action catalog 和远端能力不一致、schema 漂移、unsupported proxy body 均明确失败；不发送本地文件或秘密作为补救。
7. 高频/多副本查询遵守间隔和租约，只提交一次本地连接；第十一分钟可恢复远端已完成结果。已有远端请求/候选时可恢复；link 结果不明不自动重发，明确提示人工检查。
8. 重连保持本地 ID/alias，执行和查询不改 revision；删除或真正替换期间的晚到授权不覆盖/复活连接。
9. 删除、重连、取消和 local/SaaS 跨来源 supersede 在同一事务保存已知远端 request/account 删除待办。晚到结果不复活本地连接；普通账号删除失败可重试，未知结果和丢库明确提示人工清理。
10. 实例身份并发初始化唯一，重启/恢复/key 轮换稳定；独立克隆 reset-instance 原子清理且无远端副作用，失败回滚。
11. SSRF、DNS、重定向、超大/非法 JSON/普通 401 等边界有验证，日志不泄露 key 或原始敏感响应。
12. 所有授权入口和 customClientAvailable 一致，local SDK/自有 client、API key/custom credential、Marketplace 的正常行为通过回归测试。
13. 验证三库迁移、加密来源存储和 reset-instance，Node 密钥轮换/普通 reset，以及 D1 调度；D1 全库轮换/普通 reset 不属于本次范围。实际测量远端执行延迟和 action/proxy 大响应兼容性。
14. 候选账号通过身份核对后，在本地事务检查租约和 revision，再提交新引用及旧账号删除待办；提交失败保留旧连接，真正冲突只清理候选，租约丢失不误删候选。
15. SaaS 不增加 Connect 专属 binding 表、状态、接口、配额或回收任务。OAuth 成功即按普通账号规则可用；普通 callback 重复处理和账号归属检查保持原行为。
16. 绑定 SaaS 不裁剪全局本地 action；只有来源交集内 action 对该远端连接可用。无本地 proxy executor 但远端支持时能执行，HEAD、复杂 query/header、accessGrant 在发送前拒绝，data.data 正确解包。
17. SQLite/PostgreSQL 在有 managed project 时拒绝 plain codec 降级，所有密文保持原值；删除 project 后既有 plain 模式可用。D1 非加密配置不能保存来源，密钥缺失/错误时不得回退为明文或覆盖原密文。
18. D1 维护入口对错误 database/instance、重复请求、响应丢失和 batch 失败有独立验证；两个预期旧 ID 相同但新 ID 不同的并发 reset 恰好一个成功，另一个零变更并返回冲突。不部分删除、不重复生成身份、不请求 SaaS，完成后临时维护入口已移除。
19. HTTP(S)/oomol 最终 returnUri 仅保存在本地，SaaS 接收的是 Connect HTTP(S) 完成页；伪造回跳参数和无会话浏览器不能提前报告成功或读取最终 URI。Console 完成本地提交后回跳，SDK 无会话流程可由已认证轮询完成，不在 URL 携带鉴权 secret。缺失/非法可信 origin 时不能启用来源或发起授权；Workers 不接受请求 URL fallback，反向代理下完成页地址与同源校验均使用配置的公共 origin。
20. 沿用普通 SaaS proxy，Connect 拒绝响应中明确不支持的媒体类型/编码，空响应保持原表示；不宣称能检查 SaaS 已解码前的原始非法字节，响应错误不重放请求。
21. SaaS 新摘要接口即使 token 过期也只读取持久化数据，provider profile、credential resolver、refresh 和上游 fetch 调用数均为零，不修改账号状态。
22. 普通 SaaS project 请求结果保留至 expiresAt 后 24 小时，之后有界清理；不据此删除账号。Connect 错过查询窗口时将清理待办标为需人工检查，不能报告已完成删除。
23. 现有执行链路返回 429 时，Connect 保留业务错误及适用的 Retry-After，不自动重放或切换账号；使用受控响应验证，不以新增 project 执行限流为验收条件。
24. Cookie GET 和完成页首次 GET 均不触发 SaaS 调用或连接写入；Console POST 缺失/错误 Origin、自定义头或权限时被拒绝，Bearer GET 仅在有效管理员凭证和 owner 核对通过后推进。重复合法推进仍幂等，无效 Bearer 不能降级 cookie 获得写权限。
25. setup 四字段仍嵌套在 oauthClient，local/saas 切换不改变 wire shape；query Infinity/-Infinity/NaN 在 JSON 序列化前拒绝，测试不将其误测成 null。只有 service 默认来源引用时仍禁止删除 project；显式切回 local 后可按其他引用条件删除，删除与并发设置来源不产生悬空引用。
26. 文档说明 link 响应丢失、长期停机和丢库可能遗留账号及普通管理端清理步骤；长期故障手动切回本地连接时验证 selectors/allowedConnections，不转移第三方 token。

实现检查：Connect 运行 npm run fix-check 及受影响共享执行/连接/存储/Marketplace/Web 测试；SaaS 按本仓库要求运行 bun run fix-check、关联 Vitest，共享链路完成后 fix-check:full。事务、竞争、恢复和错误边界保留自动测试。真实授权、读 action、受控写 action、proxy、刷新后执行、重连和删除由用户在实现完成后按交付步骤手动验证，至少各一次；真实 D1 和部署调度同样由用户最终验收。实现交付记录待手动验证项，不要求提前准备这些环境，也不把未执行验收记为通过。

## 13. 实施顺序与待定运行参数

1. 核对两边源码基线、既有 project 鉴权、选择器、信封与 scope 错误；新增契约在对应模块实现时补齐。该核对不依赖真实账号或部署环境，可与共享 HTTP/存储基础改动并行。
2. 提取共享 HTTP owner，补普通 SaaS project 发现/只读摘要/账号删除和请求保留，核对精确账号归属及 proxy 取消透传，Marketplace 回归。
3. 接入 Connect 远端引用、授权同步及两层回跳、本地事务提交、策略后分发、审计和回收待办，完成三库迁移、Node 维护和独立 D1 身份维护入口；不扩展 D1 全库轮换/普通 reset。
4. 接入 Console、SDK/API 文档和部署调度，完成兼容性、生命周期自动测试并交付手动验收步骤；用户随后验证真实调用、D1、部署及容量。

已经确定：SaaS project 连接远端执行；第三方凭证留在 SaaS；数据库 instanceId 派生外部用户；无环境变量覆盖；连接来源决定执行位置；不存在本地 token 缓存和五分钟复核。

运行参数在对应模块实现时确定有限默认值并记录依据，真实负载测量与部署确认留到用户手动验收，不作为实施前置条件。上线前还需记录：远端 action/proxy 超时和响应大小边界、project 请求结果清理时限、Connect 删除待办处理频率、两边定时处理部署方式、时钟同步与手动切换 runbook、SaaS 计量与额度展示约定。Project 级执行限流和 Marketplace action 限长属于独立后续工作，均不作为本次上线前置条件。这些参数不改变已确认架构，未验证前不得宣称无界输出、exactly-once 或账号自动即时清理。
