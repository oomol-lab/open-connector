/** Read provider-reported OAuth scopes for display, never for local authorization. */
export function readOAuthScopes(value: unknown): string[] | undefined {
  if (typeof value === "string") {
    return [...new Set(value.split(/[,\s]+/).filter(Boolean))];
  }
  if (Array.isArray(value) && value.every((scope): scope is string => typeof scope === "string")) {
    return [...new Set(value.map((scope) => scope.trim()).filter(Boolean))];
  }
  return undefined;
}
