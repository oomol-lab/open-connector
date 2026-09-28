# 从客户端使用你的自部署网关

部署 OpenConnector 后，打开控制台的 **接入指南**。先填写客户端能够访问的网关地址，再选择
MCP、CLI 或 SDK。下方配置和 Action 详情中的代码示例会使用这个地址；地址在本次控制台会话中保持。

## 1. 准备地址与凭证

例如网关部署在 `https://connect.example.com`，端侧就使用这个地址。`localhost` 指的是运行
客户端的设备，只有网关也在同一台设备上时才适用。

- CLI 和 SDK 使用网关基础地址，不需要追加 `/v1`。
- MCP 使用基础地址加 `/mcp`。
- 网关启用了鉴权时，在控制台的 API Key 页面创建 Runtime Token，并授予所需 Action 和连接。
- 将示例中的 `<RUNTIME_TOKEN>` 替换为创建时复制的 Token。未开启鉴权时省略 Token。

**Runtime Token** 用于客户端访问你的网关；**OOMOL Key** 用于启用网关内的托管服务；自行配置
的服务商凭证保存在网关中。这三种凭证各有用途。

## 2. 选择接入方式

### MCP：让 Agent 调用能力

在支持远程 HTTP 服务及 Authorization 请求头的 MCP 客户端中添加：

```json
{
  "mcpServers": {
    "open-connector": {
      "url": "https://connect.example.com/mcp",
      "headers": { "Authorization": "Bearer <RUNTIME_TOKEN>" }
    }
  }
}
```

未开启鉴权时删除 `headers`。网关使用无状态的 POST JSON-RPC，不提供持续 GET SSE 流。

让 Agent 通过 `search_actions` 查找能力，通过 `get_action_guide` 读取参数与契约，需要选择
账号时调用 `list_connections`，最后使用 `execute_action` 执行。

首次验证可调用不需要服务商凭证的 Action：

```json
{ "actionId": "hackernews.get_top_stories", "input": {} }
```

### CLI：终端、脚本与本地 Agent

在运行客户端的设备上安装 oo：

```bash
curl -fsSL https://cli.oomol.com/install.sh | bash
```

Windows PowerShell：

```powershell
irm https://cli.oomol.com/install.ps1 | iex
```

在同一个终端明确指定自己的网关，再查找、查看参数和执行：

```bash
export OO_CONNECTOR_URL='https://connect.example.com'
export OO_CONNECTOR_TOKEN='<RUNTIME_TOKEN>'

oo connector search "top stories"
oo connector schema hackernews.get_top_stories
oo connector run hackernews --action get_top_stories --data '{}'
```

未开启鉴权时不设置 `OO_CONNECTOR_TOKEN`。PowerShell 使用 `$env:OO_CONNECTOR_URL` 和
`$env:OO_CONNECTOR_TOKEN` 设置环境变量。

如果希望保存连接配置，可使用：

```bash
oo connector login https://connect.example.com --token '<RUNTIME_TOKEN>'
```

`OO_CONNECTOR_URL` 的优先级最高；`OO_API_KEY` 会优先于已保存的自部署配置。因此，要明确使用
自己的网关时，建议设置 `OO_CONNECTOR_URL`。这些 connector 命令不要求登录 OOMOL 账号；
CLI 的其他托管能力仍使用各自的 OOMOL 认证。

### SDK：从应用代码调用

```bash
npm install @oomol-lab/connector
export OOMOL_CONNECT_RUNTIME_TOKEN='<RUNTIME_TOKEN>'
```

自部署使用 `OpenConnector`：

```ts
import { OpenConnector } from "@oomol-lab/connector";

const gateway = new OpenConnector({
  baseUrl: "https://connect.example.com",
  runtimeToken: process.env.OOMOL_CONNECT_RUNTIME_TOKEN,
});

await gateway.health();
const matches = await gateway.catalog.search("top stories");
const action = await gateway.catalog.action("hackernews.get_top_stories");
const result = await gateway.execute("hackernews.get_top_stories", {});
console.log(result);
```

SDK 负责发请求，服务商执行和凭证由网关管理。包里的 `Connector` 和 `ProjectConnector` 分别
用于 OOMOL 托管的个人连接和项目场景；自部署网关选择 `OpenConnector`。

## 3. 使用自己的业务 Action

首次调用成功后，在控制台配置服务商连接，再进入“操作”查找需要的 Action。查看参数 Schema，
复制 CLI 或 SDK 示例，并替换为实际业务输入。多个账号时，在示例区选择连接名称。

CLI 选择连接：

```bash
oo connector apps github
oo connector run github --action get_current_user --connection-name work --data '{}'
```

SDK 选择连接：

```ts
await gateway.execute("github.get_current_user", {}, { connectionName: "work" });
```

异步 Action 返回任务 ID 后，使用相应的结果或状态 Action 查询进度。自部署 CLI 不提供
`--wait` / `--wait-result` 生命周期处理。

失败时对照客户端错误与网关“运行记录”，检查 Runtime Token 是否允许该 Action 和连接，以及
服务商是否已连接。SDK 的 `executeRaw` 会额外返回执行 ID，方便定位对应记录。

## 进一步阅读

- [CLI 自部署接入指南](https://github.com/oomol-lab/oo-cli/blob/main/docs/self-hosted-connector.zh-CN.md)
- [SDK 自部署说明](https://github.com/oomol-lab/connector-sdk#self-hosted-runtime)
- [协议与 MCP 参考](runtime-api.md)
- [Gmail OAuth 与 SDK 教程](gmail-oauth-sdk.zh-CN.md)
- [English](client-onboarding.md)
