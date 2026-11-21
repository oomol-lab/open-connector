/** Scope values: an opaque isolation label the runtime never interprets. */
export const scopePattern: RegExp = /^[A-Za-z0-9._:-]{1,128}$/;
export const scopeMessage: string = `scope must match ${scopePattern.source} and cannot be '.' or '..'.`;

/**
 * An opaque isolation label. The runtime never interprets it: a host maps its own tenant, workspace or environment
 * onto a scope, and a runtime token only ever sees connections and run logs that carry the same scope.
 */
export function isScope(value: unknown): value is string {
  return typeof value === "string" && value !== "." && value !== ".." && scopePattern.test(value);
}

/** Restricts a lookup to one scope; `scope: undefined` means unscoped connections only. Omit it for every scope. */
export interface ScopeFilter {
  scope: string | undefined;
}
