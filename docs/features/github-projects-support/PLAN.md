# Feature PLAN: GitHub Projects (v2) support via the official github-mcp-server

## The One-Line Version

Add GitHub Projects v2 support to the `github` provider by proxying four read-only
`projects_list`/`projects_get` methods to GitHub's own hosted `github-mcp-server`
(`https://api.githubcopilot.com/mcp/`) — reusing the credential the provider already
resolves, and following the MCP-client-wrapper pattern this repo already uses for
`hubspot`, `cloudflare_docs`, `jumpserver`, and `excalidraw_mcp`. Additive only: the
existing 145 REST-backed GitHub actions are untouched.

## Why

GitHub Projects v2 is GraphQL-only — there is no REST API equivalent. The `github`
provider here is REST-API-backed (`src/providers/github/runtime-*.ts`, one file per
resource type: activity, issue, pull-request, release, repository, search), so it has
never been able to cover Projects at all. A JoyStream consumer (a "summarize ticket
movement on a GitHub Project" agent skill) needs exactly this and currently has no path
to it through the connector.

The credential problem rules out working around this by pointing that consumer at a
_separate_, dedicated `github-mcp-server` connection instead of going through this
connector: JoyStream's gateway-routed GitHub connections only ever store a
connector-scoped runtime token, never a raw GitHub OAuth token, so a third-party
MCP server (including GitHub's own) has no usable credential to accept from that path.
Proxying through this connector — which already holds the real GitHub credential per
tenant — is the only option that doesn't reintroduce a raw-token flow.

## Goals

- Cover the four **read-only** Projects v2 operations a "read the board" consumer needs:
  list projects, list project fields, list project items, list project status updates,
  and their single-item `get_*` counterparts.
- Reuse the existing per-tenant GitHub credential this provider already resolves
  (`requireBearerCredential`) — no new credential type, no new connect flow.
- Keep the existing REST-backed `github` provider completely unmodified in behavior —
  this is an addition, not a rewrite.

## Non-Goals

- **Mutations.** `github-mcp-server`'s `projects_write` tool (create/update/delete
  project items, fields, status updates) is out of scope for this pass. The driving
  use case is read-only summarization; adding write access widens blast radius for no
  current consumer. Revisit as a separate proposal if a real write use case shows up.
- **Self-hosting `github-mcp-server`.** Not needed — see "Toolset gating" below; the
  hosted endpoint already exposes what we need via a header.
- **Replacing any existing REST-backed GitHub action** with an MCP-proxied one. Even
  where the two surfaces overlap conceptually (e.g. issues), the existing REST actions
  stay as they are.
- **Fixing the JoyStream-side skill** (`github-project-ticket-summary`'s SKILL.md) that
  motivated this. That's a follow-up in the `joystream` repo, once this ships and the
  new action names/schemas are known — out of scope here.

## Context (verified against the local `github-mcp-server` fork, `~/ws/github-mcp-server`)

### Real tool schemas

Two multiplexed tools, each with a `method` enum (from
`pkg/github/__toolsnaps__/projects_{list,get}.snap`):

**`projects_list`** — `required: [method, owner]`

- `method`: `list_projects | list_project_fields | list_project_items | list_project_status_updates`
- `owner`, `owner_type` (user/org, auto-detected if omitted), `project_number`
  (required for all methods except `list_projects`), `query` (title/state filter for
  `list_projects`; item filter syntax for `list_project_items`), `fields` /
  `field_names` (mutually exclusive; which item fields to return — **without one of
  these, `list_project_items` returns titles only**), `per_page`, `after`/`before`
  (pagination cursors).

**`projects_get`** — `required: [method]`

- `method`: `get_project | get_project_field | get_project_item | get_project_status_update`
- `owner`, `owner_type`, `project_number`, `field_id` (required for
  `get_project_field`), `item_id` (required for `get_project_item`),
  `status_update_id` (required for `get_project_status_update`), `fields`/`field_names`
  (same mutual-exclusion as above, for `get_project_item`).

**`projects_write`** exists (`projects_write.snap`) for mutations — deliberately not
covered here (see Non-Goals).

### Toolset gating — no self-hosting required

`projects` is an **opt-in toolset** (`pkg/github/tools.go`,
`ToolsetMetadataProjects`), not part of the **default** toolset (`context, repos,
issues, pull_requests, users` — `README.md` "default toolset"). This is exactly why
the connector's existing `github/github-mcp-server` catalog row (registered against
the hosted endpoint with no toolset override) never listed `projects_list`/
`projects_get` in its cached tool metadata.

The hosted remote server (`https://api.githubcopilot.com/mcp/`) supports enabling
additional toolsets **per request**, via the `X-MCP-Toolsets` header (`docs/remote-
server.md`: "Comma-separated list of toolsets to enable... equivalent to
`GITHUB_TOOLSETS` env var"). So this needs a header on the MCP client connection —
`X-MCP-Toolsets: default,projects` (or narrower, `X-MCP-Toolsets: projects` if we don't
need the default set for these calls) — not a self-hosted binary.

### Scope gap

`src/providers/github/scopes.ts`'s `githubOAuthScopes` currently requests
`read:user, user:email, repo, workflow, delete_repo` — **no `project` scope**.
GitHub's Projects v2 API (classic OAuth app scopes) needs the `project` scope granted.
This means:

- `githubOAuthScopes` needs `project` added.
- **Existing connected users will not automatically gain it.** OAuth scope grants are
  fixed at consent time — adding a scope to the app config doesn't retroactively widen
  already-issued tokens. Anyone who connected GitHub before this ships needs to
  reconnect (re-consent) before Projects calls will succeed for them. See "Rollout"
  below.

## Architecture

### Key decision: additive, not a replacement

The existing `github` provider (`src/providers/github/{definition,actions,executors}.ts`
plus six `runtime-*.ts` REST handler modules, ~5500 lines, 145 actions) is **not
touched in shape**. This proposal:

1. Adds one new file, `runtime-project.ts`, following the credentialed MCP-client
   pattern already established in `src/providers/hubspot/runtime.ts`
   (`callStreamableHttpMcpTool`: `StreamableHTTPClientTransport` + `Authorization:
Bearer <token>` header + `Client.callTool`) — pointed at
   `https://api.githubcopilot.com/mcp/` with `X-MCP-Toolsets: projects` added to the
   transport's `requestInit.headers`.
2. Reuses the credential `github/executors.ts`'s `createContext` already resolves
   (`requireBearerCredential(context, "github")` → `accessToken`) — the same OAuth
   token/PAT already used for every REST action, since GitHub's REST API and its
   hosted MCP server both accept the identical bearer credential. No new credential
   type, no new `auth` entry in `definition.ts`.
3. Appends `projectActionHandlers` to the existing `Object.assign(...)` handler map in
   `executors.ts` (currently six modules; becomes seven) — same mechanism, same
   `defineProviderExecutors` framework every other action already goes through.
4. Adds `project` to `githubOAuthScopes` in `scopes.ts`.
5. Adds the new action definitions to `actions.ts` and regenerates the catalog
   (`npm run generate:catalog`).

Net effect: from the catalog/executor framework's point of view, these are ordinary
GitHub provider actions, indistinguishable from the REST ones except that their
implementation happens to proxy an MCP call instead of a `fetch`. `search_actions`/
`execute_action` (and, on the JoyStream side, `inspect_gateway_action`) work
identically for both.

### Open question: one action per method, or expose the multiplexed tools as-is?

`github-mcp-server`'s own shape is two tools (`projects_list`, `projects_get`), each
multiplexed over a `method` enum with conditionally-required fields depending on which
method is chosen. This repo's existing convention for the REST-backed GitHub actions
is the opposite: one action per operation (`get_issue`, `list_issues`, etc. are
separate actions with their own fixed schema), which is what `catalog-format.md`'s
per-action `requiredScopes`/schema discoverability model assumes, and is presumably
better for `search_actions` relevance and for an LLM caller reading one action's
schema in isolation.

Two ways to go:

- **(a) Mirror the four Projects **list**-side methods and four **get**-side methods
  as eight separate open-connector actions** (`list_projects`, `list_project_fields`,
  `list_project_items`, `list_project_status_updates`, `get_project`,
  `get_project_field`, `get_project_item`, `get_project_status_update`) — each with
  its own precise input schema (only the fields relevant to that method,
  `required` set correctly), still all funneled through `runtime-project.ts`
  internally as one or two upstream tool calls. Matches this repo's existing
  granularity convention.
- **(b) Expose `projects_list`/`projects_get` as two actions**, passing `method`
  straight through — less code, but a worse schema for a caller to reason about (most
  fields are conditionally required depending on `method`, which JSON Schema can't
  express cleanly), and inconsistent with every other GitHub action in this provider.

**Leaning toward (a)** for consistency with the rest of the provider and better
`search_actions` results, but this is the main design call worth confirming before
implementation — the two are roughly the same amount of code either way (the internal
`runtime-project.ts` handler for each still just sets `method` and forwards).

## Implementation

### Deliverables

1. `src/providers/github/runtime-project.ts` — new file:
   - `projectActionHandlers: Record<GitHubProjectActionName, ProviderRuntimeHandler<GitHubActionContext>>`
     (reusing `GitHubActionContext` from `runtime-shared.ts` — same
     `{ accessToken, fetcher }` shape every other GitHub handler module uses).
   - One handler per chosen action (see open question above) that calls a shared
     `callGithubProjectsTool(method, args, context)` helper — mirrors
     `hubspot/runtime.ts`'s `callStreamableHttpMcpTool` shape: build
     `StreamableHTTPClientTransport` against `https://api.githubcopilot.com/mcp/`
     with `Authorization: Bearer {accessToken}` + `X-MCP-Toolsets: projects` headers,
     `Client.callTool({ name: "projects_list" | "projects_get", arguments: { method, ...args } })`,
     map MCP errors to `ProviderRequestError` (mirror `mapHubspotMcpError`'s
     `UnauthorizedError`/`StreamableHTTPError`/`McpError` handling — a 401 here almost
     certainly means the scope gap above, so that mapped error should say so plainly).
2. `src/providers/github/actions.ts` — add the new action definitions (name,
   description, input schema per the real toolsnap shapes above), `requiredScopes:
["project"]`.
3. `src/providers/github/executors.ts` — import `projectActionHandlers`, add it to the
   `Object.assign(...)` list.
4. `src/providers/github/scopes.ts` — add `githubProjectScope = "project"`, include it
   in `githubOAuthScopes`.
5. `npm run generate:catalog` to regenerate, `npm run fix-check` to lint/format/typecheck.

### Testing

- Per `AGENTS.md`: new-in-this-repo provider code gets test coverage here (the
  "purely migrating from OOMOL-hosted" exemption doesn't apply — this is net-new).
  Unit-test `runtime-project.ts`'s method-argument construction and error mapping;
  mock the MCP client the way existing provider tests mock `fetch`.
- Manual verification against a real connected GitHub account before considering this
  done: `list_projects` for a known org, `list_project_items` with `field_names:
["Status"]` against a real project, confirm `get_project_item` round-trips an item
  id from `list_project_items`.
- Confirm the 401-on-missing-scope path produces a clear, actionable error (not a raw
  MCP error) — this is the failure mode every not-yet-reconnected existing user will
  hit first.

## Rollout

- This is a provider-code change; ships with the fork's normal build/deploy (rebuild
  the image per `docs/joystream-deployment.md`, redeploy the `connector` service).
- **Existing connected GitHub users need to reconnect** to pick up the `project`
  scope — until they do, the new actions will 401 for them specifically (not a
  connector-wide outage; REST actions and non-Projects flows are unaffected). Worth a
  short heads-up wherever JoyStream surfaces connector reconnect prompts, but not a
  blocking migration — degrades gracefully to "this one new action needs
  reconnect," not "everything broke."
- No schema/database migration on the connector side — this is pure provider code
  plus a generated-catalog refresh.

## Open Questions

1. **(a) vs (b) above** — one action per method vs. exposing the two multiplexed
   tools as-is. Needs a decision before writing `actions.ts`.
2. Exact `X-MCP-Toolsets` value — `projects` alone, or `default,projects` (does the
   hosted server require `default` to still be present for baseline behavior, or is
   an empty/narrow toolset list safe)? Worth confirming empirically against the live
   endpoint rather than assuming.
3. Should `requiredScopes: ["project"]` block the action from even being _listed_ by
   `search_actions` for a connection that hasn't granted it yet, or only fail at
   execution time? (Precedent: check how other scope-gated actions in this provider,
   e.g. `delete_repo` scope, already handle this — mirror whatever that does.)
4. Communication/timing for the existing-user reconnect requirement — whose call is
   it to schedule, and does JoyStream's UI have a way to surface "this connection is
   missing a scope for action X" today, or does that need its own small addition?

## References

- Real tool schemas: `~/ws/github-mcp-server/pkg/github/__toolsnaps__/projects_{list,get,write}.snap`
- Toolset gating: `~/ws/github-mcp-server/pkg/github/tools.go` (`ToolsetMetadataProjects`),
  `~/ws/github-mcp-server/README.md` ("default toolset"),
  `~/ws/github-mcp-server/docs/remote-server.md` (`X-MCP-Toolsets` header)
- MCP-client-wrapper precedent: `src/providers/hubspot/runtime.ts`
  (`callStreamableHttpMcpTool`, credentialed), `src/providers/cloudflare_docs/runtime.ts`
  (uncredentialed, simpler shape)
- Existing GitHub provider: `src/providers/github/{definition,actions,executors,scopes,
runtime-shared}.ts`
- The JoyStream-side consumer that surfaced this gap:
  `joystream` repo, `github-project-ticket-summary` skill
  (`joystream-skills/github/project-ticket-summary/SKILL.md`) — its Reasoning Flow
  assumes exactly these tools; step 2 ("Resolve the project and read its items with
  `projects_list`") is what currently has no path to succeed.
