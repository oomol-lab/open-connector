# Unified Cloudflare provider

The `cloudflare` provider replaces the separate DNS, Workers, R2, Browser Rendering, and Email Routing providers. Query the current action schemas before calling them; old action IDs and credential shapes are not aliases.

- Connect with a scoped API token or OAuth. The former Email Routing Global API Key plus account email mode is removed. Create a user API token at https://dash.cloudflare.com/profile/api-tokens with the Email Routing permissions needed by your actions, then reconnect using the API Token form.
- Email Routing rule creation, updates, and deletion require an explicit `zoneId`. Copy the former connection's zone ID into each action payload.
- `list_routing_rules` with `zoneId` lists that zone. Omitting it selects the account scope and may return rules from multiple zones. Pass the former zone ID to preserve the old query scope.
- The configured account is a default, not a restriction. An explicit action `accountId` takes precedence, including for mutations and deletes; Cloudflare still enforces the token's permissions.
- OAuth `requiredScopes` describe requested grants. Returned scopes are display metadata and never a local execution gate.
