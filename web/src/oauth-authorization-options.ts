import { useEffect, useState } from "react";

export function useOAuthAuthorizationOptions(defaultScopes: string[] | undefined) {
  const [requestedScopes, setScopes] = useState<string[] | undefined>();
  const [custom, setCustom] = useState(false);
  useEffect(() => {
    setScopes(undefined);
    setCustom(false);
  }, [defaultScopes]);
  return {
    requestedScopes,
    selectedOptionIds: requestedScopes ?? defaultScopes ?? [],
    custom,
    setCustom(enabled: boolean) {
      setCustom(enabled);
      setScopes(enabled ? [...(requestedScopes ?? defaultScopes ?? [])] : undefined);
    },
    setScopes,
    toggleOption(optionId: string, selected: boolean) {
      setScopes((current) => toggleOAuthScope(defaultScopes ?? [], current, optionId, selected, custom));
    },
  };
}

/** Extra permissions extend defaults; explicit custom input remains a replacement. */
export function toggleOAuthScope(
  defaults: string[],
  requested: string[] | undefined,
  scope: string,
  selected: boolean,
  custom: boolean,
): string[] | undefined {
  const scopes = new Set(requested ?? defaults);
  if (selected) scopes.add(scope);
  else scopes.delete(scope);
  if (!custom && scopes.size === defaults.length && defaults.every((value) => scopes.has(value))) return undefined;
  return [...scopes];
}

export function normalizeOAuthScopes(values: string[] | undefined): string[] | undefined {
  return values === undefined ? undefined : [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
