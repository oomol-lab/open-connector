# Asana Core Actions Expansion Design

## Summary

Expand the Asana provider from its current ten workspace, project, and task actions into a
resource-oriented catalog covering the REST API used for everyday collaboration. The provider
will expose locally executable, strongly described actions for workspaces, users, teams, projects,
sections, tasks, stories/comments, tags, attachments, custom fields, and applicable custom field
settings.

The official [Asana REST API reference](https://developers.asana.com/reference/rest-api-reference)
and [OpenAPI specification](https://github.com/Asana/openapi) are the source of truth for endpoint
paths, methods, request fields, scopes, pagination, and response envelopes.

## Goals

- Preserve the names and behavior of the ten existing Asana actions.
- Add 91 actions so the selected resource families are substantially complete.
- Include the missing single-story operation requested by the user and the complete task-comment
  lifecycle: get, list, create, update, and delete.
- Make every catalog action locally executable with the existing personal access token
  authentication.
- Declare provider-native Asana scopes and useful schemas for agent discovery.
- Keep definitions pure and executor loading lazy.
- Support both transit-file and external-URL attachment uploads safely.

## Non-goals

- Adding OAuth authentication in this change.
- Covering enterprise or service-account APIs such as audit logs, organization exports, AI Studio,
  or access requests.
- Covering goals, portfolios, time tracking, status updates, templates, webhooks, events, batch
  requests, rules, rates, roles, allocations, budgets, or other specialized resource families.
- Adding a generic raw REST request action as a substitute for cataloged operations.
- Copying or generating provider schemas from Asana's OpenAPI document.

## API Coverage

The implementation will cover the following official resource groups. Counts refer to official
REST operations, not source files.

| Resource group        | Coverage                                                         |
| --------------------- | ---------------------------------------------------------------- |
| Workspaces            | All 6 operations                                                 |
| Users                 | All 8 operations                                                 |
| Teams                 | All 7 operations                                                 |
| Projects              | 19 of 20 operations; exclude `saveAsTemplate` with template APIs |
| Sections              | All 7 operations                                                 |
| Tasks                 | All 27 operations                                                |
| Stories/comments      | 5 task/general operations; exclude the 2 goal-story operations   |
| Tags                  | All 8 operations                                                 |
| Attachments           | All 4 operations                                                 |
| Custom fields         | All 8 operations                                                 |
| Custom field settings | Project and team settings; exclude portfolio and goal settings   |

This produces 101 covered operations, ten of which already exist, for 91 new actions. These counts
use the official OpenAPI specification reviewed on July 27, 2026.

## Module Design

The current `actions.ts` and `executors.ts` are already near the practical size limit for ten
actions. Expanding them in place would create multi-thousand-line files, so responsibilities will
be split by resource.

- `src/providers/asana/schemas.ts` owns shared Asana resource and input schemas.
- `src/providers/asana/actions-*.ts` files own action definitions for one resource family.
- `src/providers/asana/runtime.ts` owns the HTTP protocol, response-envelope parsing, pagination,
  error mapping, and common request builders.
- `src/providers/asana/runtime-*.ts` files own handlers and request-body mapping for one resource
  family.
- `src/providers/asana/executors.ts` owns credential validation, context creation, and composition
  of the resource handler records.
- `src/providers/asana/definition.ts` composes the resource action arrays directly from their
  concrete modules.

No barrel file, generated provider schema, provider-local action-name union, tuple builder, or
executor import from `definition.ts` will be introduced.

## Action Contracts

Action names use the repository's existing `snake_case` convention and Asana's official resource
terms. Story actions will use names such as `get_story`, `list_task_stories`, and
`create_task_story`; their descriptions will explicitly say that task stories include comments so
comment-oriented discovery remains clear.

Inputs use camelCase like the existing provider and are translated to Asana's snake_case wire
fields by resource handlers. Shared inputs include:

- non-empty string GIDs;
- `limit`, `cursor`, and `includeFields` pagination/output controls;
- documented enums, dates, timestamps, arrays, and mutation fields;
- `anyOf` constraints when a mutation requires at least one changed field or mutually exclusive
  representations.

Outputs keep Asana's documented snake_case fields. Resource schemas describe stable fields and
remain open to extra fields requested through `includeFields`. Flexible nested values such as
custom field values remain explicitly loose rather than weakening the complete top-level output.

List actions return a named resource array plus `nextCursor`. Single-resource actions return a
named object. Mutations return the created or updated resource. Deletes and association removals
that return an empty data record normalize to `{ "success": true }`.

Each action declares the official Asana `requiredScopes` value when the endpoint has one. Personal
access tokens continue to work as bearer tokens; the scope metadata is for accurate catalog
discovery and future OAuth compatibility.

## Runtime Data Flow

1. The shared provider loader validates action input against the catalog schema.
2. The Asana executor resolves the personal access token and supplies the SSRF-guarded fetcher,
   cancellation signal, and transit-file store.
3. A resource handler validates cross-field rules, converts names and values to Asana's wire
   format, and invokes the shared Asana runtime.
4. The runtime builds a URL under `https://app.asana.com/api/1.0`, applies query parameters, wraps
   JSON mutations in Asana's `{ "data": ... }` envelope, and sends the request.
5. The runtime parses the response envelope and the handler normalizes it to the action output.

The hardcoded Asana origin will remain the only provider egress origin. The injected guarded
fetcher will continue to validate requests and redirects. No global `fetch` call will be added.

## Attachments

The create-attachment action accepts exactly one of:

- a transit `fileId`, read through the runtime's transit-file store and uploaded as
  `multipart/form-data`; or
- a public external URL, sent using Asana's external-resource attachment mode.

Transit files must respect both the local transit store limit and Asana's documented 100 MB
attachment limit. External URLs will be normalized and checked with the shared public-only URL
validator before being sent to Asana. Credentials, loopback, private, link-local, and cloud
metadata targets will be rejected. Attachment download URLs returned by Asana are response data;
this change will not download them into the local runtime.

## Errors and Pagination

The runtime will preserve useful Asana error messages and map:

- malformed input to HTTP 400;
- missing or invalid execution credentials to HTTP 401;
- provider permission failures to HTTP 403;
- missing caller-supplied resource IDs to stable invalid-input errors where existing behavior
  already does so;
- rate limiting to HTTP 429 without automatically retrying writes;
- transport failures and malformed provider responses to HTTP 502;
- cancellation/timeout failures to HTTP 504.

Offset pagination remains cursor-based in the public contract. The outgoing `offset` is read from
`cursor`, and `next_page.offset` becomes `nextCursor`, or `null` when no next page exists.

## Testing

Implementation follows test-driven development. Table-driven runtime tests will invoke real
resource handlers with a recording fetcher and verify behavior rather than static action labels.
Coverage will include:

- representative and parameter-sensitive method/path/query/body mappings for every resource
  module;
- every special operation shape such as association mutations, search, duplicate, and reorder;
- JSON response normalization, pagination, empty deletion responses, and Asana error extraction;
- cross-field mutation validation;
- transit multipart upload, missing transit storage, file-size rejection, and public URL
  validation.

Pure catalog labels, auth arrays, and generated catalog JSON will not receive provider-local tests.
No example is added because this change does not create a new user workflow beyond the existing
provider execution interface.

## Verification and Delivery

After implementation:

1. Run targeted Asana runtime tests during each red-green cycle.
2. Run `npm run generate:catalog`.
3. Run `npm run fix-check`.
4. Run `npm test`.
5. Run `npm run build` for CI-parity type checking.
6. Review the complete diff for generated noise, accidental API families, unsafe egress, loose
   top-level schemas, and eager executor imports.
7. Build the current source into the local `ghcr.io/oomol-lab/open-connector:latest` image.
8. Replace only the `connector` service in the existing `open-connector` Compose project at
   `/Users/yangli/Desktop/jerry/open-connector`, preserving its named data volume, environment,
   network, DNS sidecar, and port configuration.
9. Wait for Docker health to become `healthy`, verify `GET http://127.0.0.1:3100/health`, and verify
   the running container uses the newly built image ID. Keep the previous image tagged locally for
   rollback until the replacement is verified.
10. Commit implementation in coherent resource groups, push the feature branch, and open a pull
    request summarizing action coverage, Docker replacement evidence, and exact verification
    evidence.
