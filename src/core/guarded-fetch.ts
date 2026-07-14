import { assertPublicHttpUrl, isBlockedIpAddress, isIpv4Address } from "./request.ts";

/**
 * Single resolved address returned by a DNS lookup, mirroring the shape of
 * `node:dns` `lookup(hostname, { all: true })` entries.
 */
export interface ResolvedAddress {
  address: string;
  family: number;
}

/**
 * DNS resolver used to validate the addresses a hostname resolves to before a
 * request is issued.
 */
export type GuardedFetchDnsLookup = (hostname: string) => Promise<ResolvedAddress[]>;

export interface GuardedFetchOptions {
  /**
   * Base transport issuing the actual requests. Defaults to the global fetch,
   * resolved per call so test stubs installed later still apply.
   */
  fetch?: typeof fetch;
  /**
   * Allow RFC 1918, shared-address-space, and private targets for this fetch
   * while retaining reserved/loopback/link-local/metadata guards. A function is
   * re-evaluated on every request so deployment flags configured after module
   * load are honored.
   */
  allowPrivateNetwork?: boolean | (() => boolean);
  /** Error factory for guard violations. Defaults to TypeError. */
  createError?: (message: string) => Error;
  /** Maximum redirect hops followed before the request fails. */
  maxRedirects?: number;
  /**
   * DNS lookup override: `null` disables resolved-address validation for this
   * fetch, `undefined` uses the module default (`node:dns` when available).
   */
  lookup?: GuardedFetchDnsLookup | null;
  /**
   * Skip the DNS resolved-address check (the URL and redirect-`Location` guards
   * still run). Only safe when the request host is fixed/code-controlled, never
   * derived from user or credential input — there the check is redundant and
   * only adds a per-request lookup. On by default.
   */
  skipDnsValidation?: boolean;
}

// Match the platform default for `redirect: "follow"` (undici/browsers follow up
// to 20 hops) so wrapping the transport does not fail legitimate long redirect
// chains that previously succeeded.
const defaultMaxRedirects = 20;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
/**
 * Credential-bearing headers dropped when a redirect crosses origins. Covers the
 * fetch-spec set (`authorization`/`cookie`/`proxy-authorization`) plus the
 * custom auth headers provider egress commonly sends (`x-api-key`, `api-key`,
 * `x-auth-token`, and similar key/token/secret headers), so a cross-origin
 * redirect cannot exfiltrate a provider credential.
 */
const crossOriginSensitiveHeaderPattern =
  /^(authorization|cookie|proxy-authorization|(x-)?(api[-_]?key|auth[-_]?token|access[-_]?token|api[-_]?token|app[-_]?key|.*[-_](key|token|secret|password)))$/u;
/** Body-describing headers dropped when a redirect rewrites the method to GET, mirroring the fetch spec. */
const bodyHeaders = ["content-encoding", "content-language", "content-length", "content-location", "content-type"];

/** Base transport behind each guarded fetch (undefined = global fetch) so re-wrapping never stacks guards. */
const guardedFetchBases = new WeakMap<typeof fetch, typeof fetch | undefined>();

let defaultLookupOverridden = false;
let defaultLookupOverride: GuardedFetchDnsLookup | null = null;
let nodeDnsLookupPromise: Promise<GuardedFetchDnsLookup | undefined> | undefined;

/**
 * Override the module-default DNS lookup used by guarded fetches that do not
 * set their own `lookup` option: a function replaces it, `null` disables
 * resolved-address validation, and `undefined` restores the automatic
 * `node:dns` default. Tests use `null` so unit suites never touch real DNS.
 */
export function setDefaultGuardedFetchDnsLookup(lookup: GuardedFetchDnsLookup | null | undefined): void {
  defaultLookupOverridden = lookup !== undefined;
  defaultLookupOverride = lookup ?? null;
}

/**
 * Return the raw transport behind a fetch produced by {@link createGuardedFetch}
 * (undefined when it wraps the global fetch), or the input itself when it is
 * not guarded. Lets callers re-wrap with a different policy without stacking
 * two guards, e.g. Dokploy re-guarding a shared fetcher with its
 * private-network opt-in.
 */
export function unwrapGuardedFetch(fetcher: typeof fetch | undefined): typeof fetch | undefined {
  if (fetcher !== undefined && guardedFetchBases.has(fetcher)) {
    return guardedFetchBases.get(fetcher);
  }
  return fetcher;
}

/**
 * Create a fetch-compatible function that enforces the shared SSRF policy on
 * every network hop instead of only on the caller-supplied URL:
 *
 * - The request URL and every redirect `Location` are validated with
 *   {@link assertPublicHttpUrl}, so a public URL cannot redirect provider
 *   egress into loopback/link-local/metadata/private targets.
 * - Redirects are followed manually (bounded by `maxRedirects`) with
 *   spec-equivalent method/body rewrites, and credential-bearing headers are
 *   dropped on cross-origin hops.
 * - When a DNS lookup is available, hostnames are resolved before each hop and
 *   requests to names resolving to blocked addresses are rejected, closing the
 *   static DNS name→private-IP bypass. Lookup failures fall through to the
 *   transport so unreachable hosts still surface their natural network error.
 *   (True time-of-check/time-of-use DNS rebinding with low-TTL records remains
 *   possible because the transport re-resolves; full connection pinning is not
 *   expressible over the fetch API.) The default lookup uses `node:dns`; on
 *   runtimes without it (e.g. Cloudflare Workers) this layer degrades to a no-op
 *   and only the URL-literal and redirect-`Location` checks apply.
 *
 * Callers that pass `redirect: "manual"` or `redirect: "error"` keep native
 * semantics: the first response (or native redirect error) is returned after
 * the initial URL and its resolved addresses are validated.
 */
export function createGuardedFetch(options: GuardedFetchOptions = {}): typeof fetch {
  const baseFetch = unwrapGuardedFetch(options.fetch);
  const createError = options.createError ?? ((message: string) => new TypeError(message));
  const maxRedirects = options.maxRedirects ?? defaultMaxRedirects;

  const guardedFetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const transport = baseFetch ?? globalThis.fetch;
    const allowPrivateNetwork =
      typeof options.allowPrivateNetwork === "function"
        ? options.allowPrivateNetwork()
        : options.allowPrivateNetwork === true;
    const lookup = options.skipDnsValidation
      ? null
      : options.lookup === undefined
        ? await resolveDefaultLookup()
        : options.lookup;
    const guardHop = async (value: string, fieldName: string): Promise<URL> => {
      const url = assertPublicHttpUrl(value, { fieldName, createError, allowPrivateNetwork });
      await assertResolvedAddressesAllowed(url.hostname, fieldName, { allowPrivateNetwork, createError, lookup });
      return url;
    };

    const request = input instanceof Request ? input : undefined;
    let url = await guardHop(request?.url ?? (input instanceof URL ? input.href : String(input)), "request URL");

    const redirectMode = init?.redirect ?? request?.redirect ?? "follow";
    if (redirectMode !== "follow") {
      return transport(input, init);
    }

    let method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers ?? request?.headers);
    let body: BodyInit | null | undefined = init?.body !== undefined ? init.body : request?.body;

    for (let redirects = 0; ; redirects++) {
      const response =
        redirects === 0
          ? request
            ? await transport(new Request(request, { ...init, redirect: "manual" }))
            : await transport(url.toString(), { ...init, redirect: "manual" })
          : await transport(url.toString(), {
              ...init,
              method,
              // Clone per hop: later hops mutate `headers`, and a transport that
              // captures the reference (rather than snapshotting) must not see
              // those later edits on an already-issued request.
              headers: new Headers(headers),
              body: body ?? undefined,
              redirect: "manual",
              signal: init?.signal ?? request?.signal ?? null,
            });

      if (!redirectStatuses.has(response.status)) {
        return response;
      }
      const location = response.headers.get("location");
      if (location === null) {
        return response;
      }
      await cancelResponseBody(response);
      if (redirects >= maxRedirects) {
        throw createError("request was redirected too many times");
      }

      let nextUrl: URL;
      try {
        nextUrl = new URL(location, url);
      } catch {
        throw createError("redirect location must be a valid URL");
      }
      const guardedNext = await guardHop(nextUrl.toString(), "redirect location");

      if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
        if (method !== "GET" && method !== "HEAD") {
          method = "GET";
        }
        body = undefined;
        for (const name of bodyHeaders) {
          headers.delete(name);
        }
      } else if (body !== undefined && body !== null && !isReplayableBody(body)) {
        throw createError("redirect cannot be followed because the request body is not replayable");
      }
      if (guardedNext.origin !== url.origin) {
        for (const name of [...headers.keys()]) {
          if (crossOriginSensitiveHeaderPattern.test(name)) {
            headers.delete(name);
          }
        }
      }
      url = guardedNext;
    }
  }) as typeof fetch;

  guardedFetchBases.set(guardedFetch, baseFetch);
  return guardedFetch;
}

interface ResolvedAddressPolicy {
  allowPrivateNetwork: boolean;
  createError: (message: string) => Error;
  lookup: GuardedFetchDnsLookup | null | undefined;
}

async function assertResolvedAddressesAllowed(
  hostname: string,
  fieldName: string,
  policy: ResolvedAddressPolicy,
): Promise<void> {
  // Skip resolution only for canonical IPv4 literals, which assertPublicHttpUrl
  // has already address-validated. Looser numeric forms (octal, out-of-range)
  // that it did not recognize as an IP must go through DNS validation, since a
  // resolver may still interpret them as a reserved address.
  if (!policy.lookup || isIpv4Address(hostname)) {
    return;
  }

  let results: ResolvedAddress[];
  try {
    results = await policy.lookup(hostname);
  } catch {
    // Fail closed: once a lookup is enabled, a resolution failure must not
    // silently skip address validation, or a forced-failure / split-resolver
    // could bypass the guard. A genuinely unresolvable host fails here instead
    // of at the transport, with the same net outcome (the request is rejected).
    throw policy.createError(`${fieldName} could not be resolved for validation`);
  }
  if (!Array.isArray(results)) {
    throw policy.createError(`${fieldName} could not be resolved for validation`);
  }
  for (const entry of results) {
    if (entry && typeof entry.address === "string" && isBlockedIpAddress(entry.address, policy.allowPrivateNetwork)) {
      throw policy.createError(`${fieldName} must not resolve to private or reserved IP addresses`);
    }
  }
}

async function resolveDefaultLookup(): Promise<GuardedFetchDnsLookup | null | undefined> {
  if (defaultLookupOverridden) {
    return defaultLookupOverride;
  }
  nodeDnsLookupPromise ??= import("node:dns/promises").then(
    ({ lookup }) =>
      (hostname: string) =>
        lookup(hostname, { all: true }),
    () => undefined,
  );
  return nodeDnsLookupPromise;
}

function isReplayableBody(body: BodyInit): boolean {
  return (
    typeof body === "string" ||
    body instanceof URLSearchParams ||
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body)
  );
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Ignore cancellation failures; the body is abandoned either way.
  }
}
