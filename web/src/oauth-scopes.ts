/** Extra permissions extend defaults; explicit custom input remains a replacement. */
export interface ToggleOAuthScopeInput {
  defaults: string[];
  requested: string[] | undefined;
  scope: string;
  selected: boolean;
  custom: boolean;
}

export function toggleOAuthScope(input: ToggleOAuthScopeInput): string[] | undefined {
  const { defaults, requested, scope, selected, custom } = input;
  const current = requested ?? defaults;
  const target = scope.trim();
  const matches = (value: string) => value.trim() === target;
  let next = current;
  if (selected) {
    if (!current.some(matches)) next = [...current, target];
  } else {
    next = current.filter((value) => !matches(value));
  }
  if (custom) return next;
  const normalized = normalizeOAuthScopes(next);
  const normalizedDefaults = normalizeOAuthScopes(defaults);
  const usesDefaults =
    normalized.length === normalizedDefaults.length && normalizedDefaults.every((value) => normalized.includes(value));
  return usesDefaults ? undefined : next;
}

export function normalizeOAuthScopes(values: string[]): string[];
export function normalizeOAuthScopes(values: string[] | undefined): string[] | undefined;
export function normalizeOAuthScopes(values: string[] | undefined): string[] | undefined {
  if (values === undefined) return undefined;
  const scopes = values.map((value) => value.trim()).filter(Boolean);
  return [...new Set(scopes)];
}
