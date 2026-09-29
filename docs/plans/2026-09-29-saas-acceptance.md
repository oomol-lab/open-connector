# SaaS 远端执行手动验收记录

本表对应 spec §12 的 26 项，不把测试替身或 Console 预览当作真实部署验收。

- Connect：本次实现仍在工作区，基线 HEAD 为 70a6f7797122d3dfb711eb9bfa2c3c9d643a0769。提交后填写实际实现 commit。
- SaaS：本地 checkout HEAD 为 cefb7eabe7cd73b32ceb4a01fdbdb4a25ee1de8c。它不是本次核实过的部署版本；验收时填写实际部署 commit。
- 每次验收记录：日期、两端 commit、部署环境、测试 provider/config、脱敏 request/connection/execution ID、预期与实际结果、证据位置。不要记录 key/token。
- 当前状态：自动测试和操作说明已交付；以下真实环境步骤未执行，验收项保持未完成。

## 前置配置与操作顺序

1. 使用测试 project、测试 OAuth 账号和可丢弃资源；选择实际支持 proxy 的 provider。配置 Connect 加密、管理员认证和可信公共 origin；通过正常 secret 配置提供 project key。
2. 应用迁移，启动两端调度。Workers 检查实际 cron 触发记录；确认所有副本时钟同步。保留数据库与配置备份。
3. 按 [Console 操作说明](../saas-oauth.md#configure-the-console) 保存 project，选择 provider config，在没有本地 client 的情况下授权一个命名连接。预期出现 SaaS 来源、稳定本地 ID 和账号摘要。
4. 用受限运行时 token 指定该连接，分别执行只读 action、针对可丢弃资源的写 action、受支持的 proxy。记录本地与远端 executionId、输入大小、返回大小和耗时，并在 SaaS 核对计量。
5. 等待或受控触发账号刷新，再执行一次读 action。重连后确认本地 ID/alias 不变。将默认来源切回 local，重连旧连接仍应走 SaaS；另建本地连接应走 local。
6. 删除测试 SaaS 连接，确认本地立即不可执行，远端账号稍后由清理任务删除。短暂停机后重启，确认待办继续推进。对明确标为 manual 的任务按普通 SaaS 账号管理步骤核对并清理。
7. 在独立测试数据库验证备份恢复与克隆重置。真实 D1 的回滚、响应丢失、竞争和临时 Worker 清理按 [D1 维护说明](../saas-maintenance.md#offline-d1-maintenance) 逐项执行。

## 验收映射

“自动覆盖”列是代码定位，不替代运行日志及真实结果。SaaS 仓库测试证据按主计划 S1–S3 记录补充；本轮没有重新执行对端测试。

| spec 项 | 自动覆盖／实现位置                                                    | 待手动核对与证据                                                      |
| ------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1       | saas-oauth-routes、saas-client 测试                                   | 无本地 client 完成真实授权；脱敏检查 DB/API/日志无第三方凭证          |
| 2       | saas-execution-service、runner 测试                                   | 真实 action/proxy 在 SaaS 执行；local/Marketplace 各回归一次          |
| 3       | saas-execution-service 测试                                           | 受限 token 与指定连接执行，拒绝未授权连接                             |
| 4       | saas-client、saas-execution-service 测试                              | 核对返回内容、业务失败及两端 executionId                              |
| 5       | remote-http、saas-client、execution 测试；SaaS proxy 测试             | 记录取消后的远端实际状态，不把取消当作撤销                            |
| 6       | saas-execution-service、saas-project-service 测试                     | 不支持的 action/proxy 明确失败，无替代执行                            |
| 7       | saas-oauth-routes、共享请求 store 用例                                | 关闭客户端后恢复同一已知请求；未知 link 结果按人工流程处理            |
| 8       | 共享 SaaS store、saas-oauth-routes 测试                               | 重连后本地 ID/alias 保持不变                                          |
| 9       | 共享 SaaS store、saas-cleanup-service 测试                            | 删除后本地不可执行；远端删除失败留待办并可恢复                        |
| 10      | 共享 SaaS maintenance 用例                                            | 原部署恢复保留身份；独立克隆换身份且不删除原远端账号                  |
| 11      | remote-http、saas-client 测试                                         | 检查部署日志脱敏与出网策略                                            |
| 12      | OAuth flow、connection routes、Web 测试                               | 本地 client、自定义 client、API key、Marketplace 行为                 |
| 13      | SQLite、D1 适配、PGlite／真实 PostgreSQL 测试                         | 实际三库迁移维护、Workers cron、真实输出容量和延迟                    |
| 14      | 共享 SaaS store 用例                                                  | 自动事务/竞争证据；真实重连保留旧连接至提交成功                       |
| 15      | SaaS S1–S3 与本计划架构                                               | 核对普通 OAuth callback 账号立即可用，无专属 binding                  |
| 16      | saas-execution-service 测试                                           | 切换来源不改变全局 catalog；远端支持的 proxy 可执行                   |
| 17      | SQLite/PostgreSQL 维护、SaaS project 测试                             | 部署密钥配置正确；禁止降级；备份密钥可恢复                            |
| 18      | maintenance-worker、d1-runtime-data 测试                              | 专用 D1：错误目标、batch 回滚、响应丢失、不同新 ID 竞争、临时入口删除 |
| 19      | saas-oauth-routes、completion-page 测试                               | 真实公共 origin、反向代理、浏览器会话及 SDK 回跳                      |
| 20      | saas-client、saas-execution-service 测试                              | 实际 proxy 文本/JSON/空响应；不重放失败请求                           |
| 21      | SaaS S1 摘要接口测试                                                  | 在实际部署核对只读摘要不触发刷新或 provider 调用                      |
| 22      | saas-cleanup-service 测试；SaaS S2 清理测试                           | 两端调度启用；过保留窗口的任务进入人工流程                            |
| 23      | saas-client、execution 幂等回放测试                                   | 记录适用的业务额度/计量入口；无需制造新的限流机制                     |
| 24      | saas-oauth-routes、completion-page、Web polling 测试                  | Console cookie POST 成功；无会话浏览器提示登录；Bearer 轮询成功       |
| 25      | saas-project-routes、execution、共享 store 测试                       | local/SaaS setup 字段位置正确，默认来源引用阻止删除 project           |
| 26      | [SaaS 操作说明](../saas-oauth.md)、[维护说明](../saas-maintenance.md) | 演练遗留账号定位和本地切换，核对 selectors/allowedConnections         |

## 排障入口与记录规则

- 配置／发现失败：Console project 状态、GET /api/oauth/managed-project、service source 读回；先核对 key、project、origin 和 provider config。
- 授权失败：本地 connectionRequestId、错误码、远端普通请求/账号及 attempt alias；不要自动重新发起 link。
- 执行失败：本地 executionId 与 remoteExecutionId、SaaS 执行记录和 provider 测试资源。写操作结果未知时先核对远端结果。
- 清理失败：cleanup.pending/manual/paused、Node 或 Workers 调度日志，维护文档中的只读 SQL。
- D1 维护失败：保留 operation file，复用旧/新 ID；验证目标和临时 Worker 清理，不能拆 batch 或重新生成身份绕过错误。
- 每项只有证据齐全才标记通过。真实环境未做、commit 未固定或证据缺失时记“待验收”，不要用已通过的单元测试填补。
