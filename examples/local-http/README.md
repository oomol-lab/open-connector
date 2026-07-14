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
