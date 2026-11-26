# Instagram OAuth And Actions

This guide connects OpenConnector directly to Meta's official Instagram API with an OAuth
application that you own. OpenConnector does not provide a shared Meta app for this flow. The
provider supports Instagram Business and Creator accounts only.

## Choose a login setup

Use **Unified Login** for a Meta app configured with the **Manage messaging & content on Instagram**
use case. The app must belong to a business portfolio and use Facebook Login for Business. Create
or select a configuration marked **Instagram Login Compatible**, then copy its `config_id`.
Use the **Meta App ID and App Secret**, rather than the Instagram app credentials. An Instagram
professional account does not need a linked Facebook Page for this flow.

Existing **Instagram Login** apps remain supported with their Instagram App ID and App Secret.
Omitting `loginMode` keeps this original flow. Both OAuth setups need a public HTTPS callback.

Standard Access supports testing with accounts that hold the required app roles. Serving other
clients requires Live mode and Advanced Access to the applicable permissions through App Review.
Meta decides whether each API request is allowed; the runtime displays the actual reported grants
and does not reject reduced or unfamiliar scope lists locally.

Official setup and protocol references:

- [Unified Login setup](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started)
- [Unified Login authentication and token lifecycle](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/authentication)
- [Unified Login permissions](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/permissions)
- [Business Login for Instagram](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login)

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

## 2. Save the OAuth app

For Unified Login, save the Meta app credentials and configuration ID:

```bash
curl -s -X PUT http://localhost:3000/api/oauth/configs/instagram \
  -H 'content-type: application/json' \
  -d '{"clientId":"<META_APP_ID>","clientSecret":"<META_APP_SECRET>","extra":{"loginMode":"unified","configId":"<CONFIG_ID>"}}'
```

Choose permissions in the Meta configuration, including `instagram_basic` for profile and media
reads and `instagram_manage_insights` for media insights. Unified Login uses `config_id` instead of
a URL `scope` parameter; `requestedScopes` does not override that configuration.

For an existing Instagram Login app, save its Instagram credentials:

```bash
curl -s -X PUT http://localhost:3000/api/oauth/configs/instagram \
  -H 'content-type: application/json' \
  -d '{"clientId":"<INSTAGRAM_APP_ID>","clientSecret":"<INSTAGRAM_APP_SECRET>","extra":{"loginMode":"instagram"}}'
```

Instagram Login requests `instagram_business_basic`, `instagram_business_manage_comments`,
`instagram_business_manage_insights`, `instagram_business_content_publish`, and
`instagram_business_manage_messages` by default. Supply `requestedScopes` to choose the permissions
sent to Instagram, for example `["instagram_business_basic"]` for profile and media reads.

Changing the default app affects new authorizations. Authorizations started after this update
retain the app configuration used at consent time for their callback and subsequent renewal.
Existing Instagram Login connections continue to use Instagram's token refresh protocol after
the default app switches to Unified Login; they are not converted to Unified Login connections.

## 3. Authorize A Professional Account

Start authorization:

```bash
curl -s -X POST http://localhost:3000/api/oauth/authorizations \
  -H 'content-type: application/json' \
  -d '{"service":"instagram"}'
```

Open the returned `authorizationUrl`, complete the selected login flow, and let Meta redirect to the
registered callback. Confirm that the stored connection identifies the Instagram account by its
username and professional-account ID:

```bash
curl -s http://localhost:3000/api/connections
```

### Unified Login account selection and lifetime

OpenConnector discovers shared Instagram accounts using `/me/assigned_instagram_accounts` and
selects the only account automatically. If several accounts are shared, the error lists their
IDs. Add `instagramAccountId` to the OAuth app's `extra` fields alongside `loginMode` and `configId`,
then start a new authorization. The chosen ID must belong to the accounts returned by Meta.
There is no post-consent account picker.

For separate named connections, the authorization endpoint also accepts a `clientConfig` scoped
to that authorization when custom OAuth clients are enabled. Put the app credentials and
`extra.instagramAccountId` there to select an account without changing the default configuration.
Otherwise, set the default account selection before starting each named connection. A completed
connection retains its own selection.

Unified Login returns a Business Integration System User access token. OpenConnector checks that
it belongs to your Meta app and stores its business ID, selected account and provider-reported
expiration. The expiration depends on the Meta configuration; a non-expiring token can still be
revoked. This integration does not automatically renew Unified Login tokens through Meta's
Business Integration System User Access Token Management API. Reauthorize when the token expires
or the authorization is removed. No Instagram refresh request is sent for these connections.

### Existing Instagram Login lifetime

Instagram Login first returns a short-lived token, normally valid for about one hour.
OpenConnector exchanges it for a long-lived token before storing the connection. The long-lived
token is normally valid for about 60 days. When an Action resolves a token near or after its
stored expiry, OpenConnector uses Instagram's access-token refresh flow. A connection that remains
unused beyond Meta's actual token lifetime may require reauthorization.

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

## Alternative: pasted access token

The provider also accepts pasted Unified Login or Facebook Login access tokens. These connections
use `graph.facebook.com` and need no OAuth callback, so they work on a local HTTP origin.

- A Unified Login token discovers the shared professional accounts through
  `/me/assigned_instagram_accounts`; no Facebook Page is required.
- A Facebook Login Page token, or a user/system-user token that can list Pages, resolves
  `instagram_business_account` from its accessible Pages. Page discovery needs the applicable
  `pages_show_list` and `pages_read_engagement` permissions.
- Both use `instagram_basic`, plus `instagram_manage_comments`, `instagram_manage_insights` or
  `instagram_content_publish` for the matching Actions.

Prefer a long-lived or system-user token. OpenConnector does not refresh a pasted token, and a
short-lived user token stops working after about an hour.

```bash
curl -s -X PUT http://localhost:3000/api/connections/instagram \
  -H 'content-type: application/json' \
  -d '{"authType":"api_key","values":{"apiKey":"<FACEBOOK_LOGIN_ACCESS_TOKEN>"}}'
```

When the token reaches several Instagram accounts, add
`"instagramAccountId":"<INSTAGRAM_ACCOUNT_ID>"` to `values`; the error message lists the candidates.
An ID cannot bypass account discovery or grant access to an unshared account.

## Action support by login setup

All existing Action IDs and input/output schemas remain the same.

| Actions                                                     | Instagram Login permissions                     | Unified Login / pasted-token permissions |
| ----------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------- |
| `get_current_user`, `list_media`, `get_media`               | `instagram_business_basic`                      | `instagram_basic`                        |
| `list_media_comments`, `create_comment`, `reply_to_comment` | Basic plus `instagram_business_manage_comments` | Basic plus `instagram_manage_comments`   |
| `get_media_insights`                                        | Basic plus `instagram_business_manage_insights` | Basic plus `instagram_manage_insights`   |
| `publish_media`                                             | Basic plus `instagram_business_content_publish` | Basic plus `instagram_content_publish`   |
| `send_message`                                              | Basic plus `instagram_business_manage_messages` | Not supported by this integration        |

The catalog's `requiredScopes` describes Instagram Login. For Unified Login and pasted tokens,
use the corresponding permissions above; the two families are alternatives, not a combined list
of required grants. Granted permissions are displayed as reported by Meta.

Unified Login and pasted-token `get_current_user` address the selected Instagram account by ID and
omit `accountType` when Meta does not return it. Unified Login supports messaging at the platform
level, but this provider's `send_message` currently requires Instagram Login OAuth.

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

This provider uses Meta's official Instagram APIs on `graph.instagram.com` and `graph.facebook.com`. It
does not support Instagram Basic Display, personal accounts, scraping, public-account harvesting,
hashtag or Explore browsing, arbitrary-user lookup, follower/following enumeration, ads, commerce,
stories, cold outreach, bulk messaging, or inbound webhooks.

Meta rate limits and permission checks still apply. Request only the permissions you need, protect
the runtime database and encryption key, avoid retaining Instagram data longer than necessary, and
follow the Meta Platform Terms, privacy requirements, and any laws that apply to your use case.
