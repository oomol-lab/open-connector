# Instagram OAuth and Actions

Connect OpenConnector to Meta's official Instagram API using an OAuth app you own. This provider supports Instagram Business and Creator accounts.

## Choose a login setup

- **Unified Login**: Use for a Meta app configured with the **Manage messaging & content on Instagram** use case (belonging to a business portfolio and using Facebook Login for Business). Create or select a configuration marked **Instagram Login Compatible**, copy its `config_id`, and use your **Meta App ID and App Secret**. No linked Facebook Page is required.
- **Instagram Login**: Use for existing Business Login for Instagram apps with their **Instagram App ID and App Secret**. Omitting `loginMode` keeps this flow.

Both OAuth setups require a public HTTPS callback. Standard Access works for accounts that hold roles on your Meta app; serving external accounts requires Live mode and Meta App Review.

Official references:

- [Unified Login setup](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started)
- [Unified Login authentication and token lifecycle](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/authentication)
- [Unified Login permissions](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/permissions)
- [Business Login for Instagram](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login)

## 1. Configure a public callback

Read the exact callback URI from your runtime:

```bash
curl -s http://localhost:3000/api/oauth/configs
```

Find the `instagram` entry, copy its `expectedRedirectUri` (ending in `/oauth/callback`), and register it in your Meta app's Business Login settings.

Meta requires a public HTTPS callback. For local development, expose OpenConnector through an HTTPS tunnel and start it with the public origin:

```bash
OOMOL_CONNECT_ORIGIN="https://connect.example.com" \
OOMOL_CONNECT_ENCRYPTION_KEY="replace-with-a-long-random-secret" \
npm run dev
```

Run `GET /api/oauth/configs` again after changing the origin and register the updated URI. Set `OOMOL_CONNECT_ENCRYPTION_KEY` outside disposable local setups to encrypt stored credentials and OAuth configuration.

## 2. Save the OAuth app

For **Unified Login**, save your Meta app credentials and configuration ID:

```bash
curl -s -X PUT http://localhost:3000/api/oauth/configs/instagram \
  -H 'content-type: application/json' \
  -d '{"clientId":"<META_APP_ID>","clientSecret":"<META_APP_SECRET>","extra":{"loginMode":"unified","configId":"<CONFIG_ID>"}}'
```

Unified Login permissions are controlled by `configId` in Meta (include `instagram_basic` for profile and media reads, plus any management permissions you need). `requestedScopes` does not override the Meta configuration.

For **Instagram Login**, save your Instagram app credentials:

```bash
curl -s -X PUT http://localhost:3000/api/oauth/configs/instagram \
  -H 'content-type: application/json' \
  -d '{"clientId":"<INSTAGRAM_APP_ID>","clientSecret":"<INSTAGRAM_APP_SECRET>","extra":{"loginMode":"instagram"}}'
```

Instagram Login requests `instagram_business_basic`, `instagram_business_manage_comments`, `instagram_business_manage_insights`, `instagram_business_content_publish`, and `instagram_business_manage_messages` by default. Pass `requestedScopes` (for example `["instagram_business_basic"]`) to request a smaller set.

Updating the default app only affects new authorizations; existing connections keep their original login mode and token refresh behavior.

## 3. Authorize a professional account

Start authorization:

```bash
curl -s -X POST http://localhost:3000/api/oauth/authorizations \
  -H 'content-type: application/json' \
  -d '{"service":"instagram"}'
```

Open the returned `authorizationUrl`, complete the login flow, and verify the saved connection:

```bash
curl -s http://localhost:3000/api/connections
```

### Account selection (Unified Login)

If only one Instagram account is shared with the app, OpenConnector selects it automatically. If multiple accounts are shared, the error lists their IDs — add `instagramAccountId` to `extra` alongside `loginMode` and `configId`, then start a new authorization.

To authorize multiple accounts as separate named connections without modifying the default app config, pass a per-request `clientConfig` with `extra.instagramAccountId` when custom OAuth clients are enabled.

### Token lifetime

- **Unified Login**: Returns a Business Integration System User token whose expiration depends on your Meta configuration. OpenConnector does not auto-renew Unified Login tokens; reauthorize if the token expires or is revoked.
- **Instagram Login**: Exchanges the initial short-lived token (~1 hour) for a long-lived token (~60 days) and refreshes it automatically on use when it nears expiry. Reauthorize if a connection goes unused past expiry.

## 4. Call Instagram actions

The examples below use the default connection. If runtime authentication is enabled, add `-H "authorization: Bearer $OOMOL_CONNECT_RUNTIME_TOKEN"`. To target a named connection, add `-H 'x-oo-connector-alias: work'`.

Get the connected professional account:

```bash
curl -s -X POST http://localhost:3000/v1/actions/instagram.get_current_user \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

List owned media (pass the returned cursor to `after` for pagination):

```bash
curl -s -X POST http://localhost:3000/v1/actions/instagram.list_media \
  -H 'content-type: application/json' \
  -d '{"input":{"limit":25,"after":"<OPTIONAL_AFTER_CURSOR>"}}'
```

Get one owned media item:

```bash
curl -s -X POST http://localhost:3000/v1/actions/instagram.get_media \
  -H 'content-type: application/json' \
  -d '{"input":{"mediaId":"<INSTAGRAM_MEDIA_ID>"}}'
```

List top-level comments on a media item:

```bash
curl -s -X POST http://localhost:3000/v1/actions/instagram.list_media_comments \
  -H 'content-type: application/json' \
  -d '{"input":{"mediaId":"<INSTAGRAM_MEDIA_ID>","limit":25}}'
```

Get media insights (supported metrics depend on the media type):

```bash
curl -s -X POST http://localhost:3000/v1/actions/instagram.get_media_insights \
  -H 'content-type: application/json' \
  -d '{"input":{"mediaId":"<INSTAGRAM_MEDIA_ID>","metrics":["reach","views","total_interactions"],"period":"lifetime"}}'
```

Publish an image:

```bash
curl -s -X POST http://localhost:3000/v1/actions/instagram.publish_media \
  -H 'content-type: application/json' \
  -d '{"input":{"kind":"image","imageUrl":"https://cdn.example.com/post.jpg","caption":"A new post","altText":"A descriptive alternative"}}'
```

Publish a feed video:

```bash
curl -s -X POST http://localhost:3000/v1/actions/instagram.publish_media \
  -H 'content-type: application/json' \
  -d '{"input":{"kind":"video","videoUrl":"https://cdn.example.com/post.mp4","caption":"A feed video","coverUrl":"https://cdn.example.com/cover.jpg","thumbOffsetMilliseconds":1000}}'
```

Publish a Reel:

```bash
curl -s -X POST http://localhost:3000/v1/actions/instagram.publish_media \
  -H 'content-type: application/json' \
  -d '{"input":{"kind":"reel","videoUrl":"https://cdn.example.com/reel.mp4","caption":"A Reel","coverUrl":"https://cdn.example.com/reel-cover.jpg","thumbOffsetMilliseconds":500,"shareToFeed":true}}'
```

Publish a two-item carousel:

```bash
curl -s -X POST http://localhost:3000/v1/actions/instagram.publish_media \
  -H 'content-type: application/json' \
  -d '{"input":{"kind":"carousel","caption":"Two items","children":[{"kind":"image","imageUrl":"https://cdn.example.com/one.jpg","altText":"First item"},{"kind":"video","videoUrl":"https://cdn.example.com/two.mp4"}]}}'
```

Resume publishing an existing container (when a previous publish error returns a container ID with `resumable: true`):

```bash
curl -s -X POST http://localhost:3000/v1/actions/instagram.publish_media \
  -H 'content-type: application/json' \
  -d '{"input":{"kind":"container","containerId":"<EXISTING_CONTAINER_ID>"}}'
```

Create a top-level comment:

```bash
curl -s -X POST http://localhost:3000/v1/actions/instagram.create_comment \
  -H 'content-type: application/json' \
  -d '{"input":{"mediaId":"<INSTAGRAM_MEDIA_ID>","message":"Thanks for reading"}}'
```

Reply to a comment:

```bash
curl -s -X POST http://localhost:3000/v1/actions/instagram.reply_to_comment \
  -H 'content-type: application/json' \
  -d '{"input":{"commentId":"<PARENT_COMMENT_ID>","message":"Thanks for your comment"}}'
```

Send a direct message reply (Instagram Login only):

```bash
curl -s -X POST http://localhost:3000/v1/actions/instagram.send_message \
  -H 'content-type: application/json' \
  -d '{"input":{"recipientId":"<INSTAGRAM_SCOPED_RECIPIENT_ID>","text":"Thanks for contacting us"}}'
```

The same Action IDs and schemas are available through the Connector SDK, `oo` CLI, MCP, and `/openapi.json`; see [Runtime API and MCP](runtime-api.md) and [Developer tools](sdk-cli.md).

## Alternative: pasted access token

You can also connect with a pasted Unified Login or Facebook Login access token. Because no OAuth callback is needed, this works on a local HTTP origin.

- **Unified Login token**: Discovers shared professional accounts directly without a Facebook Page.
- **Facebook Login token** (Page, user, or system-user): Resolves the Instagram account linked to an accessible Page (requires `pages_show_list` and `pages_read_engagement`).

Prefer a long-lived or system-user token; OpenConnector does not refresh pasted tokens.

```bash
curl -s -X PUT http://localhost:3000/api/connections/instagram \
  -H 'content-type: application/json' \
  -d '{"authType":"api_key","values":{"apiKey":"<ACCESS_TOKEN>"}}'
```

If the token can access multiple Instagram accounts, add `"instagramAccountId":"<INSTAGRAM_ACCOUNT_ID>"` to `values` (the error lists available IDs).

## Action support and permissions

All Action IDs and input/output schemas are identical across login modes.

| Actions                                                     | Instagram Login permissions                     | Unified Login / pasted-token permissions |
| ----------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------- |
| `get_current_user`, `list_media`, `get_media`               | `instagram_business_basic`                      | `instagram_basic`                        |
| `list_media_comments`, `create_comment`, `reply_to_comment` | Basic plus `instagram_business_manage_comments` | Basic plus `instagram_manage_comments`   |
| `get_media_insights`                                        | Basic plus `instagram_business_manage_insights` | Basic plus `instagram_manage_insights`   |
| `publish_media`                                             | Basic plus `instagram_business_content_publish` | Basic plus `instagram_content_publish`   |
| `send_message`                                              | Basic plus `instagram_business_manage_messages` | Not supported                            |

- The catalog's `requiredScopes` lists Instagram Login permissions; use the corresponding Unified Login / pasted-token permissions above for those flows.
- With Unified Login or pasted tokens, `get_current_user` omits `accountType` when Meta does not return it, and `send_message` is not currently supported (use Instagram Login OAuth for messaging).

## Operational notes

- **Media URLs**: Image, video, Reel, carousel item, and cover URLs must be publicly reachable HTTP(S) URLs so Meta can fetch them.
- **Publishing formats and polling**: Supports images, feed videos, Reels, and carousels (2–10 items); Stories are not supported. Video and carousel publishing polls Meta for up to 5 minutes.
- **Retries and resumable publishing**: Publish, comment, and message actions are not automatically retried after ambiguous network errors to avoid duplicate posts or messages. If a publish fails with a container ID marked `resumable: true`, resume with `kind: "container"`.
- **Messaging (`send_message`)**: Replies to users who initiated a conversation within Meta's messaging window (generally 24 hours). `recipientId` is an Instagram-scoped ID (typically obtained from your Meta webhook), and text is limited to 1,000 UTF-8 bytes.
