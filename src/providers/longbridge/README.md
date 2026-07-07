# Longbridge Connector Testing Guide

The Longbridge provider should be verified at two levels:

- Unit tests check action coverage, schemas, endpoint path/query/body mapping, and `symbol` to `counter_id` conversion.
- Integration checks execute `longbridge.*` actions through a local OpenConnector runtime to verify OAuth, runtime envelopes, OpenAPI requests, and response normalization against the real service.

## Local Static Checks

After changing `actions.ts`, `readonly-action-specs.ts`, `runtime.ts`, or verification samples, run:

```sh
npm test -- src/providers/longbridge/runtime.test.ts src/providers/longbridge/tests/oauth-registration.test.ts
npm run generate:catalog
npm run fix-check
```

`runtime.test.ts` verifies that every action has a handler and asserts the HTTP method, path, query, and body mapping for representative endpoints. `generate:catalog` verifies that the Longbridge action schemas can be emitted into the catalog.

## Start A Local Runtime

The default runtime origin is `http://localhost:3000`. The Longbridge OAuth callback URL is:

```text
http://localhost:3000/oauth/callback
```

Start the local runtime:

```sh
OOMOL_CONNECT_ORIGIN="http://localhost:3000" npm run dev
```

If the runtime is configured with an admin token or runtime token, export them in the same shell:

```sh
export OOMOL_CONNECT_ADMIN_TOKEN="<admin-token>"
export OOMOL_CONNECT_RUNTIME_TOKEN="<runtime-token>"
```

`OOMOL_CONNECT_ADMIN_TOKEN` is used by OAuth client configuration and authorization APIs. `OOMOL_CONNECT_RUNTIME_TOKEN` is used by `/v1/actions/*` calls. Leave them unset when the matching runtime auth is disabled.

## Authorize Longbridge OAuth

Longbridge supports dynamic OAuth client registration, so local verification can create a client on demand:

```sh
node src/providers/longbridge/tests/authorize-oauth.ts --runtime-origin http://localhost:3000
```

The script reads the runtime callback URL, creates a Longbridge OAuth client through `/oauth2/register`, stores it in the local runtime, opens the authorization URL, and waits until the Longbridge connection is ready. To print the authorization URL without opening a browser:

```sh
node src/providers/longbridge/tests/authorize-oauth.ts --runtime-origin http://localhost:3000 --no-open
```

## Batch Verify Actions

After authorization completes, run:

```sh
node src/providers/longbridge/tests/verify-actions.ts --runtime-origin http://localhost:3000 --output longbridge-verification-report.json
```

By default, the script verifies only the newly added Longbridge readonly REST actions. Common options:

```sh
# Verify every Longbridge action, including pre-existing account/order/content actions.
node src/providers/longbridge/tests/verify-actions.ts --runtime-origin http://localhost:3000 --include-existing

# Verify only selected actions.
node src/providers/longbridge/tests/verify-actions.ts --runtime-origin http://localhost:3000 --actions dividend,news,screener_search

# Strict mode: exit non-zero when a successful action returns empty normalized output.
node src/providers/longbridge/tests/verify-actions.ts --runtime-origin http://localhost:3000 --fail-on-empty
```

These helper scripts live under `src/providers/longbridge/tests` because they are provider verification fixtures, not public examples. Sample inputs live in `verification-samples.ts`. If an endpoint depends on a real account, order, screener strategy, or currently available upstream data, update the corresponding sample with a valid value before running the integration check.

## Debug A Single Action

Call one action directly through the runtime API:

```sh
curl -s -X POST "http://localhost:3000/v1/actions/longbridge.dividend" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OOMOL_CONNECT_RUNTIME_TOKEN" \
  -d '{"input":{"symbol":"AAPL.US","page":1,"size":20}}'
```

If runtime token auth is disabled locally, remove the `Authorization` header.

## Interpreting Results

- `OK`: the runtime call succeeded and the normalized output contains non-empty data.
- `EMPTY`: the runtime, OAuth flow, and upstream request succeeded, but the normalized output is empty. Common causes include the selected symbol, date range, market, account state, or current upstream data availability.
- `FAIL`: investigate OAuth authorization, tokens, request parameter mapping, OpenAPI endpoint selection, or response normalization.

When an action returns `EMPTY`, inspect `raw` first to see whether the original Longbridge OpenAPI `data` is empty. If `raw.data` contains data but the normalized output is empty, fix the response mapping in `runtime.ts`. If `raw.data` is empty, update the symbol, date range, or account-related values in `verification-samples.ts`.

The provider converts `symbol` to Longbridge `counter_id` when required. The current converter supports common stock and index symbols only; it does not bundle ETF or WT counter-id lookup data.
