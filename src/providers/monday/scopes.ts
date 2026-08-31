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

const mondayProviderScopeSurface = [...mondayAuthorizationScopes, "manage_account_security", "forms:write"] as const;
const mondayKnownScopeSet = new Set<string>(mondayProviderScopeSurface);

export function getMondayAuthorizationScopes(): string[] {
  return [...mondayAuthorizationScopes];
}

export function getMondayProviderScopeSurface(): string[] {
  return [...mondayProviderScopeSurface];
}

export function normalizeMondayGrantedScopes(scopes: Iterable<string>): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const scope of scopes) {
    const trimmed = scope.trim();
    if (!trimmed || seen.has(trimmed) || !mondayKnownScopeSet.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

export function parseMondayScopeString(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }

  return normalizeMondayGrantedScopes(value.replaceAll(",", " ").split(" "));
}
