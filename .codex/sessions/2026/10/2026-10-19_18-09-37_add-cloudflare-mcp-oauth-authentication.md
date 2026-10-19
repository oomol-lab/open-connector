---
title: "Add Cloudflare MCP OAuth authentication"
created_at: "2026-10-19T18:09:37+08:00"
agent: "Codex"
branch: "chatgpt-mcp-oauth"
head_before_commit: "cae17f6f"
---

# Session Record

This is a structured record of the visible conversation, with private deployment details and credentials omitted.

## Request

Add ChatGPT-compatible OAuth authentication to the Cloudflare MCP endpoint, retain existing credentials, validate the implementation, and contribute the changes through a personal fork and an upstream pull request.

## Constraints

- Preserve the existing administrator token, encryption key, stored connections, and runtime-token compatibility.
- Do not back up the database or introduce a schema migration for this feature.
- Keep private deployment configuration and all real credentials out of the contribution.

## Decisions

- Reuse @cloudflare/workers-oauth-provider for OAuth discovery, registration, PKCE, token issuance, and refresh.
- Enable OAuth only when the optional OAUTH_KV binding is configured.
- Require explicit administrator consent and issue a separate revocable runtime key per grant.
- Keep OAuth access confined to MCP and enforce authentication after the last runtime key is revoked.

## Work Performed

- Added OAuth handlers and an escaped, browser-compatible consent page.
- Added configuration guards, authentication regression tests, consent escaping tests, and a reusable integration test script.
- Documented setup, scopes, expiry, revocation, and legacy-token behavior.
- Validated browser redirects and deployed the feature with existing secrets retained.
- Rebased the contribution onto upstream main at cae17f6f without conflicts.

## Key Exchanges

- The user reported that the client could not discover OAuth settings for the bearer-only MCP endpoint.
- The user requested ChatGPT-compatible MCP OAuth and authorized deployment after successful tests while preserving credentials.
- The user added the connector and requested a real invocation from a new chat; a read-only Hacker News action succeeded.
- The user requested an upstream pull request and a copy in their own fork.

## Workspace Snapshot

- Repository: oomol-lab/open-connector
- Branch: chatgpt-mcp-oauth
- Base: cae17f6f
- Scope: Cloudflare OAuth integration, runtime authentication guards, documentation, tests, dependency lock, and this record.
- Ignored local deployment configuration is excluded.

## Validation

- npm run fix-check passed, including after rebasing onto current main.
- After rebasing, all 224 relevant authentication, Cloudflare, D1, server, and MCP tests passed across 9 files.
- Local and deployed integration checks covered discovery, PKCE, consent protection, code exchange/replay, MCP calls, refresh, revocation, legacy tokens, and isolation from administration APIs.
- A real browser completed consent and callback navigation.
- A newly connected client successfully called a read-only action.
- An independent final review found no blockers or exposed secrets; git diff --check passed.

## Commit

- message: feat(cloudflare): support OAuth-authenticated MCP clients
- hash: resolve the containing commit with git log -1 --format=%H -- .codex/sessions/2026/10/2026-10-19_18-09-37_add-cloudflare-mcp-oauth-authentication.md
- result: Feature and sanitized session record included in this contribution commit.
