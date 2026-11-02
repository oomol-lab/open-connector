# Instagram OAuth And Actions

This guide connects OpenConnector directly to Meta's official Instagram API with an OAuth
application that you own. OpenConnector does not provide a shared Meta app for this flow. The
provider supports Instagram Business and Creator accounts only.

## Prerequisites And Meta Access

You need:

- a Meta Business app with the Instagram product added;
- Business Login for Instagram enabled on that app;
- an Instagram Business or Creator account;
- an Instagram App ID and App Secret; and
- a public HTTPS OpenConnector origin that Meta can redirect to.

Standard Access is sufficient when the professional account is owned or managed by the app
operator and has been added in the Meta App Dashboard. Serving professional accounts you do not
own or manage requires Advanced Access and the applicable Meta App Review approval. Availability
of an Action also depends on the permissions approved for the app and granted by the connected
account.

The provider requests these native Instagram permissions by default:

- `instagram_business_basic`
- `instagram_business_manage_comments`
- `instagram_business_manage_insights`
- `instagram_business_content_publish`
- `instagram_business_manage_messages`

Meta setup starts in the official [Business Login for Instagram documentation](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login).

## 1. Configure A Public Callback

Read the runtime's exact callback URI instead of constructing it by hand:

```bash
curl -s http://localhost:3000/api/oauth/configs
```

Find the `instagram` entry and copy its `expectedRedirectUri`. Register that exact URI in the
Business Login settings for your Meta app. It ends in `/oauth/callback`.

Meta must be able to reach the callback over public HTTPS. For local development, use an
operator-managed HTTPS tunnel and start OpenConnector with its public origin:

```bash
OOMOL_CONNECT_ORIGIN="https://connect.example.com" \
OOMOL_CONNECT_ENCRYPTION_KEY="replace-with-a-long-random-secret" \
npm run dev
```

Run `GET /api/oauth/configs` again after changing the origin and register the newly reported URI.
`OOMOL_CONNECT_ENCRYPTION_KEY` is strongly recommended outside disposable local development; it
encrypts stored OAuth app configuration, credentials, OAuth state, and other sensitive runtime
records.

## 2. Save The Instagram OAuth App

Save the Instagram App ID as `clientId` and App Secret as `clientSecret`:

```bash
curl -s -X PUT http://localhost:3000/api/oauth/configs/instagram \
  -H 'content-type: application/json' \
  -d '{"clientId":"<INSTAGRAM_APP_ID>","clientSecret":"<INSTAGRAM_APP_SECRET>"}'
```

To request a non-empty subset of the declared permissions, add `requestedScopes`. For example, a
read-only profile and media connection can request only the basic permission:

```bash
curl -s -X PUT http://localhost:3000/api/oauth/configs/instagram \
  -H 'content-type: application/json' \
  -d '{"clientId":"<INSTAGRAM_APP_ID>","clientSecret":"<INSTAGRAM_APP_SECRET>","requestedScopes":["instagram_business_basic"]}'
```

The runtime rejects unknown permissions. A connection can execute only Actions whose required
permissions were granted.

## 3. Authorize A Professional Account

Start authorization:

```bash
curl -s -X POST http://localhost:3000/api/oauth/authorizations \
  -H 'content-type: application/json' \
  -d '{"service":"instagram"}'
```

Open the returned `authorizationUrl`, complete Business Login, and let Meta redirect to the
registered callback. Confirm that the stored connection identifies the Instagram account by its
username and professional-account ID:

```bash
curl -s http://localhost:3000/api/connections
```

Meta first returns a short-lived token, normally valid for about one hour. OpenConnector exchanges
it server-side for a long-lived token before storing the connection. The long-lived token is
normally valid for about 60 days. When an Action resolves a token near or after its stored expiry,
OpenConnector refreshes it through Meta's access-token refresh flow; Instagram does not issue a
standard OAuth `refresh_token` for this flow. A connection that remains unused beyond Meta's actual
token lifetime may require reauthorization, and an expired token that cannot be refreshed requires
reconnecting the account.

## 4. Call The Nine Instagram Actions

The examples use the default connection. If runtime authentication is enabled, add
`-H "authorization: Bearer $OOMOL_CONNECT_RUNTIME_TOKEN"`. A named connection can be selected with
`-H 'x-oo-connector-alias: work'`.

Get the connected professional account:

```bash
curl -s -X POST http://localhost:3000/v1/actions/instagram.get_current_user \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

List owned media, then continue with the returned cursor rather than a Meta paging URL:

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

List top-level comments. This does not promise a complete reply tree:

```bash
curl -s -X POST http://localhost:3000/v1/actions/instagram.list_media_comments \
  -H 'content-type: application/json' \
  -d '{"input":{"mediaId":"<INSTAGRAM_MEDIA_ID>","limit":25}}'
```

Get media insights. Meta validates which metric, period, and breakdown combinations apply to the
selected media type:

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

Resume a container only when a previous safe error detail includes `resumable: true`. Carousel
child errors include `resumable: false`; those child containers cannot be passed to this variant.
Resuming a publishable container avoids creating a new container and a possible duplicate post:

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

Send a policy-constrained message reply:

```bash
curl -s -X POST http://localhost:3000/v1/actions/instagram.send_message \
  -H 'content-type: application/json' \
  -d '{"input":{"recipientId":"<INSTAGRAM_SCOPED_RECIPIENT_ID>","text":"Thanks for contacting us"}}'
```

The same Action IDs and generated schemas are exposed through the Connector SDK, `oo` CLI, MCP,
and `/openapi.json`; see [Runtime API and MCP](runtime-api.md) and [Developer tools](sdk-cli.md).

## Alternative: Facebook Login Access Token

Newer Meta apps are created with Unified login and no longer offer Business Login for Instagram, so
the OAuth flow above is unavailable for them. The `instagram` provider also accepts an access
token from Instagram API with Facebook Login. This connection reads and writes through
`graph.facebook.com` and needs no OAuth callback, so it works on a local HTTP origin.

You need an Instagram Business or Creator account linked to a Facebook Page, and a token that can
reach that Page:

- a Page access token, or a user or system-user access token that can list the Page;
- `instagram_basic`, `pages_show_list` and `pages_read_engagement`, plus `instagram_manage_comments`,
  `instagram_manage_insights` or `instagram_content_publish` for the matching Actions; and
- for an app in Development mode, the token owner holds a role on the app.

Prefer a long-lived or system-user token. OpenConnector does not refresh a pasted token, and a
short-lived user token stops working after about an hour.

```bash
curl -s -X PUT http://localhost:3000/api/connections/instagram \
  -H 'content-type: application/json' \
  -d '{"authType":"api_key","values":{"apiKey":"<FACEBOOK_LOGIN_ACCESS_TOKEN>"}}'
```

OpenConnector resolves the linked Instagram account from the token. When the token reaches several
Pages that each link an Instagram account, add `"instagramAccountId":"<INSTAGRAM_ACCOUNT_ID>"` to
`values`; the error message lists the candidates. The same Action IDs work for both connection
types, with these differences for a pasted token:

- `send_message` is not available; messaging through Facebook Login goes through the Page, so use
  an OAuth connection for it.
- `get_current_user` omits `accountType` because Facebook Login does not return it.
- Permissions are the Facebook Login names (`instagram_basic`, ...), not the `instagram_business_*`
  names listed in each Action's `requiredScopes`.

## Publishing Boundaries

Instagram fetches publishing media from the supplied URL. Image, video, Reel, carousel child, and
cover URLs must therefore be publicly reachable HTTP or HTTPS URLs. OpenConnector rejects
loopback, private, link-local, reserved, and cloud-metadata targets before sending the URL to Meta.
Do not place credentials or sensitive signed data in example URLs or logs.

The provider supports images, feed videos, Reels, and carousels containing 2 through 10 images or
videos. Stories are not supported. Video and carousel publishing creates Meta media containers and
polls their processing status at most once per minute for at most five minutes. A timeout or
terminal processing error includes the safe container ID when available.

Container creation and `media_publish` are external mutations. OpenConnector does not
automatically retry them after an ambiguous transport failure because Meta may have accepted the
request. Inspect the error and account state first; resume with `kind: "container"` only when the
error marks that container `resumable: true`. A successful publish is not rolled back if the optional follow-up
metadata read fails.

## Comment And Messaging Boundaries

`create_comment` creates a top-level comment on owned media. Instagram live-video comments are not
supported; Meta's error is returned as a provider failure. `reply_to_comment` replies to an explicit
comment ID. Neither mutation is automatically retried after an ambiguous transport failure.

`send_message` is a reply Action, not an inbox or cold-outreach tool:

- the recipient must have initiated the conversation with the connected professional account;
- a normal automated reply must be sent inside Meta's current messaging window, generally 24
  hours after the user's message;
- `recipientId` is an Instagram-scoped ID, not a username;
- callers normally obtain that ID through their own Meta webhook integration;
- text is limited to 1,000 UTF-8 bytes;
- group messaging, unsolicited messages, bulk outreach, inbox synchronization, recipient
  discovery, and inbound webhook handling are not supported; and
- required automated-experience disclosure and all applicable legal obligations remain the
  operator's responsibility.

OpenConnector does not automatically retry a message send after an ambiguous transport failure
because Meta may already have delivered it.

## Platform, Privacy, And Data Handling

This provider uses the official Instagram API with Instagram Login and `graph.instagram.com`. It
does not support Instagram Basic Display, personal accounts, scraping, public-account harvesting,
hashtag or Explore browsing, arbitrary-user lookup, follower/following enumeration, ads, commerce,
stories, cold outreach, bulk messaging, or inbound webhooks.

Meta rate limits and permission checks still apply. Request only the permissions you need, protect
the runtime database and encryption key, avoid retaining Instagram data longer than necessary, and
follow the Meta Platform Terms, privacy requirements, and any laws that apply to your use case.
