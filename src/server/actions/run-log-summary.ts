import type { ExecutionResult } from "../../core/types.ts";

const maxNodes = 256;
const maxBytes = 16 * 1024;
const maxDepth = 4;
const maxStringLength = 256;
const maxArrayLength = 20;
const maxObjectKeys = 50;
const sensitiveKeyPattern =
  /access[-_]?key|api[-_]?key|authorization|client[-_]?secret|cookie|credential|password|private[-_]?key|refresh[-_]?token|secret|session|signature|token/i;
const sensitiveContextPattern = /(^|\.)(cookies?|credentials?|headers?|secrets?)(\.|$)/i;
const credentialValuePattern = /^(?:Basic|Bearer)\s+\S+|^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i;
const sensitiveUrlContextPattern = /callback|download|presigned|signed|temporary|webhook/i;
const safeErrorMessages: Record<string, string> = {
  action_blocked: "The action was blocked by runtime policy.",
  authorization_failed: "The provider rejected authorization.",
  connection_not_found: "The requested connection was not found.",
  executor_unavailable: "The action executor is unavailable.",
  internal_error: "The action failed unexpectedly.",
  invalid_input: "The action input was invalid.",
  oauth_refresh_unavailable: "The OAuth credential could not be refreshed.",
  oauth_token_expired: "The OAuth credential has expired.",
  provider_error: "The provider request failed.",
  rate_limited: "The provider rate limit was reached.",
};

interface SummaryState {
  nodes: number;
}

/** Return a bounded, redacted value suitable for run audit storage. */
export function summarizeForRunLog(value: unknown): unknown {
  try {
    const summary = summarize(value, [], 0, { nodes: 0 });
    return new TextEncoder().encode(JSON.stringify(summary)).byteLength <= maxBytes ? summary : "[truncated]";
  } catch {
    return "[unavailable]";
  }
}

export function safeRunLogError(error: ExecutionResult["error"]): { errorCode?: string; errorMessage?: string } {
  if (!error) {
    return {};
  }
  return {
    errorCode: error.code,
    errorMessage: safeErrorMessages[error.code] ?? "Action execution failed.",
  };
}

function summarize(value: unknown, path: string[], depth: number, state: SummaryState): unknown {
  if (state.nodes >= maxNodes || depth > maxDepth) {
    return "[truncated]";
  }
  state.nodes += 1;

  if (typeof value === "string") {
    return summarizeString(value, path);
  }
  if (value == null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, maxArrayLength).map((item) => summarize(item, path, depth + 1, state));
  }
  if (typeof value === "object") {
    return summarizeObject(value, path, depth, state);
  }
  return String(value);
}

function summarizeObject(value: object, path: string[], depth: number, state: SummaryState): unknown {
  try {
    const prototype = Object.getPrototypeOf(value);
    if (ArrayBuffer.isView(value) || (prototype !== Object.prototype && prototype !== null)) {
      return "[unavailable]";
    }

    const entries: Array<[string, unknown]> = [];
    for (const key in value) {
      if (entries.length >= maxObjectKeys) break;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable) continue;
      const nextPath = [...path, key];
      if (sensitiveKeyPattern.test(key) || sensitiveContextPattern.test(nextPath.join("."))) {
        entries.push([key, "[redacted]"]);
      } else {
        entries.push([
          key,
          "value" in descriptor ? summarize(descriptor.value, nextPath, depth + 1, state) : "[unavailable]",
        ]);
      }
    }
    return Object.fromEntries(entries);
  } catch {
    return "[unavailable]";
  }
}

function summarizeString(value: string, path: string[]): string {
  if (credentialValuePattern.test(value)) {
    return "[redacted]";
  }
  // Match http(s) URLs, other schemes with an authority (ftp, s3, ws, ...), and
  // protocol-relative URLs. Credentials embedded in those forms would otherwise
  // reach the audit log untouched.
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (
        sensitiveUrlContextPattern.test(path.join(".")) ||
        [...url.searchParams.keys()].some((name) => sensitiveKeyPattern.test(name))
      ) {
        return "[redacted-url]";
      }
      // For non-special schemes URL.origin is "null"; fall back to scheme + host,
      // which still strips userinfo, the path, and the query string.
      return url.origin === "null" ? `${url.protocol}//${url.host}` : url.origin;
    } catch {
      // Not a parseable URL (e.g. "https://" or a protocol-relative value without
      // a base). Keep the rest of the audit record intact instead of letting one
      // malformed value collapse the whole summary, but still redact when the
      // value sits in a sensitive URL context or carries credential material.
      if (sensitiveUrlContextPattern.test(path.join(".")) || hasUrlUserinfo(value) || hasSensitiveQueryKey(value)) {
        return "[redacted-url]";
      }
    }
  }
  return value.length > maxStringLength ? `${value.slice(0, maxStringLength)}[truncated]` : value;
}

function hasUrlUserinfo(value: string): boolean {
  // Detects userinfo (user@ or user:pass@) inside the authority of a URL-like
  // string, even when the value as a whole cannot be parsed as a URL.
  const authorityStart = value.indexOf("://") + 3;
  for (let index = authorityStart; index < value.length; index += 1) {
    const character = value[index];
    if (character === "@") {
      return true;
    }
    if (character === "/" || character === "?" || character === "#") {
      return false;
    }
  }
  return false;
}

function hasSensitiveQueryKey(value: string): boolean {
  const visible = value.slice(0, maxStringLength);
  const queryStart = visible.indexOf("?");
  if (queryStart === -1) {
    return false;
  }
  for (const name of new URLSearchParams(visible.slice(queryStart + 1)).keys()) {
    if (sensitiveKeyPattern.test(name)) {
      return true;
    }
  }
  return false;
}
