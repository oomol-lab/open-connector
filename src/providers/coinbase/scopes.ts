import { optionalString } from "../../core/cast.ts";

export const coinbaseAccountReadScope = "wallet:accounts:read";
export const coinbaseOfflineAccessScope = "offline_access";

/** OAuth scopes needed by the currently exposed Coinbase account actions. */
export const coinbaseOAuthScopes: string[] = [coinbaseAccountReadScope, coinbaseOfflineAccessScope];

/** Read Coinbase's token scope, which may use spaces or commas as separators. */
export function readCoinbaseGrantedScopes(value: unknown): string[] {
  const scope = optionalString(value);
  return scope ? [...new Set(scope.split(/[\s,]+/u).filter(Boolean))] : [...coinbaseOAuthScopes];
}
