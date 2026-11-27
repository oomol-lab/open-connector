/**
 * Build-time provider allowlist for the Cloudflare Workers build. The Workers registry and the Workers catalog assets
 * keep only the listed bundled providers, so esbuild bundles nothing else. Unset keeps every provider.
 */
export const providerAllowlistVariable = "OPENCONNECTOR_PROVIDERS";

const markerPattern = /^\/\/ Built with OPENCONNECTOR_PROVIDERS=([a-z0-9_,-]*)\. Do not hand-edit\.$/m;

/**
 * Parse a comma-separated provider list into sorted, unique ids. Entries are trimmed and empty entries dropped; a
 * value with no ids left, such as an empty or whitespace-only one, counts as unset and returns `undefined`.
 */
export function parseProviderAllowlist(value: string | undefined): string[] | undefined {
  const ids = [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  ].sort((a, b) => a.localeCompare(b));
  return ids.length > 0 ? ids : undefined;
}

export function readProviderAllowlist(env: NodeJS.ProcessEnv = process.env): string[] | undefined {
  return parseProviderAllowlist(env[providerAllowlistVariable]);
}

/** Throw when the allowlist names an id that is not a bundled provider, suggesting close matches. */
export function assertKnownProviders(allowlist: readonly string[], knownServices: Iterable<string>): void {
  const known = [...knownServices];
  const knownSet = new Set(known);
  const unknown = allowlist.filter((id) => !knownSet.has(id));
  if (unknown.length === 0) {
    return;
  }

  const described = unknown.map((id) => {
    const suggestions = suggestProviders(id, known);
    return suggestions.length > 0 ? `${id} (did you mean ${suggestions.join(" or ")}?)` : id;
  });
  throw new Error(`${providerAllowlistVariable} lists unknown providers: ${described.join(", ")}`);
}

/**
 * The line a registry built with an allowlist carries, so `ensure-generated` can tell a registry built for another
 * value apart. A registry built without one carries no line and stays byte-identical to builds before the allowlist.
 */
export function formatProviderAllowlistMarker(allowlist: readonly string[]): string {
  return `// Built with ${providerAllowlistVariable}=${allowlist.join(",")}. Do not hand-edit.`;
}

/** Read the allowlist a generated registry was built with, or `undefined` for a registry built without one. */
export function readProviderAllowlistMarker(content: string): string[] | undefined {
  const match = markerPattern.exec(content);
  return match ? parseProviderAllowlist(match[1]) : undefined;
}

function suggestProviders(id: string, known: readonly string[]): string[] {
  const normalized = normalizeProviderId(id);
  const maxDistance = Math.max(1, Math.floor(normalized.length / 4));
  return known
    .map((service) => ({ service, distance: editDistance(normalized, normalizeProviderId(service)) }))
    .filter((candidate) => candidate.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance || a.service.localeCompare(b.service))
    .slice(0, 3)
    .map((candidate) => candidate.service);
}

/** Compare ids without case or separators, so `Google_Calendar` still finds `googlecalendar`. */
function normalizeProviderId(id: string): string {
  return id.toLowerCase().replace(/[-_\s]/g, "");
}

/** Optimal string alignment distance: Levenshtein plus adjacent transpositions, which typos often are. */
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let distance = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        distance = Math.min(distance, rows[i - 2]![j - 2]! + 1);
      }
      rows[i]![j] = distance;
    }
  }
  return rows[a.length]![b.length]!;
}
