import { optionalString } from "../../core/cast.ts";

export const alpacaDataScope = "data";

/** OAuth scopes needed by the currently exposed Alpaca market-data actions. */
export const alpacaOAuthScopes: string[] = [alpacaDataScope];

/** Read Alpaca's space-delimited token scope, falling back to the requested scope. */
export function readAlpacaGrantedScopes(value: unknown): string[] {
  const scope = optionalString(value);
  return scope ? [...new Set(scope.split(/\s+/u).filter(Boolean))] : [...alpacaOAuthScopes];
}
