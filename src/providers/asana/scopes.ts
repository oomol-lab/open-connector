import { optionalString } from "../../core/cast.ts";

export const asanaDefaultOAuthScope = "default";

/**
 * Full permissions are required because Asana does not yet expose granular
 * OAuth scopes for every endpoint used by this provider.
 */
export const asanaOAuthScopes: string[] = [asanaDefaultOAuthScope];

/** Read Asana's space-delimited token scope, falling back to the requested scope. */
export function readAsanaGrantedScopes(value: unknown): string[] {
  const scope = optionalString(value);
  return scope ? [...new Set(scope.split(/\s+/u).filter(Boolean))] : [...asanaOAuthScopes];
}
