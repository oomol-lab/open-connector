# Channel Event Verification

This page describes how OpenConnector verifies inbound chat channel events and how to add a new channel. For deployment setup and the per-channel request and response formats, see [Configuration](configuration.md#channel-event-verification).

## What the route does

A chat platform such as Slack, Microsoft Teams or Feishu delivers events to an ingress service that you run. The ingress forwards the original request to OpenConnector, which proves that the request came from the configured application and returns the trusted identity:

```text
Chat platform ──► your ingress ──► POST /v1/providers/{service}/events/verify ──► verified identity
                       │                (dedicated bearer token)
                       └──► reply to the platform, deduplicate, schedule work
```

The route is stateless. It never stores, deduplicates, retries or schedules an event; the ingress owns those steps. A URL verification challenge is returned to the ingress, which sends the reply to the platform.

## Verify route or Trigger source

A channel can also have a Trigger fed by a shared event Source, the stateful path. The host creates a Source for the Bot connection with the Trigger's `sourceReference` operation, points the platform at the Source's callback URL, and forwards each delivery to the Source's `receive` operation. Connector verifies the delivery, normalizes it, matches the subscribed consumers and returns an event with a stable `deliveryId` for deduplication. The host still acknowledges the platform; see [Provider Triggers](runtime-api.md#provider-triggers).

| Service               | Verify route                                           | Trigger                           |
| --------------------- | ------------------------------------------------------ | --------------------------------- |
| `slackbot`            | `POST /v1/providers/slackbot/events/verify`            | `slackbot.on_event`               |
| `microsoft_teams_bot` | `POST /v1/providers/microsoft_teams_bot/events/verify` | `microsoft_teams_bot.on_activity` |
| `feishu_app_bot`      | `POST /v1/providers/feishu_app_bot/events/verify`      | `feishu_app_bot.on_event`         |

Both paths of a channel import one protocol module, so they accept and reject the same requests. The Teams Trigger reads the activity's own `Authorization` header from the forwarded headers, because Connector's own authentication travels outside them. The verify route instead reads it from `X-Botframework-Authorization`.

## Architecture

| Module                                                                                            | Owns                                                                                                    |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/server/api/event-verification-routes.ts`                                                     | The dedicated bearer token, credential lookup, the body limit, and rejection reason → HTTP status/code. |
| `src/server/event-verification/contract.ts`                                                       | The `ChannelEventVerifier` interface between the route and a channel.                                   |
| `src/server/event-verification/registry.ts`                                                       | The list of verifiable channels, loaded lazily. Routes and the auth exemption are derived from it.      |
| `src/server/event-verification/request-body.ts`                                                   | Reading raw request bytes within the shared 64 KiB limit.                                               |
| `src/server/event-verification/<service>.ts`                                                      | One channel's protocol: credential fields, signature/token checks, decryption, and its success payload. |
| `src/triggers/signature.ts`, `src/triggers/sources/*-signature.ts`, `*-envelope.ts`, `*-token.ts` | Signature, envelope and token primitives shared with the Trigger sources of the same channel.           |

Each channel is a small adapter. It does not handle HTTP, the bearer token, the body limit, error codes or connection selection. Those parts are shared and are written once.

The route handles a request in this order. The order decides which error the caller sees first:

1. **Token.** `404 event_verification_disabled` when `OOMOL_CONNECT_EVENT_VERIFY_TOKEN` is unset. `401 unauthorized` for a missing or wrong token. Admin and runtime tokens are never accepted.
2. **Credential.** The route reads the verifier's `credentialScope` and loads the credential from that place. Then it calls `readCredential`. A selector that matches no connection returns the connection error, for example `404 connection_not_found`. A credential that `readCredential` cannot use returns `409 event_verification_not_configured`.
3. **Body.** The route reads the raw bytes. More than 64 KiB returns `413 webhook_request_too_large`.
4. **Verify.** The route calls the channel verifier. A verified result is returned unchanged in the runtime envelope. A rejection is mapped through one shared table:

| Reason           | HTTP | errorCode                        |
| ---------------- | ---- | -------------------------------- |
| `payload`        | 400  | `invalid_event_payload`          |
| `signature`      | 401  | `invalid_webhook_signature`      |
| `timestamp`      | 401  | `invalid_webhook_timestamp`      |
| `app`            | 403  | `webhook_app_mismatch`           |
| `body_too_large` | 413  | `webhook_request_too_large`      |
| `unavailable`    | 502  | `event_verification_unavailable` |

### Credential scope

The channel's protocol decides where the verification secret lives. The caller never supplies it:

- **`connection`**: credential values on the Bot connection selected the way Actions select one, by `X-OO-Connector-App-Id` or by an alias in `X-OO-Connector-Alias`. An unknown selector never falls back to another connection. Use this scope when the app and the bot connection are one-to-one, for example a Feishu custom app or a Teams bot.
- **`application`**: the deployment-default OAuth application configuration. Use this scope when one application is installed into many workspaces and signs every delivery with the same app-level secret. The connection is then unknown until the request has been verified. Slack works this way: the Signing Secret belongs to the Slack App, not to any workspace installation.

### Current channels

| Service               | Scope       | Scheme                                                                       | Body authenticated    |
| --------------------- | ----------- | ---------------------------------------------------------------------------- | --------------------- |
| `slackbot`            | application | `v0` HMAC-SHA256 over `v0:timestamp:body`, 300 s window                      | yes                   |
| `microsoft_teams_bot` | connection  | Bot Framework RS256 JWT: issuer, audience, expiry, `serviceUrl`, endorsement | no, only `serviceUrl` |
| `feishu_app_bot`      | connection  | SHA-256 over `timestamp + nonce + encryptKey + body`, optional AES-256-CBC   | yes                   |

A Teams token authenticates the sender but does not sign the activity body. Fields of a Teams activity other than `serviceUrl` are unauthenticated content.

## Adding a channel

1. **Credential fields.** Add the verification fields to the provider's `definition.ts`, for example a signing secret or an encrypt key. For connection scope, add them to the credential fields. Set `required` and `secret` per field: a secret used only for event verification is optional and secret, so ordinary actions keep working without it, while an identifier such as an app ID is not secret and may already be required. For application scope, add them as `clientConfigFields`. Then run `npm run generate:catalog`.
2. **Protocol primitives.** If the channel also has a Trigger source, put the signature and envelope code where both paths can import it, as `src/triggers/sources/slack-signature.ts`, `feishu-envelope.ts` and `teams-bot-token.ts` do. A channel with two separate copies of its protocol will drift. Reuse `src/triggers/signature.ts` (`sameSecret`, `verifyHexHmac`, `verifyBase64Hmac`) instead of writing another comparison or HMAC.
3. **Verifier.** Create `src/server/event-verification/<service>.ts`. It exports a `ChannelEventVerifier`, which needs:
   - `credentialScope`.
   - `readCredential`, which returns `undefined` unless every field it needs is present.
   - `messages.notConfigured`, which names the fields to configure.
   - `verify`, which reads the provider headers from `request.headers` and checks `request.rawBody`. It returns `{ verified: true, result }` or a rejection reason with a provider-worded message. When the protocol authenticates before parsing, parse the body only after the signature or token checks out, as Slack and Teams do. When the protocol puts its proof inside the body, the verifier must parse first. Feishu works this way: a `url_verification` challenge may arrive without signature headers, so the verifier decrypts the envelope to compare its verification token, and requires a valid signature for every other event.
   - A catch for infrastructure failures such as unreachable signing keys, returned as `unavailable`. Unexpected errors must still throw.

   Fetch keys or metadata with `createGuardedFetch` from `src/core/guarded-fetch.ts`, never the global `fetch`. Load heavy dependencies with a dynamic `import()`.

4. **Register.** Add one lazy entry to `src/server/event-verification/registry.ts`. The route and the auth exemption follow from that entry. Do not edit `auth.ts` or the route file.
5. **Document.** Add `/v1/providers/<service>/events/verify` to `src/server/api/openapi.ts`, with its headers, success schema and error statuses. A test fails when a served route is undocumented. Add a channel section to [Configuration](configuration.md#channel-event-verification) and a row to the table above.
6. **Test.**
   - Unit tests in `src/server/event-verification/<service>.test.ts` cover a valid event, tampered content, a wrong app, and a missing or forged signature or token. They also cover each check the protocol has. For a signed body, that means a re-serialized body and a stale timestamp. For a URL handshake, it means the challenge. For Teams, it means a `serviceUrl` that does not match the token. Use the provider's published test vectors when they exist.
   - Route tests in `src/server/connect-server.test.ts` cover: disabled token, wrong token, missing configuration, and one successful event.
   - `registry.test.ts` already checks every registered channel: the auth exemption is exact, the verifier fails closed without credentials, and an unsigned request does not echo credential values.

## Rules

- Authenticate only with `OOMOL_CONNECT_EVENT_VERIFY_TOKEN`. Never accept caller-supplied credentials.
- Return only the validated identity and the minimum trusted payload. Never return secrets, raw authorization headers, verification tokens or unrelated credential values.
- Never persist, deduplicate or schedule in a verify route. Trigger sources own the stateful path.
- Keep a channel's success payload and error codes stable once published; SDK clients and ingress services depend on them.
- Choose the timestamp window from the provider's documented retry behavior, and use the same window in the channel's verifier and its Trigger source, or document why they differ.

## Not covered yet

- **GET handshakes.** Some platforms verify a URL with a GET request and query parameters, for example WhatsApp `hub.challenge` and WeCom `echostr`. The route accepts only POST, and `ChannelEventRequest` has no query field. Extend the contract with the first channel that needs this.
- **Multiple applications per channel.** `application` scope reads the single deployment-default OAuth application, so one deployment verifies one Slack App.
- **Shared freshness and replay metadata.** Each channel's success payload reports its own fields. There is no common `bodyAuthenticated` or replay-window field yet.
