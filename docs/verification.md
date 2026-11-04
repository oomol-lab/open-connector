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
the method, query-free path, response status, cancellation state and a `timings` object. The
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

The script creates a fresh temporary SQLite database for each scenario, stores 1,000 encrypted
connections, selects one by ID and uses a persistent runtime token with authentication required.
It warms up with 20 requests, then measures 200 requests at concurrency 1 and 10. Scenarios cover
success, upstream failure, invalid input, cancellation before execution and invalid authentication.
The simulated upstream has a fixed 2 ms timer delay; actual elapsed time includes scheduler delays.
Temporary databases are removed when the script finishes.

Each JSON output line reports P50/P95 latency through consuming the response body, mean handler
time, mean phase times and operation counts. Counts distinguish token lookup, last-use writes,
connection reads and decoding, policy reads, audit additions, executor loading and upstream calls;
these are service/store operations, not raw SQL statement counts. The script asserts that explicit
authentication performs no token-existence queries, that each executing request decodes only its
two selected-connection reads, and that rejected or cancelled requests never reach the upstream.

The fixture catalog and executor are already loaded, and structured logs are captured in memory.
Results exclude real DNS, TLS, provider latency and logging-sink I/O, and do not represent cold
startup or a full audit-history dataset. Compare runs on the same machine and runtime version;
latency values are diagnostic measurements rather than CI pass/fail thresholds.
