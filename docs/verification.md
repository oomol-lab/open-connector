# Verification

Catalog coverage, local execution, and external API verification are separate states.

When documenting a provider, distinguish:

- Catalog-only actions: schemas and metadata are available for discovery.
- Locally executable actions: the open source runtime has an executor for the action.
- Verified coverage: maintainers have current evidence that the action or provider works against the real upstream API.

Do not imply that every catalog action is end-to-end verified unless that evidence is available in
public project artifacts. Prefer verification notes that users can reproduce from this repository,
such as example scripts, smoke tests, or public status pages.

## Runtime execution timings

When a runtime logger is configured, each HTTP request emits `runtime request completed` with
the method, query-free path, response status, cancellation state and a `timings` object. Transit
file paths are logged as `/api/files/:fileId` to avoid exposing download capabilities. The
runtime-generated `timings.requestId` also appears as `requestId` in the Action start and completion
logs, allowing the request and its execution to be correlated. Completion logs include failed and
cancelled requests. Timings do not record request headers, bodies or credential values.

`timings.totalMs` uses a monotonic clock from the request middleware's entry until the handler has
produced its response, including authentication, policy loading, response construction and audit
persistence. It excludes application startup and downstream consumption of a streamed response.
Direct ActionRunner calls with a logger start their own timing scope. The existing Action
`durationMs` retains its execution-before-audit meaning; `timings.totalMs` includes the audit wait.

Only completed or failed stages that were entered appear under `timings.phases`:

| Field             | Measured work                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `authMs`          | Credential verification, access checks and authentication cookie work.                            |
| `policyMs`        | The request's policy snapshot load and compilation.                                               |
| `schemaMs`        | Action schema loading, validator compilation when needed and input validation.                    |
| `credentialMs`    | Execution target selection, connection authorization and credential resolution.                   |
| `oauthRefreshMs`  | OAuth refresh and persistence, or waiting for an already running refresh.                         |
| `saasDiscoveryMs` | Reading or waiting for cached or fresh SaaS capability discovery.                                 |
| `executorLoadMs`  | Loading the Action or proxy executor.                                                             |
| `providerMs`      | Executor or remote invocation, including admission waits, upstream calls and response processing. |
| `auditMs`         | Action audit persistence and its retention cleanup, including failed writes.                      |

Repeated calls add to their phase. Phases can overlap: `oauthRefreshMs` is part of `credentialMs`,
execution's `saasDiscoveryMs` is part of `providerMs`, and concurrent invocations in one request
can overlap each other. Do not sum all phases to derive
total latency. Request timing snapshots remain independent of later asynchronous work.

## Local execution benchmark

Run a fixed workload without external accounts or upstream network access:

```bash
node scripts/benchmark-runtime-execution.ts
```

The benchmark measures authenticated requests against a temporary SQLite database,
covering successful calls, upstream failures, invalid input and cancellation.
It uses a simulated provider and removes its temporary databases when finished.

The output reports P50/P95 response latency, handler and phase timings, and
service/store operation counts. These counts are not SQL query counts.

Compare runs on the same machine and runtime version. Results measure a warmed-up
local runtime; they exclude real provider latency, network setup and logging I/O.
Use them to investigate performance, not as CI pass/fail thresholds.
