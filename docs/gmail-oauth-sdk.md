# Gmail OAuth And SDK Tutorial

This guide starts after you already have a Gmail OAuth client. It does not cover creating or
configuring the OAuth app in Google Cloud. OpenConnector only needs the resulting client id, client
secret, and a redirect URI that the OAuth app allows.

## Prerequisites

- The local OpenConnector runtime can run with Node.js 22 or newer.
- You have a Gmail OAuth `clientId` and `clientSecret`.
- The Gmail OAuth app allows this runtime's redirect URI. The URI is the current runtime origin plus
  `/oauth/callback`.

If the runtime is reachable through a tunnel or another public origin, set `OOMOL_CONNECT_ORIGIN`
before starting it. The redirect URI is derived from that origin by appending `/oauth/callback`.

```bash
OOMOL_CONNECT_ORIGIN="https://your-runtime.example" npm run dev
```

For plain local development, start the runtime normally:

```bash
npm install
npm run dev
```

The examples below use `http://localhost:3000`. If you configured
`OOMOL_CONNECT_ADMIN_TOKEN` or a runtime token, add the matching `Authorization: Bearer ...` header
to admin and `/v1` requests.

OAuth redirect URI is shared by all services in the same runtime. Configure the Gmail OAuth app to
allow the current runtime origin plus `/oauth/callback`. With the default local origin, the redirect
URI is:

```txt
http://localhost:3000/oauth/callback
```

## 1. Store The Gmail OAuth Client

Open the local console at `http://localhost:3000`, open the Gmail provider page, and choose
**Configure OAuth Client**. Paste the Gmail OAuth `clientId` into **Client ID**, paste the
`clientSecret` into **Client Secret**, then choose **Save OAuth Client**.

![Gmail OAuth client form](../assets/gmail-oauth-client.png)

After saving, the Gmail provider page should allow you to start the connection flow.

## 2. Authorize A Gmail Account

After the OAuth client is configured, the Gmail provider page shows **Connect Gmail**. Choose that
button to start the OAuth authorization flow.

![Gmail connection action](../assets/gmail-connect.png)

Finish consent in the browser. After Gmail redirects back to the runtime, OpenConnector stores the
OAuth credential as the default Gmail connection.

After the callback completes, the Gmail provider page shows the connected OAuth state.

![Gmail connected state](../assets/gmail-connected.png)

## 3. Create A Runtime Token

Before calling the runtime from your own code, create a runtime token from the local console. Open
the Access page, choose **Create Token**, name the client, and copy the token when it is shown.

![Create runtime token dialog](../assets/create-runtime-token.png)

Set the copied token in the shell that runs your app:

```bash
export OOMOL_CONNECT_RUNTIME_TOKEN="oct_..."
```

## 4. Verify Gmail Through HTTP

Run a Gmail Action through the runtime API with the runtime token created above:

```bash
curl -s -X POST http://localhost:3000/v1/actions/gmail.search_threads \
  -H "authorization: Bearer $OOMOL_CONNECT_RUNTIME_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"input":{"query":"newer_than:7d","maxResults":5}}'
```

## 5. Call Gmail From The SDK

Install the SDK in your TypeScript project:

```bash
npm install @oomol-lab/connector
```

Use `OpenConnector` for a self-hosted OpenConnector runtime. `baseUrl` is the server origin, not a
`/v1` URL. Pass the runtime token you created above.

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

The namespace form calls the same Action:

```ts
const { threads } = await open.gmail.search_threads({
  query: "from:someone@example.com",
  maxResults: 5,
});
```

For precise Gmail Action types, install the optional types package and import the Gmail registry once
in the process:

```bash
npm install -D @oomol-lab/connector-types
```

```ts
import "@oomol-lab/connector-types/gmail";
```

## Common Issues

- `redirect_uri_mismatch`: make sure the OAuth app allows the current runtime origin plus
  `/oauth/callback`.
- `oauth_client_config_not_found`: save the Gmail OAuth client in the local console before starting
  authorization.
- `connection_not_found`: finish the browser authorization step before calling Gmail Actions.
- `unauthorized`: create a runtime token from the Access page and pass it as
  `OOMOL_CONNECT_RUNTIME_TOKEN`.
- `insufficient_permissions`: reconnect Gmail after the OAuth app has the scopes needed by the
  Action you are calling.
