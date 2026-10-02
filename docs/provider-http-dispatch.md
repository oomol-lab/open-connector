# Provider HTTP dispatch hooks

Embedding hosts can opt into admission for individual provider HTTP attempts with
`createConnectorRuntime({ ..., providerHttpDispatch })` or
`createConnectApp({ ..., providerHttpDispatch })`. The hook is disabled when the
option is absent. It applies to shared provider fetchers, including module-level
fetchers, and survives rewrapping a fetcher with a different egress policy.

```typescript
const providerHttpDispatch = {
  async bindAuthority(context) {
    return { workspaceId: hostWorkspaceId, connectionLineageId: await lineageFor(context.connectionId) };
  },
  async beforeAttempt(attempt, signal) {
    const permit = await arbiter.admit(attempt, signal);
    if (!permit.allowed) return { allow: false, retryAfterSeconds: permit.retryAfterSeconds };
    return {
      allow: true,
      onDispatch: () => arbiter.commitDispatch(attempt.attemptId),
      onResult: (result) => arbiter.recordResult(attempt.attemptId, result),
    };
  },
};
```

The arbiter and identity resolver belong to the host. Open Connector does not
provide a scheduler, budget store, default rate policy, or durable settlement and
recovery protocol. Workspace/account mapping, priorities and fairness also remain
host responsibilities.

## Admission and denial

`beforeAttempt` may wait to delay a request or return `allow: false` to deny it.
A denial becomes `rate_limited` / HTTP 429, with `Retry-After` when the hook
provides a nonnegative safe integer `retryAfterSeconds`. Authority-binding,
admission and dispatch-commit failures fail closed with the same sanitized denial.
Callback error strings are never exposed to clients.

The runtime retains an invocation-local denial marker, so provider-specific error
mapping cannot turn admission denial into invalid credentials or an upstream
failure. Denial is terminal for that invocation: retries, fallbacks and concurrent
siblings that have not yet dispatched cannot send subsequent requests.
Independent explicit invocations have independent markers.

**A rejected HTTP attempt does not establish that an entire action is safe to
retry.** Earlier requests in a multi-request action may already have produced side
effects. A later denial cannot undo them; the caller must choose a replay policy
based on the operation's idempotency.

Each attempt has a unique `attemptId`. Each fetch invocation has a `requestId`,
shared by its redirect hops, with `redirectHop` starting at zero. A provider's
internal HTTP retry is another fetch invocation and requires another admission.
Followed redirects are admitted individually with the actual origin and rewritten
method. A fetch using `redirect: "manual"` admits only its initial HTTP attempt.

Admission runs after the initial URL/DNS guard. After admission and dispatch
commitment, the guard runs again before egress because queued work may wait long
enough for DNS answers to change. Existing private-network policy, redirect checks
and cross-origin credential stripping remain in force.

## Identity

The frozen context contains allowlisted runtime-owned operation, catalog service
and action, execution ID, and resolved connection ID and stored connection name
when available. Connection identity is not copied from action input or incoming
request headers. Credentials, profile metadata, URL paths/queries, request
headers/bodies and response bodies are absent.

`bindAuthority` receives that context and may resolve host-owned authority. Its
frozen output copies only `workspaceId`, `connectionLineageId` and `workClass`.
New-connection validation and initial OAuth exchange may have no established
connection identity. The request's outer fallback scope has operation `runtime`.
A host requiring stricter identity must deny unknown contexts.

These IDs identify the resolved connection; they do not attest a credential
revision or fence authorization changes. Existing credential mutability, OAuth
refresh/single-flight, connection-store APIs and Trigger ownership behavior are
preserved when admission is enabled.

## Result feedback

`onDispatch` is awaited before transport starts. A host can persist its dispatch
commitment there; failure prevents egress. Admission and commitment should honor
the cancellation signal and use bounded callbacks.

`onResult` starts exactly once for each returned permit, including a late permit
after queued cancellation. It receives a frozen result:

- `response`: status and the response's `Retry-After` header. This observes response
  headers, not body completion or completion of an upstream business operation.
- `transport_error`: transport failed after dispatch started; the request may have
  reached the provider.
- `not_dispatched`: cancellation or failed dispatch commitment/revalidation
  prevented transport from starting.

Feedback is not awaited before returning the response or propagating a transport
error or cancellation. The exact original Response and body behavior are retained.
Feedback failure optionally invokes `onFeedbackError(attempt)` and cannot replace
the transport outcome. The host is responsible for the lifetime and durability of
its asynchronous feedback, and must not treat a returned Response as confirmation
that its bookkeeping has settled.

Queued cancellation returns promptly even if admission ignores the signal. A late
permit receives `not_dispatched`; cancellation after dispatch starts does not
retract the request. `not_dispatched` does not roll back an already-persisted host
commitment. Open Connector does not refund budgets or establish completion,
release a concurrency slot, or select a recovery policy.

## Coverage and standalone use

Coverage is HTTP passing through the shared guarded provider fetch: provider
requests, content downloads, credential validation, OAuth requests and Trigger
proxies. SDK transports that bypass shared fetch, including Alibaba OSS SDK
actions, are outside this hook. Home Assistant WebSockets, MQTT over WebSockets,
and IMAP/SMTP TCP/TLS also remain outside it. Existing transport guards are
unchanged. Platform transit storage, remote SaaS/Marketplace execution and host
control-plane traffic do not acquire local-provider HTTP permits.

Library callers can use `withProviderHttpDispatch(context, run, options)` from
`src/core/provider-http-dispatch.ts` around standalone provider fetches. Nested
scopes inherit the hook and replace identity; concurrent scopes remain isolated.
Use `runWithProviderHttpDispatch` at an asynchronous invocation boundary when the
called library may catch and remap transport errors: it retains the original
sanitized admission denial even when the library returns a converted error result.

Hosts should use their own control-plane transport for arbiter RPCs rather than
recursively calling provider fetchers from a hook. The scope uses
`AsyncLocalStorage.run/getStore`, available on Node, Bun and Workers with the
repository's `nodejs_compat` configuration.
