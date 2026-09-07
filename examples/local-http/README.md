# Local HTTP Example

Start the local runtime:

```bash
npm run dev
```

If the server requires bearer tokens, set `OOMOL_CONNECT_ADMIN_TOKEN` for examples that configure
connections or OAuth clients. Set `OOMOL_CONNECT_RUNTIME_TOKEN` for examples that run `/v1`
actions.

Run a no-auth Hacker News action:

```bash
node examples/local-http/hackernews.ts
```

Run GitHub with a personal access token:

```bash
GITHUB_TOKEN=github_pat_... node examples/local-http/github.ts
```

Run Notion with an internal integration token. Share target pages or databases with the integration
first.

```bash
NOTION_TOKEN=secret_... node examples/local-http/notion.ts
```

Run App Store Connect with an API key created in App Store Connect. Pass the `.p8` file through
`APP_STORE_CONNECT_PRIVATE_KEY_PATH`, or inline its PEM contents through
`APP_STORE_CONNECT_PRIVATE_KEY`. Omit `APP_STORE_CONNECT_ISSUER_ID` when you use an Individual API
Key.

```bash
APP_STORE_CONNECT_KEY_ID=2X9R4HXF34 \
APP_STORE_CONNECT_ISSUER_ID=57246542-96fe-1a63-e053-0824d011072a \
APP_STORE_CONNECT_PRIVATE_KEY_PATH=~/.appstoreconnect/private_keys/AuthKey_2X9R4HXF34.p8 \
node examples/local-http/app_store_connect.ts
```

Prepare Gmail OAuth with your own Google OAuth app:

```bash
GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... node examples/local-http/gmail.ts
```

Configure the Google OAuth app redirect URI to:

```text
http://localhost:3000/oauth/callback
```

Open the printed authorization URL in a browser, finish consent, then execute Gmail actions through
the local API.

## List Browser Use V4 Browsers

List the first page of existing browser sessions through an already configured Browser Use
connection. This example does not create, stop, or extend a browser, dispatch an agent task, or
change stored credentials. An empty `items` array is a valid result.

1. Configure a `browser_use` API-key connection in your local Web Console. Keep the Browser Use
   key in OpenConnector; the script needs only an OpenConnector runtime token. See
   [connection setup](../../docs/credentials.md#api-key-connections).
2. Create a persistent runtime token in the Access tab with `allowedProxies: ["browser_use"]`.
   If you restrict `allowedConnections`, grant the selected connection's stable ID, not its name.
   The deployment and runtime proxy policies must also allow `browser_use`. See
   [proxy access](../../docs/runtime-api.md#public-runtime-endpoints).
3. Set `BROWSER_USE_CONNECTION_NAME` to that connection's name, or `default` to select the default
   connection explicitly. Supply your runtime token in `OOMOL_CONNECT_RUNTIME_TOKEN`, then run:

```bash
BROWSER_USE_CONNECTION_NAME=work node examples/local-http/browser_use.ts
```

The script skips without both environment variables. It sends `POST /v1/proxy/browser_use` to the
local runtime with an inner `GET /api/v4/browsers` request and `pageSize=10`, `pageNumber=1`.
The explicit `/api/v4` prefix selects the V4 contract; the existing `browser_use.run_task` action
still uses V3 and is not called. The response is inside OpenConnector's `data.data` envelope. Output
shows pagination and each browser's ID/status, without connection or recording URLs.

The script is read-only, but the token's provider proxy grant is not a read-only permission. It also
allows other Browser Use proxy methods, including operations that can create paid resources.
Action allowlists do not restrict proxy access. Keep the token private and grant it only to trusted
clients. Configuring a new Browser Use connection validates the key with a read-only V3 billing
request; that setup step is separate from this V4 example.

Missing proxy grants return `403 proxy_not_allowed`; a denied connection returns
`403 connection_not_allowed`. A nonexistent named connection does not fall back to the default.
The script reports non-success responses and exits nonzero. See the
[Browser Use V4 schema](https://docs.browser-use.com/openapi/v4.json) for the list response and filters.
