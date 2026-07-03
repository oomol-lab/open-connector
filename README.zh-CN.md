# OOMOL Connect

[English](README.md) | [简体中文](README.zh-CN.md)

在你自己的机器上，为 AI agent 运行外部服务工具。

OOMOL Connect 是一个本地连接器运行时。它让 agent 能够发现并调用 GitHub、Gmail、Notion、
Hacker News、Ably、Abstract、A-Leads 等服务的类型化 action，而不需要把原始 provider
token 交给 agent。凭据保存在你的本地 SQLite 数据库里；agent 只能看到 schema、scope、执行状态
和安全的账号标签。

当你希望 agent 访问真实外部服务，同时仍然把凭据、权限和执行记录控制在本地边界内时，可以使用
OOMOL Connect。

## 它提供什么

- 一个本地运行时，通过 MCP、HTTP、OpenAPI 和 Web 控制台暴露 provider action。
- 本地凭据存储，支持 API key、自定义凭据、OAuth2 连接和无需认证的 provider。
- 类型化 action schema，让 agent 在调用前先知道自己能调用什么。
- 连接身份和 scope，让用户和 agent 都能看到 action 会以哪个账号执行。
- 本地临时文件中转，供需要文件 URL 的 action 使用。
- 最近运行记录，包含脱敏后的输入摘要和 provider 错误。
- provider catalog 和本地 executor；executor 只在 action 被使用时才加载。

## 快速开始

最快的试用方式是 Docker Compose：

```bash
docker compose up --build
```

打开本地控制台：

```text
http://localhost:3000
```

打开生成的 API 文档：

```text
http://localhost:3000/docs
```

运行一个不需要认证的 action，确认运行时已经正常工作：

```bash
curl -s -X POST http://localhost:3000/v1/actions/hackernews.get_top_stories \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

Docker Compose 会把运行时状态保存到 `connector-data` volume。容器内的 SQLite 数据库路径是
`/app/data/connect.sqlite`。

## 连接第一个 Provider

GitHub 是最简单的带凭据示例，因为它可以使用 personal access token。

查看 GitHub provider 的契约：

```bash
curl -s http://localhost:3000/api/providers/github
```

保存默认 GitHub 连接：

```bash
curl -s -X PUT http://localhost:3000/api/connections/github \
  -H 'content-type: application/json' \
  -d '{"authType":"api_key","values":{"apiKey":"github_pat_..."}}'
```

通过 OOMOL Connect 调用 GitHub：

```bash
curl -s -X POST http://localhost:3000/v1/actions/github.get_current_user \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

查看已配置的连接，以及会暴露给 agent 的安全账号身份：

```bash
curl -s http://localhost:3000/api/connections
```

### 命名连接

当同一个 provider 需要多个账号时，添加 `connectionName`：

```bash
curl -s -X PUT http://localhost:3000/api/connections/github \
  -H 'content-type: application/json' \
  -d '{"authType":"api_key","connectionName":"work","values":{"apiKey":"github_pat_..."}}'
```

执行时选择这个账号：

```bash
curl -s -X POST http://localhost:3000/v1/actions/github.get_current_user \
  -H 'x-oo-connector-alias: work' \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

也可以使用 `alias` query 参数。

## 使用 OAuth Provider

OAuth2 provider 使用你自己的 provider OAuth app。先列出支持 OAuth 的 provider，并复制目标服务的
`expectedRedirectUri`：

```bash
curl -s http://localhost:3000/api/oauth/configs
```

使用默认端口时，GitHub 需要这个 callback URL：

```text
http://localhost:3000/oauth/callback/github
```

在本地保存 OAuth client：

```bash
curl -s -X PUT http://localhost:3000/api/oauth/configs/github \
  -H 'content-type: application/json' \
  -d '{"clientId":"...","clientSecret":"..."}'
```

开始授权：

```bash
curl -s -X POST http://localhost:3000/api/oauth/authorizations \
  -H 'content-type: application/json' \
  -d '{"service":"github"}'
```

在浏览器中打开返回的 `authorizationUrl`。provider 重定向回本地 callback URL 后，OOMOL Connect 会把
OAuth 凭据保存为默认连接。给授权请求添加 `"connectionName":"work"`，可以把 OAuth 结果保存为命名连接。

如果你修改了 `PORT`、`HOST`，或者通过 tunnel 暴露运行时，请在启动前设置
`OOMOL_CONNECT_ORIGIN`。`/api/oauth/configs` 返回的 callback URL 就是需要填入 provider OAuth app
的地址。

## 给 Agent 使用工具

OOMOL Connect 暴露一个本地工具边界，让 agent 从这里发现并执行 provider action。

### MCP

让支持 MCP 的客户端连接到：

```text
http://localhost:3000/mcp
```

MCP server 暴露一组面向发现流程的小工具：

- `list_apps`
- `search_actions`
- `get_action_guide`
- `execute_action`

预览 MCP tool metadata：

```bash
curl -s http://localhost:3000/mcp/tools
```

### HTTP Runtime API

Agent 和 SDK 类客户端应该调用 `/v1` runtime API。它返回统一的 JSON envelope：

```json
{
  "success": true,
  "message": "OK",
  "data": {},
  "meta": {}
}
```

发现 action：

```bash
curl -s http://localhost:3000/v1/actions
curl -s "http://localhost:3000/v1/actions?service=github"
curl -s http://localhost:3000/v1/actions/github.get_current_user
```

执行 action：

```bash
curl -s -X POST http://localhost:3000/v1/actions/github.get_current_user \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

### Action Guide

每个 action 都有一份本地 Markdown guide，包含输入 schema、scope、provider 权限、当前连接身份和请求示例：

```bash
curl -s http://localhost:3000/api/actions/github.get_current_user/agent.md
```

Web 控制台也可以为每个 action 复制 cURL、TypeScript 和 agent prompt 示例。

## Web 控制台

启动运行时后打开 `http://localhost:3000`。Docker Compose 会自动构建并提供 Web 控制台。

控制台可以帮助你：

- 浏览 provider 和连接状态。
- 保存 API key 或 OAuth client 配置。
- 创建和撤销给 agent / client 使用的 runtime API token。
- 查看 action schema、scope 和执行状态。
- 从浏览器运行 action 进行调试。
- 查看最近的本地运行记录。
- 打开生成的 OpenAPI 和 MCP metadata。

## 保护本地运行时

默认情况下，服务绑定到 `127.0.0.1`。如果本机浏览器或 shell 之外的环境可以访问本地管理 API 或 Web
控制台，请设置 admin token：

```bash
OOMOL_CONNECT_ADMIN_TOKEN="replace-with-an-admin-token" docker compose up --build
```

之后，管理端 HTTP client 必须发送：

```text
Authorization: Bearer replace-with-an-admin-token
```

在 Web 控制台的 Access 页面为 `/v1` 和 `/mcp` 调用方创建 runtime token。token 只会在创建时显示一次；
SQLite 里只保存 hash。

也可以通过本地管理 API 创建：

```bash
curl -s -X POST http://localhost:3000/api/runtime-tokens \
  -H 'content-type: application/json' \
  -d '{"name":"Claude Desktop"}'
```

之后，runtime client 使用返回的 `token`：

```text
Authorization: Bearer oct_...
```

为了启动脚本和向后兼容，仍然可以使用 `OOMOL_CONNECT_RUNTIME_TOKEN`：

```bash
OOMOL_CONNECT_ADMIN_TOKEN="replace-with-an-admin-token" \
OOMOL_CONNECT_RUNTIME_TOKEN="replace-with-a-runtime-token" \
docker compose up --build
```

加密存储的 provider 凭据和 OAuth client secret：

```bash
OOMOL_CONNECT_ENCRYPTION_KEY="replace-with-a-long-random-secret" docker compose up --build
```

限制 agent 可以执行哪些 action：

```bash
OOMOL_CONNECT_ALLOWED_ACTIONS="hackernews.*,github.get_current_user" docker compose up --build
```

即使某个更大的 allowlist 包含某些 action，也可以单独阻止它们：

```bash
OOMOL_CONNECT_ALLOWED_ACTIONS="github.*" \
OOMOL_CONNECT_BLOCKED_ACTIONS="github.delete_repository" \
docker compose up --build
```

凭据存储、密钥轮换和 OAuth token 刷新行为见 [docs/credentials.md](docs/credentials.md)。

## 从源码运行

开发 OOMOL Connect 或 provider executor 时使用源码工作流。请使用 Node.js 22 或更新版本。

```bash
npm install
npm run build:web
npm run dev
```

`npm install` 和 `npm run dev` 会在生成文件缺失或过期时创建本地文件。

从源码运行时，运行时状态默认保存在 `./data/connect.sqlite`。可以设置 `OOMOL_CONNECT_DATA_DIR` 使用其它目录。

## 部署到 Cloudflare Workers

Cloudflare Workers 支持作为 metadata 和运行时状态的部署目标：

```bash
git clone https://github.com/oomol-lab/open-connector.git
cd open-connector
npm install
cp wrangler.example.jsonc wrangler.local.jsonc
npx wrangler login
npx wrangler d1 create oomol-connect
npx wrangler r2 bucket create oomol-connect-transit-files
```

运行远程 migration 或部署前，把 Cloudflare 返回的 D1 `database_id` 填入被忽略的
`wrangler.local.jsonc`。所有需要读取 Worker 配置的 Wrangler 命令都应显式使用
`--config wrangler.local.jsonc`。

使用 Wrangler 设置 secret，不要把它们提交到配置文件：

```bash
npx wrangler secret put OOMOL_CONNECT_ADMIN_TOKEN --config wrangler.local.jsonc
npx wrangler secret put OOMOL_CONNECT_ENCRYPTION_KEY --config wrangler.local.jsonc
```

建议设置 `OOMOL_CONNECT_ADMIN_TOKEN` 来保护 admin API、docs 和 web console。需要凭据加密时，必须设置
`OOMOL_CONNECT_ENCRYPTION_KEY`。然后应用 D1 schema 并部署：

```bash
npx wrangler d1 migrations apply oomol-connect --remote --config wrangler.local.jsonc
npm run deploy:cloudflare
```

`npm run deploy:cloudflare` 会生成 catalog、构建 web console、复制 catalog assets，并运行
`wrangler deploy --config wrangler.local.jsonc`。

Cloudflare runtime 会提供 catalog metadata、`/api` 和 `/v1` metadata endpoint、连接、runtime
token、OAuth config/state、基于 R2 的中转文件，以及和 Node runtime 相同的生成版 provider action
executor registry。如果希望自动清理未读取的过期中转文件，请为 transit bucket 配置 R2 lifecycle rule。

## 示例

先启动本地运行时：

```bash
docker compose up --build
```

然后直接用 Node 运行示例：

```bash
node examples/local-http/hackernews.ts
GITHUB_TOKEN=github_pat_... node examples/local-http/github.ts
node examples/mcp-client/list-tools.ts
node examples/openai-tools/list-tools.ts
```

运行 OpenAI tool-call loop：

```bash
OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-... node examples/openai-tools/run-hackernews.ts
```

为接受文件 URL 的 action 上传一个本地临时中转文件：

```bash
curl -s -X POST http://localhost:3000/api/files \
  -F "file=@./report.pdf"
```

响应会包含 `/api/files/:fileId` 下的 `downloadUrl`。本地中转文件保存在
`OOMOL_CONNECT_DATA_DIR/files`，并会按时间清理。

## Runtime API

公开 runtime endpoint：

- `GET /v1/health`
- `GET /v1/providers`
- `GET /v1/actions`
- `GET /v1/actions?service=<service>`
- `GET /v1/actions/:actionId`
- `POST /v1/actions/:actionId`
- `GET /v1/apps`
- `GET /v1/apps/services/:service`
- `GET /v1/apps/authenticated`
- `POST /v1/proxy/:service`

`POST /v1/proxy/:service` 当前会返回 `proxy_not_supported`，直到 provider proxy runtime 实现完成。

本地管理 endpoint 支撑 Web 控制台、示例和配置脚本：

- `GET /api/providers`
- `GET /api/providers/:service`
- `GET /api/actions`
- `GET /api/actions/:actionId`
- `GET /api/actions/:actionId/agent.md`
- `POST /api/files`
- `GET /api/files/:fileId`
- `DELETE /api/files/:fileId`
- `GET /api/connections`
- `PUT /api/connections/:service`
- `DELETE /api/connections/:service`
- `GET /api/oauth/configs`
- `PUT /api/oauth/configs/:service`
- `DELETE /api/oauth/configs/:service`
- `POST /api/oauth/authorizations`
- `GET /oauth/callback/:service`
- `GET /api/runtime-tokens`
- `POST /api/runtime-tokens`
- `DELETE /api/runtime-tokens/:id`
- `GET /api/runs`
- `POST /mcp`
- `GET /mcp/tools`
- `GET /openapi.json`

## 文档

- [Quickstart](docs/quickstart.md)
- [Configuration](docs/configuration.md)
- [Catalog format](docs/catalog-format.md)
- [Credentials](docs/credentials.md)
- [Verification language](docs/verification.md)
- [Contributing](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security](SECURITY.md)

## 开发

```bash
npm run generate:catalog
npm run lint
npm run format
npm test
npm run build
```

格式化和 lint 使用 `oxfmt` 与 `oxlint`。

### 项目结构

```text
src/
  core/                     核心 provider/action contract 和校验逻辑
  oauth/                    本地 OAuth client 配置和 callback 流程
  providers/                Provider definition 和懒加载 executor
  server/                   本地 HTTP server
web/                        Vite 本地控制台 package
catalog/apps/               本地生成的 catalog JSON（gitignored）
examples/                   可直接运行的本地示例
scripts/                    Catalog 和 registry 生成脚本
.codex/skills/add-provider/ 面向 agent 的 provider 贡献流程
docs/                       用户和贡献者文档
```

### 添加 Provider

Provider 代码位于 `src/providers/<service>`。

请查看 [CONTRIBUTING.md](CONTRIBUTING.md#adding-providers) 中的 provider 贡献规则。

常见 provider 工作流：

```bash
npm run generate:catalog
npm test
npm run build
```

Provider definition 会生成 registry 和 catalog 文件。Provider executor 只会在对应 action 被执行时加载。
生成文件是本地 runtime data，不提交到 git。

## 许可证范围

除非另有说明，本仓库中的源代码、脚本、生成的项目脚手架、测试和文档均基于 Apache License, Version
2.0 授权。见 [LICENSE.txt](LICENSE.txt)。

本仓库的 Apache-2.0 许可证不授予任何第三方产品、provider、app、API、商标、服务标识、商号、logo、
icon、品牌资产、文档、截图或其它归属于相应权利人的版权材料的使用权。

Provider 和 app 名称、metadata、链接、scope、permission 以及可选 logo/icon 仅用于识别服务和实现互操作。
所有第三方品牌和产品权利仍归各自权利人所有。本 catalog 中出现某个服务不代表其权利人对本项目的认可、赞助、合作、认证或验证。

如果你贡献 provider metadata 或资产，请只提交你有权提交的材料。优先链接到官方公开资产，而不是把品牌文件复制到本仓库。

## 社区

请让 issue 和 pull request 保持聚焦、尊重且可执行。参与本项目需遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
