# SaaS Project 远端连接与执行：实施计划

日期：2026-09-28；架构修订：2026-09-29。状态：实施中。按确认采用普通 SaaS project 客户端模式，删除 Connect 专属 binding 生命周期。以下未勾选项仍待交付；已有基础实现的检查结果见 C1 和 S3。

设计依据：[SaaS Project 作为远端连接与执行来源](../specs/2026-09-28-managed-oauth-project-source.md)。协议与架构以该 spec 为唯一 owner；本计划定义交付顺序、改动位置、测试和完成条件，不维护第二份协议。

源码基线：Connect `70a6f7797122d3dfb711eb9bfa2c3c9d643a0769`；SaaS `068bd1212b60ed8dc405941b933191e024d7ac74`。实施前核对分支变化；双方 PR 记录采用的 spec 版本和对端实现 commit。首版不建立独立协议 fixture 发布、版本或跨仓库内容摘要校验机制。

## 1. 交付目标与边界

交付一个可在 Console 配置、可通过 Runtime API 使用、具备本地账号删除待办的 SaaS project 连接来源。SaaS 连接的授权、token 刷新和 provider 调用全部在 OOMOL Connector 执行；Connect 负责本地身份、访问策略、连接引用、请求同步和调用转发。

首版覆盖 SQLite、PostgreSQL、D1。以 Gmail 验证 OAuth/action，以一个实际具备 proxy 能力的 OAuth provider 验证代理。既有本地连接、Marketplace 和普通 SaaS 账号继续走原路径。

不实施 token 导出、本地 token 缓存、五分钟复核、多 project、通用远端插件框架、project 级执行限流、D1 全库密钥轮换/普通 reset。Marketplace action 限长单独跟进，不混入共享 HTTP 提取。

Project 级执行限流列为 SaaS 独立后续工作，不修改 `src/o-limit/client.ts`，不新增分布式执行并发占用/恢复机制，也不阻塞本次发布。首版沿用 SaaS 当前执行限制与计量能力，不新增失控调用或费用上限保证；保留授权轮询约束和 Connect 本地删除待办；不新增 SaaS 专属账号配额或自动回收保证。

## 2. 依赖与拆分

每项可作为独立评审单元。涉及同一个事务不变量的代码和测试必须一起交付，不能为了拆 PR 留下可被正常请求触发的半成品。

| 编号 | 仓库    | 交付内容                                   | 前置依赖        |
| ---- | ------- | ------------------------------------------ | --------------- |
| P0   | 双方    | 源码基线与现有接口契约核对                 | 无              |
| S1   | SaaS    | 普通 project 账号查询/删除及授权契约核对   | P0              |
| S2   | SaaS    | 配置发现、请求结果保留及有界清理           | S1              |
| S3   | SaaS    | 精确账号归属检查、proxy 取消透传           | S1              |
| C1   | Connect | 提取共享 HTTP owner，保持 Marketplace 行为 | 无              |
| C2   | Connect | 三库来源类型、身份、请求租约和清理待办存储 | 无              |
| C3   | Connect | Project 配置、默认来源和 SaaS 客户端       | C1、C2、S2 契约 |
| C4   | Connect | 授权同步、本地事务提交、回跳与认证来源区分 | C3、S1、S2      |
| C5   | Connect | Action/proxy 分发、策略、错误和审计        | C3、S3          |
| C6   | Connect | 清理调度、Node 维护和 D1 离线身份重置      | C2、C3、S1      |
| C7   | Connect | Console、API/SDK 文档及操作说明            | C4、C5、C6      |
| V1   | 用户    | 按交付清单手动联调、部署验证及发布验收     | S1–S3、C1–C7    |

P0 是开始实现时的简短源码核对，可与 C1/C2 并行，不要求测试 project、OAuth 账号或远端 D1 环境。C4/C5 可依据 spec 使用测试替身开发，在对应模块补契约测试；模拟响应通过不能代替对端实现交付。最终启用配置入口前，账号归属检查、Connect 删除待办调度和维护路径必须全部实现，不增加临时功能开关掩盖缺项。

实施者负责代码、自动测试和手动验收步骤；用户在实现交付后负责真实授权、服务联调和部署环境验收。环境未就绪不阻塞独立实现，交付时明确区分已实现、自动测试通过和待用户手动验证，不把待验证项记为通过。

## 3. P0：源码与契约核对

- [ ] 核对两边当前源码与计划基线，确认既有 project key 鉴权、精确 config/user/account 选择、action/proxy 信封、scope 错误及 executionId 的实际 owner；记录与 spec 的差异。
- [ ] 新增接口以 spec 为准，在对应模块实现时补齐字段、状态和错误约定及契约测试；测试样本随模块维护，不复制生产解析代码，不建立独立 fixture 发布或跨仓库 CI 校验机制。
- [ ] 确认 spec §8.4 的取消边界与现有执行能力：action 首版只保证 Connect 中止等待，远端执行可能继续；proxy 透传服务端已感知的取消。记录 SaaS proxy 不执行 action 的声明式 scope 检查。

完成条件：源码与契约差异已明确到对应实现任务。无需先探测真实接口或准备测试凭证、OAuth 账号、Postgres/D1 部署环境；正常实现从此继续。

运行参数在对应模块实现时确定有限默认值并记录依据，不作为 P0 前置条件；依赖真实负载的测量和调整由用户在 V1 完成：

| 参数                            | 实现阶段决策与自动验证                           | 最终手动验证                 |
| ------------------------------- | ------------------------------------------------ | ---------------------------- |
| Action/proxy 超时和响应字节上限 | C5 核对执行预算，确定边界并做受控响应测试        | 代表性输出容量和延迟         |
| 请求结果保留与本地删除待办频率  | S2/C6 用受控时钟验证保留边界、重试和人工处理状态 | 清理延迟与停机恢复           |
| 调度、时钟同步、计量/额度展示   | S2/C6/C7 交付部署配置、观测和操作说明            | 部署启用、实际计量与排障入口 |

Infinity/-Infinity/NaN、429/Retry-After、取消、响应限长等在 C1/C5 或对应服务模块中自动测试，不单列为 P0 交付。

## 4. S1：普通 project 账号与授权契约

主要位置：SaaS 的 `src/saas/controller.ts`、`service.ts`、`runtime-connect-service.ts`、`schema.ts` 和现有账号 store。

- [ ] 核对普通 link/callback 的事务与重复 callback 行为；实际发现的通用问题修复在原 owner，不增加 Connect 专属表、状态或配额。
- [x] 新增 project-key 只读账号摘要，返回 project/config/user/service/account 及有限展示字段；不调用 profile/resolver/refresh/upstream，不返回凭证或任意 metadata。
- [x] 新增普通 project-key 账号删除入口，核对精确 project/config/user/account，复用现有账号删除及无引用 app/credential 清理，不自动第三方 revoke。
- [x] 删除重复调用或目标不存在时安全幂等，跨 project 不可删除。若需要新增 store 方法，同步 memory/真实 Postgres 实现并补共享行为测试。

完成条件：Connect 使用普通 project link、请求结果、账号摘要和删除；SaaS 不接收本地连接生命周期对象，不要求接收确认。link 结果不明不自动重发；通用 link 幂等不作为接入前置条件。

验证：摘要在 token 过期时仍然零上游调用；删除权限、重复删除、普通 callback 回归。数据库测试只在实际修改事务/store 时运行，环境缺失明确记录。

## 5. S2：发现、请求结果保留与清理

主要位置：SaaS controller/service/views/store 及既有后台任务。

- [x] 新增 project-key 配置发现，返回 project 身份、可用 OAuth config/effectiveScopes；action/proxy 能力从现有 catalog 派生。
- [x] 普通 project connection request 在 expiresAt 后 24 小时内可查询结果，之后有限批次清理；结果 TTL 不删除账号。
- [x] 将请求结果清理接入既有持续调度及关闭路径，补必要的清理失败观测和部署说明。
- [x] 操作文档使用普通账号列表按 externalUserId、provider config 和 alias 定位遗留账号；说明丢库、未知 link 结果或错过保留窗口时需要人工清理，不承诺自动孤儿回收。

验证：配置能力与 scope 契约、受控时钟下的保留边界、查询不续期、普通 app/project 请求清理互不影响。不存在专属生命周期、容量预留或 tombstone 测试要求。

实施记录：普通 project-key 发现/摘要/删除接口已交付，授权结果保留 24 小时；API 服务启动时自动开始清理，每批最多 100 条、间隔 60 秒，使用行锁 SKIP LOCKED，关闭等待在途事务。SaaS 操作说明位于对端仓库 `docs/saas-project-client.md`。真实测试 Postgres 已应用仅增加索引的迁移，116 项 DB 测试通过；8 个相关服务/调度/内存测试文件共 88 项通过，fix-check:full 通过。

## 6. S3：普通账号归属与 proxy 取消

主要位置：SaaS action/proxy service 及既有 executor。

- [ ] 核对 project/config/user/account 精确选择在凭证刷新/provider I/O 前生效；发现缺陷时修复共享 owner。
- [x] project proxy 的 controller → service → executor 透传 `c.req.raw.signal`，复用既有超时/取消能力。
- [ ] 回归普通账号 action/proxy，确保未引入 Connect 来源分支或接收状态检查。

不新增 managed proxy 响应标记或专属解码分支。Connect 按现有 JSON/text 契约消费响应，拒绝明确不支持的类型；SaaS 解码后的非法原始字节无法在 Connect 可靠检测，该限制须在文档中说明。通用 proxy 原始字节校验后续独立处理。

验证：跨 project、错误 config/user/account 的请求不触发刷新/上游；受控信号覆盖入站已取消和在途取消，取消不重放。现有取消透传相关 3 个测试文件共 45 项已通过；移除专属 binding 后的回归结果在本次交付中记录。

## 7. C1：共享远端 HTTP owner

主要位置：`src/marketplace/marketplace-service.ts` 及其测试；在 `src/core/` 新增一个职责完整的外部服务 HTTP 模块，具体命名按现有代码定，不建立插件层。

- [x] 提取实际共用的 URL/SSRF 请求、取消/超时、限长 JSON 读取、基础信封解析；Marketplace 和 SaaS 各自解析业务 data。
- [x] 公网 HTTPS、DNS 校验、manual redirect 后显式拒绝 3xx 并关闭 body，错误响应同样限长；不透传原始敏感正文到错误或日志。
- [x] 管理/发现保持 4 MiB；SaaS 执行读取接入 C5 确定的边界，不阻塞 C1 提取。共享提取保持 Marketplace action 当前容量和错误契约。

验证：扩展 Marketplace 测试及共享 HTTP 测试，覆盖重定向不泄漏 key、DNS/SSRF、无长度头、流中途超限、畸形信封、普通 401、超时与取消。完成条件是旧 Marketplace 路径回归通过，而非仅新客户端测试通过。

实现记录：共享 HTTP 已提取，4 个相关测试文件共 103 项通过，Connect fix-check 已通过；后续 SaaS 客户端在 C3 接入。

## 8. C2：三库类型与事务原语

主要位置：`src/connection-service.ts`、关联 core 类型、`src/server/storage/runtime-database.ts`、`connection-request-store.ts`、三套 runtime store、根 migrations 与 `migrations/postgresql/`。

- [x] 定义 local/saas 存储来源及 local/marketplace/saas 执行目标判别；SaaS 引用不进入本地 token credential/validator/refresher 路径。旧数据迁移为 local。
- [x] 持久化 singleton instance identity、managed project、service 默认来源；连接引用留在连接 owner，请求恢复信息留在请求 owner，账号删除待办有独立持久化队列。
- [x] 扩展 connection request 的 kind、原始 phase、候选账号、目标 revision、租约及 nextPollAt。新增按本地 request ID 的条件领取，不复用 claim(state)。
- [x] 提供本地完成/重连事务：检查请求租约及目标 revision，写连接与终态，同时记录旧账号删除待办。删除/取消/过期时先持久化必要清理引用。
- [x] 审计所有删除请求或清空 payload 的入口，包括现有 `ConnectionRequestStore.create()` 的过期清理和 supersede SQL；local/SaaS 发起路径共用的清理遇到 SaaS 请求时，必须在同一事务先记录账号删除 outbox，再清除恢复信息。
- [x] 查询、执行和租约更新不更改连接 revision/updated_at；仅真实连接修改改变 revision。
- [x] SQLite/D1 和 PostgreSQL 分别核对迁移编号；更新 migration-source 测试及各 store 的事务/锁清单。

验证：扩展 `connection-request-store.cases.ts` 和三库 store 测试，覆盖旧库升级、唯一身份初始化、租约竞争、条件更新失败零副作用、重连/删除竞争、事务回滚和密文字段。增加 local 请求替代 SaaS pending、SaaS 请求替代 local pending、候选保存后被另一请求替代，以及 local 发起触发 SaaS 过期清理的用例，验证清理引用不丢失且不为 local 请求生成远端待办。Postgres 集成测试按现有测试设施运行；D1 实际行为列入 V1 用户手动验证，不以 SQLite 测试替代。

完成条件：C4/C6 所需事务可直接调用，不需要业务层拼接多个独立提交来模拟原子性。

实现记录（2026-09-29）：两套 `0014_saas_project.sql` 已加入；三库共用连接写入、请求租约/候选提交及删除 outbox 事务。SaaS 查询/提交按授权过期后 24 小时的恢复窗口判断，不受展示层 expired 阻断。共享用例覆盖十一分钟恢复、跨来源替代、租约竞争、目标删除/重连冲突及 project 引用保护；SQLite 另验证旧数据迁移、候选提交故障回滚和密文落库。Node project key/候选轮换及 reset 清单同时纳入新数据，普通 reset 保留 instanceId，plain 降级拒绝且失败回滚。配置接口、SaaS HTTP 调用和远端 runner 尚未启用，继续由 C3–C5 实现；D1 此处仅通过 SQLite batch 适配测试，实际部署验证仍在 V1。

验证记录：`npm run fix-check` 通过；受影响的连接/OAuth/API/MCP/存储等 11 个测试文件共 363 项通过，PGlite 29 项通过，真实 PostgreSQL 集成 17 项通过。真实 PostgreSQL 覆盖多实例 project 删除/来源绑定竞争和加密轮换；测试容器已停止。

## 9. C3：配置与 SaaS 客户端

主要位置：`src/server/connect-app.ts` 的组装、现有管理路由/Runtime API owner、OAuth 配置服务；新增 project 服务与协议客户端，仅按实际业务和 HTTP 边界分模块。

- [x] 实现 spec §4.3 的成对管理接口；保存前验证 project 身份和 encrypted codec；key 不出现在读回响应。
- [x] 同 project 换 key 保留绑定，拒绝原地切 origin/project；service 默认来源、连接、pending、outbox 引用存在时拒绝删除；默认来源必须先显式切回 local。删除检查与并发来源绑定写入处于同一事务/锁边界，不能留下悬空 config 引用。
- [x] 按 spec §6.1 验证可信 HTTP(S) origin 作为 SaaS 来源的配置前置条件；核对 Node/Workers 配置组装，不能将 Workers 由 `request.url.origin` 回退得到的 `publicOrigin` 当作可信配置。缺失或非法时拒绝启用来源和发起授权，并给出配置错误。
- [x] 原子获取数据库 instanceId，派生 externalUserId；不提供环境变量覆盖。
- [x] 默认来源绑定时验证 service、config、effectiveScopes 必选项及远端能力；默认切换只影响后续授权，不改已有连接。
- [x] 客户端严格解析发现/摘要/普通请求结果/删除信封；执行信封与响应容量在 C5 接 runner 时一并实现；维护 configured 与健康状态区别。API 错误安全映射，不把远端故障伪装成未配置。

验证：配置读回、错误 key/project、并发初始化、轮换、禁止删除被引用来源、scope 不足、非加密 codec、恶意摘要字段和协议漂移。覆盖仅有 service 默认来源时删除 project 被拒绝、删除与设置来源竞争、显式切回 local 后删除及重新绑定；覆盖缺失/非法 origin 配置和 Workers 请求派生 origin 不被接受。

实现记录（2026-09-29）：新增 `src/saas/saas-client.ts` 和 `saas-project-service.ts`，接入六个 `/api/oauth/managed-project`、`/api/oauth/sources/:service` 管理路由，沿用管理员认证。配置和默认来源写入前验证 project、原生必选 scopes 和可用 action/proxy；发现只返回本地 catalog 的 action 交集。GET 保留 configured 事实，分别报告 available/unavailable/auth_error，并返回清理积压计数；key 不读回。Node 区分宿主显式 origin 与开发 fallback，Workers 只把环境变量 origin 传给 SaaS 配置校验，并把其配置事实纳入 app cache key。SaaS 客户端复用 C1 的受限 HTTP owner，普通 link、结果查询、账号摘要/删除均有严格解析和身份核对；摘要未知字段被拒绝。C4 继续负责授权编排及请求全身份匹配，C5 实现 action/proxy 信封和输出容量，C7 接入 Console/setup 展示。

验证记录：`npm run fix-check` 通过；SaaS 客户端/配置服务/管理路由与连接、Workers、Node runtime、Marketplace、共享 HTTP 回归共 9 个文件 196 项通过。真实 OAuth、SaaS 端到端和 D1 部署仍由 V1 手动验收。

## 10. C4：授权同步、本地提交与回跳

主要位置：OAuth flow、新增 SaaS 编排、connection routes/auth/completion page/runtime API/request store。

- [x] 本地 clientConfig 校验前选择 saas 分支，拒绝逐次 OAuth 覆盖；独立 Gmail SDK/startAuthorization 保持明确 local-only 边界。
- [x] 沿用不透明本地 request ID，预分配连接 ID，重连保存目标 revision。先持久化 creating，再调用普通 link；保存远端 request ID 后可恢复查询。创建响应丢失或保存前崩溃时，显示结果不明，不自动重发 link。
- [x] 一个同步 owner 服务 Bearer GET 和 Console POST，核对实际凭证来源、owner、Origin 和自定义头；cookie GET/初始完成页 GET 只读，错误 Bearer 不降级。
- [x] 按原始 kind/phase 判断推进资格，最小两秒查询间隔、共享数据库租约、进程 singleflight、退避及 Retry-After；预算 30 秒、租约 45 秒，不持事务等待网络。
- [x] 远端成功后核对普通账号摘要并持久化候选，在本地事务检查 phase/租约/revision 后提交新引用、终态和旧账号删除待办。无远端接收确认步骤。
- [x] 真正提交冲突记录候选清理，单纯租约丢失停止当前工作者，不能误删。local/SaaS supersede、取消和过期清空前原子保存已知 request/account 清理引用。
- [x] SaaS HTTP(S) 完成页和本地最终 returnUri 分离；完成页与 POST 同源校验共用可信配置，成功提交后回跳，无会话 SDK 由认证轮询完成。

验证：第十一分钟恢复、候选保存/本地提交前后退出、创建结果不明、多副本查询、旧连接删除/重连、跨来源替换、CSRF/伪造回跳、可信 origin 与 Workers 配置。未知 link 结果和错过保留窗口不得展示为已清理或自动重新创建。

完成条件：connected 仅表示本地引用已提交；SaaS 账号 OAuth 成功即按普通规则可用。旧账号仅在本地替换成功后清理，晚到结果不能复活本地连接。

实现记录（2026-09-29）：新增 `SaasOAuthService` 统一授权发起与结果同步；接入显式管理员 Bearer GET、Console 同源 POST 和只读完成页。请求持久化 creating、远端 ID、候选、退避次数及加密最终 returnUri；提交沿用数据库租约和 revision CAS。重连保持原来源，创建结果不明进入人工处理且不重发 link；本地候选可在重启后继续提交，无 SaaS 接收确认。维护轮换覆盖新增加密字段，OpenAPI 与 runtime API 文档说明认证来源和轮询语义。删除待办已记录，持续消费由 C6 实现。

验证记录：相关 11 个文件 339 项测试通过，覆盖未知创建、十一分钟后恢复、候选恢复、多实例租约、退避、取消、身份/摘要异常、删除竞争和同源保护；PGlite 29 项、真实 PostgreSQL 17 项通过；Node/Workers/OpenAPI 3 个文件 18 项通过。PGlite SaaS 用例使用独立数据库隔离事务失败后的 socket 状态。真实 OAuth、浏览器回跳与部署 D1 留待最终手动联调。

## 11. C5：执行分发与公共响应

主要位置：`src/server/actions/action-runner.ts`、`src/server/proxy/proxy-runner.ts`、`src/connection-service.ts`、`src/server/api/runtime-api.ts`、`openapi.ts`、`src/server/actions/run-log-summary.ts`。

- [x] 本地权限、输入及 allowedConnections 检查完成后按最终目标分发；使用精确 remote selectors，不依赖 alias/最新账号。
- [x] 将 proxy executor 加载移入 local 分支，保留加载异常 500、缺失 501；SaaS 目标不加载本地 executor。
- [x] 校验所选 SaaS 来源的能力交集，不裁剪全局本地 catalog；不支持的 action/proxy 清晰失败。
- [x] 显式构造 proxy payload：拒绝 HEAD、accessGrant、复杂 query/header、非有限数和不支持的 body；不展开未知输入字段。
- [x] 分别解包 action output 与 proxy status/headers/data；记录本地与远端 executionId，不改变既有 wire shape。
- [x] 统一错误文案、OpenAPI 描述和审计脱敏；Connect 的取消信号传给 SaaS HTTP 请求，按 spec §8.4 报告本地取消。超时、断线、取消均不自动重放、不切换目标，不把本地幂等承诺扩大为远端 exactly-once。

验证：runner 测试用会抛错的本地 loader/refresh 替身证明远端路径不触达；拒绝策略时远端调用数为零。覆盖信封、精确选择器、schema 漂移、429/Retry-After 传递、输出限长、响应丢失及本地/Marketplace 回归。Infinity/-Infinity/NaN 用代码在 JSON 序列化前构造并验证拒绝，不能把转成 null 的 JSON 当作该测试。验证取消能中止 Connect 对 SaaS 的等待且不重放；受控 action 在本地取消后仍可能远端完成，不据此报告副作用已撤销。

实现记录（2026-09-29）：新增 `SaasExecutionService`，本地策略、稳定连接 ID 和输入校验通过后按最终连接分发，SaaS 分支使用精确 config/user/account selector 和实时能力发现，不加载本地 executor/credential refresher，不修改全局 catalog。客户端分别解包 action/proxy，按 SaaS 实际原始失败形状解析业务错误并脱敏；本地/远端执行 ID 分别保留，action 写入运行日志，HTTP/MCP 返回远端关联。Proxy 输入白名单与 JSON/text 输出校验已实现。执行 POST 使用 300 秒预算与 64 MiB JSON 上限，发现仍为 30 秒/4 MiB；取消、断线、超限不重放、不切换连接。

验证记录：17 个相关测试文件共 404 项通过，`npm run fix-check` 和 `git diff --check` 通过，覆盖本地与 Marketplace 回归、精确选择器、最终连接权限变化、schema/能力不兼容、原始业务错误和 429/Retry-After 幂等回放、远端成功/失败 ID、调用方取消和响应丢失，以及 5 MiB action 输出、10 MiB 文本 JSON 转义约 60 MiB、无 Content-Length 成功/错误响应限长、执行超时。真实读写 action、proxy、刷新后执行和部署容量/延迟留待用户手动联调。

## 12. C6：清理与身份维护

主要位置：三套 store、`src/server/connect-app.ts` 与服务关闭路径、`src/server/cloudflare.ts`/部署配置、`scripts/runtime-data.ts`；新增 `scripts/d1-runtime-data.ts` 和一次性维护 Worker。

- [x] 账号删除 outbox 调用普通 project-key 账号删除，使用有限批次、租约与有界重试；key 无效暂停并告警。Node 接入可关闭的持续定时处理，Workers 新增 scheduled 入口和部署 schedule，初始化不得依赖 HTTP 请求推导 origin；启动/请求顺带推进不能替代持续调度。
- [x] 普通删除立即移除本地可执行连接并记录账号删除待办；已知远端请求继续查结果后删除账号。错过保留窗口且结果未知时标记人工处理，pending 到期不能先丢失清理引用。
- [x] Node reset/rotate/lock 清单纳入新数据；普通 reset 保留 instanceId。存在 managed project 时在同一维护事务边界拒绝 plain codec 降级，加密轮换失败整体回滚。
- [x] Node reset-instance 停服执行，原子移除 SaaS 相关数据并换身份，保留 local/Marketplace，不请求 SaaS。
- [x] D1 脚本核对目标 binding/数据库、旧身份和记录数量，持久化旧/新 ID，部署一次性认证 Worker；单次条件化 DB.batch 每条删除检查旧身份，最后更新身份。
- [x] D1 重试复用同一操作；同一旧 ID 的竞争操作只能一个生效。失败不拆 batch，不改加密密钥；操作后验证并删除临时 Worker/secret。

验证：outbox 崩溃恢复、重复账号删除、错误 key、Node plain 降级零写入、原子轮换/reset。D1 的条件化 batch、重试和竞争逻辑保留自动测试；交付可复现的手动步骤，由用户在 V1 使用专用 D1 测试数据库验证 batch 回滚、响应丢失重试、不同新 ID 竞争、错误目标与临时入口清理。

实现完成条件：本地删除待办调度、克隆重置和自动测试已交付，克隆重置不调用 SaaS。真实 D1 验证列为待用户验收，不阻塞其他实现；验收前不将 D1 reset-instance 标为已验证支持。

实现记录（2026-09-29）：新增 SaasCleanupService，普通账号删除按精确选择器消费 outbox；已知请求先核对身份、持久化账号再删除，未知结果保留人工处理。每批最多 10 项、50 秒预算、45 秒租约，单次请求最多 30 秒；失败持久化退避，错误 key 暂停项目清理并告警，更新 key 恢复。Node 持续定时执行并在关闭时取消等待，Workers scheduled 独立于 HTTP 初始化，部署模板增加每分钟 cron。独立 0015 迁移补充暂停和请求身份字段，并回填已有待办。

Node 新增停服 reset-instance；D1 新增目标核对 CLI 和一次性认证维护 Worker，旧/新身份预先持久化，单次条件化 batch 原子清除 SaaS 数据并换身份，同操作重试不再删除新数据。重置保留 local/Marketplace 和加密密钥，不调用 SaaS。操作及故障恢复步骤见 [SaaS maintenance](../saas-maintenance.md)。同时修复 SaaS schema 静态导入造成的启动依赖回归，Zod 延迟到首次 SaaS 操作加载。

验证记录：15 个相关测试文件共 235 项通过，覆盖清理租约/恢复/暂停、持续调度和关闭取消、Node CLI、D1 batch 回滚/竞争/响应丢失重试、目标与认证保护、0014 升级及默认入口惰性依赖。PGlite 32 项、真实 PostgreSQL 20 项通过；维护 Worker 的 Wrangler dry-run 构建通过，npm run fix-check 与 git diff --check 通过。尚未部署一次性 Worker 或运行真实 D1 重置；专用 D1 数据库验收仍由用户在 V1 执行。

## 13. C7：Console、消费者和操作文档

主要位置：`web/src/oauth-apps-page.tsx`、`oauth-app-form.tsx`、连接/重连交互及其测试；spec §11 列出的 API、凭证、程序化连接、Marketplace、Gmail SDK 与 Cloudflare 文档。

- [x] 配置 project、选择 provider config、展示来源与远端执行代价；Marketplace key 与 project key 明确分开，已有连接来源可见。
- [x] 完成页调用受保护 POST 推进，正确展示 pending/失败/connected；不依赖 cookie GET 写入。
- [x] setup 四字段保持在 oauthClient 内，customClientAvailable 与所有授权入口一致；source 默认切换不暗示存量连接迁移。
- [x] 文档说明 Bearer GET/Console POST 差异、轮询频率、错误与安全重试、action/proxy 取消保证及远端执行可能继续的边界、计量/额度、调度启用、可信 origin 配置（含 Workers 的 `OOMOL_CONNECT_ORIGIN` 和反向代理）、删除 project 前解除 service 默认来源、租约所需时钟同步，以及备份恢复与独立克隆的不同操作。
- [x] SaaS 操作说明覆盖未知 link 结果、长期停机和 Connect 丢库，通过普通账号列表定位并删除遗留账号；说明自动恢复的边界。
- [x] 编写长期 SaaS 故障的本地切换步骤：另建本地 OAuth 连接、验证、改 selectors/allowedConnections，再决定是否删除旧连接；清理积压修复来源，不能靠 reset 隐藏。

验证：Web 配置/完成流程测试、Runtime wire shape 测试、Console 构建；逐条走读 Node/D1 操作说明，确认没有把拟新增命令写成已验证能力。

实现记录（2026-09-29）：Console OAuth Apps 增加 SaaS project 配置、key 更新与删除、可用状态和清理积压展示；service 设置可选择 provider config，显示远端 scopes/callback/action/proxy 能力和计量提示，已有连接显示来源。默认来源通过本地批量摘要读取，不在 Console 全局刷新时逐 provider 请求 SaaS。配置默认值不会迁移已有连接，本地应用表单在 SaaS 默认下折叠保留。

新增管理员 Console 命名授权请求入口，沿用已有 OAuth 请求 owner、事务和来源选择；配置式本地/SaaS 授权均可跟踪结果，重连核对 appId/service/alias 并保留原来源。SaaS 同步使用受保护 POST，遇到错误退避并遵守 Retry-After，不自动重复 link。完成页自动测试覆盖 pending/失败/成功及无会话行为。setup 四字段仍位于 oauthClient，SaaS callback/customClientAvailable/missingFields 按默认来源投影；OpenAPI 与六种 Console 语言同步更新。

文档已补充 SaaS OAuth 使用说明及 credentials、programmatic connections、Marketplace、Gmail SDK、Cloudflare 和 runtime API 消费者说明，涵盖可信 origin、轮询、取消、计量边界、清理、丢库与长期故障切换。26 项验收映射和可复现步骤见 [V1 验收记录](2026-09-29-saas-acceptance.md)。两端实际发布 commit 与真实操作证据仍待填写，不将工作区基线当作部署版本。

验证记录：48 个非 PostgreSQL 相关测试文件共 681 项通过；PGlite 32 项、真实 PostgreSQL 20 项通过。大批回归时 PGlite 曾出现一次协议连接错误，单独复跑通过，未为此修改事务实现。npm run fix-check、npm run build:web、git diff --check 通过。Safari 使用隔离内存 API 预览验证 project 保存/key 清空、provider config 选择、能力提示、本地配置折叠和无需本地 client 的 SaaS 授权入口；没有向真实 SaaS 保存 key 或发起 OAuth。真实 action/proxy、部署调度与 D1 重置仍留待 V1。

## 14. V1：用户手动联调与发布验收

实施者交付逐项操作步骤、前置配置、预期结果和排障入口，用户在实现完成后准备测试 project、OAuth 账号及部署环境并执行。步骤只引用安全配置方式，不要求在对话或仓库中提交 key/token。

- [ ] 建立 spec §12 共 26 项验收映射，每项记录对应自动测试或真实操作证据、两端 commit 和结果；没有证据的项保持未完成。
- [ ] 用户选定实际支持 proxy 的 OAuth provider 及测试资源，手动完成真实 OAuth、只读 action、受控写 action、proxy、token 刷新后执行、重连、删除；检查 Connect DB/API/日志不含第三方凭证。
- [ ] 汇总自动测试对普通 callback、本地候选/提交、网络响应丢失、多副本租约、事务回滚、跨来源 supersede 和保留边界的覆盖；这些难以稳定手动复现的场景仍由实现者自动验证。用户手动验证重启/清理停机恢复，以及通过普通 SaaS 管理端清理遗留账号。
- [ ] 用户实测输出容量与延迟，核对并按需要调整实现阶段默认参数；429/Retry-After 传递且不重放由模块自动测试验证。手动核对 SaaS 计量和清理积压的排障入口。
- [ ] 用户按交付步骤验证部署环境中的三库迁移与维护、真实 D1 reset-instance、Workers 定时部署启用，以及多实例 SaaS 刷新锁配置与恢复。

代码验证按实际改动运行，不重复运行无关全量测试：

| 仓库     | 必须检查                                                                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connect  | `npm run fix-check`；受影响 OAuth/连接/runner/存储/Marketplace/API/Web 的 Vitest；Web 改动后 `npm run build:web`                                                  |
| SaaS     | `bun run fix-check`；关联 SaaS、DB、execution/proxy Vitest；共享主链路完成后及 PR 前 `bun run fix-check:full`                                                     |
| 环境依赖 | Postgres 集成测试使用现有测试设施；缺失时记录未运行项。真实 D1、测试 project 和 provider 授权留给用户最终手动验收，不阻塞独立实现，也不能用 memory store 结果代替 |

除非实际修改 provider definitions/actions，不运行 catalog 生成或增加 provider-local 测试。新增通用测试放在其共享 owner 附近。

发布先完成 SaaS 通用端点、账号归属检查、proxy 取消透传及请求结果清理，再发布完整 Connect 存储/运行时/Console 和定时配置，最后由用户配置测试 project 做生产环境受控验收。既有普通 SaaS、本地和 Marketplace 路径在各自 PR 中持续回归。

回退前核对新连接 kind 和 schema 的兼容性；不能直接让旧 Connect 二进制读取无法识别的远端引用。若需要恢复旧版本，先停止相关入口并备份，制定数据处理步骤；保留远端清理能力、本地请求与删除待办，不通过自动删库/迁移 token 回退。SaaS 故障按 runbook 手动切换独立本地连接，不增加自动 fallback。

实现交付标准：S1–S3/C1–C7 代码及对应自动测试完成，参数默认值有依据，手动验收步骤和未验证项已交付。用户手动验收尚未执行不阻塞实现交付，也不等于真实联调已通过。

发布验收标准：用户完成 V1，spec 的所有首版验收项有对应证据、上线参数已确认、两边调度已启用且维护路径已验证。只通过测试替身或只有 Console 可配置，不视为真实环境验收完成。
