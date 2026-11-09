const mondayAuthorizationScopes = [
  "me:read",
  "account:read",
  "boards:read",
  "boards:write",
  "workspaces:read",
  "workspaces:write",
  "users:read",
  "teams:read",
  "updates:read",
  "updates:write",
  "docs:read",
  "docs:write",
  "assets:read",
  "departments:read",
  "departments:write",
] as const;

export function getMondayAuthorizationScopes(): string[] {
  return [...mondayAuthorizationScopes];
}
