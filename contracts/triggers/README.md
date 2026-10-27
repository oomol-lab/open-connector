# Trigger operation conformance

This directory owns shared behavioral cases for registered Trigger operations. The suite uses only Node built-ins and an adapter returning HTTP `Response` objects. A backend adapter supplies its production request parser, dispatch and subscription implementation, with deterministic upstream responses. It must not implement provider normalization, signatures, checkpoint transitions or retry behavior itself.

Run the OpenConnector adapter with dependencies installed:

```sh
node contracts/triggers/run.ts src/server/trigger-conformance-adapter.ts
```

Other backends run the same `run.ts` with their own adapter path and a TypeScript-capable runtime. Select the conformance checkout explicitly and pin its Git revision in automation; do not silently fetch a moving branch. The cases are versioned with this repository. They are not a new wire protocol version or a separately published npm package.

`conformance.ts` exports the adapter contract. `request` must pass JSON to the registered operation endpoint and return its actual response. Its optional `owner: "other"` argument selects another authenticated owner with the same Trigger permission, so shared cases can verify reference isolation. `disconnect` removes or invalidates the Slack connection while retaining the authenticated owner, to verify credential-independent deletion. `close` releases owned resources. The upstream callback supplies only provider HTTP results. Unexpected upstream calls must fail instead of accessing the network.

The cases cover:

- Source reference creation, reads, no-op edits and deletion for Feishu, Slack, Intercom, Sentry, Zoom, Fireflies and Jira.
- Jira resource preparation without exposing remote configuration, recovery after a lost registration response, and cleanup before Source deletion.
- Asana candidate handshakes while upstream creation is in progress, without waiting on the subscription lease.
- Unsupported operations, invalid configuration and invalid checkpoints rejected before upstream side effects.
- Source deletion after the connection disappears, with cross-owner rejection and idempotent retry.
- Persistent Slack Source edits with revision conflicts, no-op retries, shared verification invalidation on secret changes and verification with the replacement secret.
- Persistent Slack Source creation and retry, secret-free public reads, shared application verification, cross-owner reference rejection, configured event filtering, idempotent deletion and last-source secret release.
- Slack source initialization, challenge readiness, raw-byte signatures, workspace/application/bot routing, consumer filters and stable event identity on retry. This covers the existing stateless source protocol, not persisted application ownership or shared secret rotation.
- Tally configuration options across pages, including Unicode.
- Tally lost creation response recovery, opaque subscription identity, callback correlation and signatures, stable event identity on retry, immutable subscription configuration and cleanup retry.
- GitHub Watch PR baseline, stable observation identities, replay without checkpoint advancement, checkpoint restoration by a new client, repeated state transitions and upstream error classification.

The version-field rejection case verifies strict input parsing only. It does not establish negotiated protocol compatibility: current requests have no protocol or definition version handshake. Before adding one, define its accepted versions and rejection boundary explicitly.

The suite does not prove exactly-once Runs, persistent database recovery, deployment authorization, real-provider delivery, or publication switching. Those behaviors belong to deployment and backend integration tests. An in-memory adapter must not claim to establish durable restart behavior.

For OpenConnector, the suite also runs under the existing Vitest test command through `src/server/trigger-conformance.test.ts`.

## Consumer compatibility

The new `sourceReference` operation persists provider configuration, secrets and resource
state in Connector. Existing stateless `source` requests remain supported. Deploy the
SQLite/D1 or PostgreSQL `0019_trigger_sources.sql` migration with the Connector update
before switching consumers to references. A Source with active or uncertain resources must
complete resource cleanup before deletion.

Poll catalog definitions retain `definitionVersion: 2` and the `events` array output.
The `read` operation returns an event sequence and checkpoint. Consumers preserve batch
delivery: all fresh events from a page belong to one Run. Source ownership changes do not
change Poll execution granularity or require output remapping.

Integration catalog entries declare required callback headers and query parameters.
Creation callback URLs include the persisted subscription reference and callback nonce;
the receiving consumer must forward both without treating a handshake as a production event.
