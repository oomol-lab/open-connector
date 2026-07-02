const sensitiveKeyPattern = /api[-_]?key|authorization|client[-_]?secret|password|refresh[-_]?token|secret|token/i;

/**
 * Return a bounded, redacted value suitable for recent run logs.
 */
export function summarizeForRunLog(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (depth > 3) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => summarizeForRunLog(item, depth + 1));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 50)
        .map(([key, item]) => [
          key,
          sensitiveKeyPattern.test(key) ? "[redacted]" : summarizeForRunLog(item, depth + 1),
        ]),
    );
  }

  return String(value);
}
