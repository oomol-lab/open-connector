# Feature PLAN (exploratory): Replace the REST-backed `github` provider with a full github-mcp-server proxy

## Status

**Exploratory — not recommended as written.** This is a sibling proposal to
[`github-projects-support/PLAN.md`](../github-projects-support/PLAN.md), which covers
the same underlying gap (this provider has no path to GitHub Projects v2) with a much
smaller, purely additive change. This document exists to give the full-replacement
option a fair, evidence-based hearing rather than dismiss it — the appeal is real
(see "Why consider this" below) — but as detailed below, it has a blocking problem the
additive version doesn't: it breaks every existing consumer of this provider's current
action surface. Read this alongside the Projects-only plan before deciding between them.

## The One-Line Version

Instead of adding Projects v2 as one new MCP-proxied slice next to 145 existing
REST-backed actions, replace the REST implementation entirely with a generic proxy to
GitHub's own hosted `github-mcp-server` (`https://api.githubcopilot.com/mcp/`),
covering its full ~115-tool, 23-toolset surface (repos, issues, pull requests, actions,
code security, discussions, gists, projects, stargazers, and more) through one thin
code path instead of hand-written REST wrappers.

## Why consider this

- **Code reduction.** The current `github` provider is ~5500 lines across 7 files
  (`definition.ts`, `actions.ts`, `executors.ts`, and six `runtime-*.ts` REST wrapper
  modules for activity/issue/pull-request/release/repository/search). A generic proxy
  collapses this to roughly one thin transport + error-mapping layer, with action
  definitions derived from the upstream server's own tool schemas rather than
  hand-maintained.
- **Automatic parity with GitHub's own roadmap.** New tools GitHub ships in
  `github-mcp-server` (115 tools across 23 toolsets today — `context, repos, git,
issues, pull_requests, users, orgs, actions, code_quality, code_security,
secret_protection, dependabot, notifications, discussions, gists,
security_advisories, projects, stargazers, copilot, copilot_issue_intents,
copilot_spaces, support_search`) become available without this fork writing new
  provider code for each one.
- **One code path for all of GitHub**, instead of REST actions plus a slowly growing
  pile of MCP-proxied exceptions (Projects today, whatever else needs an MCP-only
  capability tomorrow).
- **Precedent already exists in this repo** for the MCP-client-wrapper mechanics
  (`hubspot`, `cloudflare_docs`, `jumpserver`, `excalidraw_mcp`) — the plumbing this
  would need is proven, not novel.

## The blocking problem: this breaks every existing consumer

This is the central reason the sibling proposal stays additive-only, restated here in
full because it's the whole crux of this decision.

Live verification against a running JoyStream deployment (this session) confirmed the
connector's current catalog resolves actions under **open-connector's own curated
names**: `github.search_issues_and_pull_requests`, `github.get_issue`,
`github.get_pull_request`, `github.list_repository_issues`, etc. — one action per
operation, open-connector's own descriptions and schemas.

`github-mcp-server`'s tool surface is shaped completely differently: fewer, broader,
**method-multiplexed** tools (`issue_read`/`issue_write` cover create/get/update/etc.
via a `method` parameter, not separate actions; same pattern as `projects_list`/
`projects_get` documented in the sibling plan). Tool names, argument shapes, and
required-field sets do not line up with the current REST actions at all.

Consequences of swapping the implementation under the same `github` service key:

- Every **already-synced `skill_mcp_binding` row** and **`mcp_servers.tool_names`
  cache entry** referencing current action names goes stale.
- Every **already-authored skill `input_schema`** built against a current action's
  field names (resolved via `inspect_gateway_action` against the _old_ shape) silently
  stops matching what the new proxied action actually expects.
- Any consumer-side alias/override table naming specific action or tool identifiers
  (e.g. JoyStream's `data/capability_aliases.py` `SERVER_TIEBREAK`/
  `GATEWAY_SERVER_OVERRIDE`, to the extent either names GitHub action identifiers
  rather than just the server) needs auditing.
- This is **not** a rollout-communication problem like the Projects proposal's
  scope-reconnect gap (which degrades gracefully — only the new actions fail until a
  user reconnects). This is a hard break: existing working flows stop working the
  moment the implementation swaps, with no opt-in period, unless a migration
  mechanism is built deliberately (see Architecture Options below).

## Other real costs (secondary to the blocking problem, but not free)

1. **Loses the deliberate curation step.** The current 145 actions are a reviewed,
   intentional surface. A generic proxy exposes whatever GitHub ships next
   automatically — including write/admin operations
   (`delete_repo`, `merge_pull_request`, `run_secret_scanning`, `create_repository`)
   with no explicit "should this be reachable" decision on this side, unless an
   allowlist/toolset-curation layer is built and maintained (which reintroduces some
   of the maintenance burden this proposal is trying to shed).
2. **New single point of failure for all of GitHub.** Today, a REST action's
   reliability is fully owned by this fork — direct calls to `api.github.com`. A full
   proxy makes `api.githubcopilot.com`'s uptime and latency the ceiling for _every_
   GitHub action, not just a new slice. Every call also gains a network hop (client →
   githubcopilot.com → github.com) that direct REST doesn't pay.
3. **Per-action `requiredScopes` fidelity is unverified.** Each REST action here
   declares its own precise OAuth scope requirement, surfaced through the catalog.
   Whether `github-mcp-server`'s tool metadata carries an equivalent, machine-readable
   per-tool scope declaration needs checking before assuming this metadata survives
   the switch unchanged.
4. **Scope surface grows a lot, not just by one `project` scope.** Covering the full
   23-toolset surface (`orgs`, `code_security`, `secret_protection`, `dependabot`,
   `security_advisories`, `discussions`, `stargazers`, ...) means auditing and
   requesting the OAuth scopes each toolset needs — not a single addition like the
   Projects-only plan's `project` scope.

## Architecture options, if pursuing this anyway

### Option A — Hard replace

Remove the REST implementation, replace `github`'s executors with a generic MCP
proxy wholesale. Simplest to build, but takes the full blocking-problem hit above with
no mitigation. Not recommended.

### Option B — New, separate provider; deprecate the old one gradually

Register a **second, distinct provider** (its own `service` key — following this
repo's own precedent of `excalidraw_mcp` existing as its own provider rather than
folding into some REST-based excalidraw equivalent) exposing the full
`github-mcp-server` surface — e.g. `github_mcp` or `github_v2`. The existing `github`
REST provider keeps running, completely unaffected, for as long as anything still
references it. New consumers (or explicitly migrated old ones) opt into the new
provider. Deprecate and eventually remove the REST provider only once nothing
references it anymore — a decision made with real usage data, not a forced cutover.

This is the variant that actually avoids the blocking problem, at the cost of running
two GitHub providers side by side for a transition period, and needing a real answer
for "how do we know when it's safe to remove the old one" (telemetry on which
provider/action names are actually in use, presumably — a JoyStream-side question as
much as a connector-side one).

### Option C — Build a generic MCP-proxy provider framework first

This repo already hand-writes the same MCP-client-wrapper boilerplate four times
(`hubspot`, `cloudflare_docs`, `jumpserver`, `excalidraw_mcp` — transport setup,
`Authorization` header threading, `Client.callTool`, error mapping to
`ProviderRequestError`). A full GitHub proxy (Option B, specifically) is a good
forcing function to factor that into a shared helper — e.g. a
`defineMcpProxyProvider({ endpoint, credentialType, toolsetHeader, actionAllowlist })`
that connects once, lists the upstream server's real tools via `listTools()`, and
derives action definitions from their live schemas instead of hand-authoring each one
in `actions.ts`. This is real infrastructure investment beyond just GitHub — it would
also simplify onboarding the _next_ MCP server this fork wants to wrap. Worth scoping
as its own piece of work if there's appetite for wrapping more MCP servers over time
(the four existing precedents suggest there is), independent of whether GitHub
specifically goes through it first.

## Recommendation

**Do not pursue Option A.** Between B and C: if this is worth doing at all, Option C
(build the generic framework, land GitHub as its first full consumer via a new
provider per Option B) gets more long-term value for comparable effort — but this is
a genuinely open call given it depends on how much appetite there is for wrapping more
MCP servers beyond GitHub, which this document can't answer alone.

Given the blocking-problem section above, my actual recommendation remains what's in
the sibling plan: ship the small, additive Projects-only change first (unblocks the
immediate need today, zero risk), and treat this document as a live proposal to
revisit separately — not a prerequisite or a competing near-term option.

## Open Questions

1. Is there real appetite for wrapping more MCP servers over time (which would justify
   Option C's framework investment), or is GitHub Projects the only near-term driver?
2. If pursuing Option B, what's the deprecation signal for the old REST provider —
   usage telemetry, a fixed sunset date, an explicit migration project?
3. Does `github-mcp-server`'s tool metadata expose per-tool required-scope information
   in a form this repo's catalog can consume, or would that need to be hand-mapped
   per tool (partially reintroducing the maintenance burden this proposal is meant to
   reduce)?
4. What's the actual scope-request delta across all 23 toolsets versus the 5 scopes
   `github`'s `scopes.ts` requests today, and is granting all of it something users
   would reasonably consent to, or does it need to stay toolset-scoped (i.e. request
   only the scopes needed for whichever toolsets Option B's new provider actually
   enables, not blindly "all")?

## References

- Sibling (recommended, smaller) proposal: `../github-projects-support/PLAN.md`
- Full toolset list: `~/ws/github-mcp-server/pkg/github/tools.go`
  (`ToolsetMetadata*` constants)
- Tool count: `~/ws/github-mcp-server/pkg/github/__toolsnaps__/` (115 tool snapshot
  files across all toolsets)
- Existing REST provider: `src/providers/github/{definition,actions,executors,scopes}.ts`
  plus six `runtime-*.ts` modules (~5500 lines total)
- MCP-client-wrapper precedent: `src/providers/hubspot/runtime.ts`,
  `src/providers/cloudflare_docs/runtime.ts`, `src/providers/jumpserver/`,
  `src/providers/excalidraw_mcp/`
- Live catalog verification (this session): `github.search_issues_and_pull_requests`,
  `github.get_issue`, `github.get_pull_request`, `github.list_repository_issues`, etc.
  — open-connector's own curated action names, confirmed via
  `OpenConnectorClient.search_actions(service="github")` against a running instance.
