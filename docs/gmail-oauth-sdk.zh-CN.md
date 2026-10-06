# Gmail OAuth 和 SDK 接入教程

本教程使用**本地 OAuth 应用**。如果使用 SaaS 托管 Gmail 账号，请先配置 project 和 provider config，再通过标准连接请求接口发起授权，不传自定义 client。第三方 token 和执行保留在 SaaS，重连沿用已有连接来源。参见 [SaaS OAuth 操作说明](saas-oauth.md)和[程序化连接](programmatic-connections.md)。

这篇教程从你已经拥有 Gmail OAuth client 开始，不包含在 Google Cloud 创建或配置 OAuth app 的步骤。OpenConnector 只需要这个 OAuth app 的 `clientId`、`clientSecret`，以及它允许当前 runtime 使用的 redirect URI。

## 前置条件

- 本地 OpenConnector runtime 可以在 Node.js 22 或更新版本上运行。
- 你已经有 Gmail OAuth `clientId` 和 `clientSecret`。
- Gmail OAuth app 已经允许当前 runtime 的 redirect URI。这个 URI 是当前 runtime origin 加上 `/oauth/callback`。

如果 runtime 通过 tunnel 或其他公网 origin 访问，启动前先设置 `OOMOL_CONNECT_ORIGIN`。redirect URI 会基于这个 origin 拼接 `/oauth/callback`。

```bash
OOMOL_CONNECT_ORIGIN="https://your-runtime.example" npm run dev
```

普通本地开发可以直接启动 runtime：

```bash
npm install
npm run dev
```

下面的示例默认使用 `http://localhost:3000`。如果你配置了 `OOMOL_CONNECT_ADMIN_TOKEN` 或 runtime token，对应的 admin 请求和 `/v1` 请求需要加上 `Authorization: Bearer ...` header。

同一个 runtime 里的所有服务共用同一个 OAuth redirect URI。给 Gmail OAuth app 配置当前 runtime origin 加 `/oauth/callback`。默认本地 origin 下是：

```txt
http://localhost:3000/oauth/callback
```

## 1. 保存 Gmail OAuth Client

打开本地控制台 `http://localhost:3000`，进入 Gmail provider 页面，点击 **Configure OAuth
Client**。把 Gmail OAuth `clientId` 填入 **Client ID**，把 `clientSecret` 填入 **Client
Secret**，然后点击 **Save OAuth Client**。

![Gmail OAuth client 表单](../assets/gmail-oauth-client.png)

保存后，Gmail provider 页面应允许你继续发起连接流程。

## 2. 授权 Gmail 账号

OAuth client 配置完成后，Gmail provider 页面会显示 **Connect Gmail**。点击这个按钮启动 OAuth
授权流程。

![Gmail 连接按钮](../assets/gmail-connect.png)

在浏览器里完成 Gmail consent。Gmail 跳回 runtime 后，OpenConnector 会把 OAuth credential 保存为默认 Gmail connection。

回调完成后，Gmail provider 页面会显示已通过 OAuth 连接。

![Gmail 连接成功状态](../assets/gmail-connected.png)

## 3. 创建 Runtime Token

从你自己的代码调用 runtime 前，先在本地控制台创建 runtime token。打开 Access 页面，点击 **Create Token**，给 client 命名，然后复制只显示一次的 token。

![创建 runtime token 弹窗](../assets/create-runtime-token.png)

在运行你的应用的 shell 里设置这个 token：

```bash
export OOMOL_CONNECT_RUNTIME_TOKEN="oct_..."
```

## 4. 用 HTTP 验证 Gmail Action

使用上一步创建的 runtime token，通过 runtime API 调用一个 Gmail Action：

```bash
curl -s -X POST http://localhost:3000/v1/actions/gmail.search_threads \
  -H "authorization: Bearer $OOMOL_CONNECT_RUNTIME_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"input":{"query":"newer_than:7d","maxResults":5}}'
```

## 5. 用 SDK 调用 Gmail

在你的 TypeScript 项目里安装 SDK：

```bash
npm install @oomol-lab/connector
```

自托管 OpenConnector runtime 使用 `OpenConnector`。`baseUrl` 是 server origin，不是 `/v1` URL。传入前面创建的 runtime token。

```ts
import { OpenConnector } from "@oomol-lab/connector";

const open = new OpenConnector({
  baseUrl: process.env.OPENCONNECTOR_BASE_URL ?? "http://localhost:3000",
  runtimeToken: process.env.OOMOL_CONNECT_RUNTIME_TOKEN,
});

const { threads } = await open.execute("gmail.search_threads", {
  query: "newer_than:7d",
  maxResults: 5,
});

console.log(threads);
```

namespace 写法调用的是同一个 Action：

```ts
const { threads } = await open.gmail.search_threads({
  query: "from:someone@example.com",
  maxResults: 5,
});
```

如果希望获得精确的 Gmail Action 类型，可以安装可选的 types 包，并在进程里导入一次 Gmail registry：

```bash
npm install -D @oomol-lab/connector-types
```

```ts
import "@oomol-lab/connector-types/gmail";
```

## 6. 添加附件和内嵌图片

Gmail 的发送、创建草稿和回复接口均接受 `attachments`。内嵌图片通过 `contentId` 与 HTML 中的
`cid:` 引用对应。Markdown 渲染、业务素材读取以及图片地址转 CID 由调用方完成，再把处理好的 HTML
和文件内容传给 connector。

沿用上一节的 `open`，并准备本地 `logo.png` 和 `report.pdf`：

```ts
import { readFile } from "node:fs/promises";

const { draftId } = await open.execute("gmail.create_email_draft", {
  to: "recipient@example.com",
  subject: "Report",
  body: '<p>Please see the attached report.</p><img src="cid:logo" alt="Logo">',
  isHtml: true,
  attachments: [
    {
      filename: "logo.png",
      mimeType: "image/png",
      contentBase64: (await readFile("./logo.png")).toString("base64"),
      contentId: "logo",
      disposition: "inline",
    },
    {
      filename: "report.pdf",
      mimeType: "application/pdf",
      contentBase64: (await readFile("./report.pdf")).toString("base64"),
    },
  ],
});

await open.execute("gmail.update_draft", { draftId, subject: "Updated report" });
```

仅修改主题会保留原 MIME 正文、附件、内嵌图片和回复关系头。`gmail.send_draft` 原样发送已保存的草稿。

每个附件必须且只能指定一种内容来源：`contentBase64`，或引用 `POST /api/files` 上传结果的
`file: { fileId }`。`filename` 和 `mimeType` 可以覆盖中转文件的元数据。`contentId` 不带 `cid:`
前缀或尖括号；指定它时 disposition 默认是 `inline`，否则默认是 `attachment`。

`update_draft` 的更新规则：

- 省略 `attachments` 保留已有附件和内嵌图片；传入列表替换全部附件和内嵌图片；传入 `[]` 清空。
  删除或替换 CID 图片时，应同步修改 HTML 引用。
- 同时省略 `body` 和 `messageBody` 保留已有纯文本与 HTML 双正文；传入正文则替换成一份正文，
  HTML 请指定 `isHtml: true`。空字符串清空正文。指定 `isHtml` 时必须提供替换正文。
- 未传入的可编辑邮件头保持不变；空主题或空收件人字段用于清除对应值。对于无法安全处理或有歧义的
  MIME 结构，内容更新会报错，不会静默丢弃内容。

connector 最多接受 100 个附件，附件解码后合计不超过 25,000,000 字节，包含编码开销的完整 MIME
邮件不超过 35,000,000 字节。Gmail 仍可能施加账号或内容限制。

## 常见问题

- `redirect_uri_mismatch`：确认 Gmail OAuth app 允许当前 runtime origin 加 `/oauth/callback`。
- `oauth_client_config_not_found`：启动授权前，先在本地控制台保存 Gmail OAuth client。
- `connection_not_found`：先在浏览器里完成授权，再调用 Gmail Action。
- `unauthorized`：在 Access 页面创建 runtime token，并通过 `OOMOL_CONNECT_RUNTIME_TOKEN` 传给 SDK。
- `insufficient_permissions`：OAuth app 具备 Action 所需 scope 后，重新授权 Gmail。
