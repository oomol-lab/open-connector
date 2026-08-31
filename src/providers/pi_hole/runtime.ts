import type { CredentialValidationResult, TransitFileStore } from "../../core/types.ts";
import type { ProviderActionHandlerSubset, ProviderFetch } from "../provider-runtime.ts";

import {
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalObjectArray,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredBoolean,
  requiredRecord,
  requiredString,
  stringArray,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed, readBoundedResponseBytes } from "../../core/request.ts";
import {
  createProviderTimeout,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
  readProviderTextBody,
  readTransitFileInput,
  requiredInputString,
} from "../provider-runtime.ts";

const defaultPiHoleApiPath = "api";
const piHoleGravityOutputTailChars = 2_000;
// Keep in sync with the server-side upload cap (FTL MAXFILESIZE).
const piHoleTeleporterMaxBytes = 50 * 1024 * 1024;
const piHoleNoAuthCacheTtlMs = 5 * 60_000;

export const piHoleCredentialHelpUrl = "https://docs.pi-hole.net/api/";

export interface PiHoleActionContext {
  appPassword: string;
  baseUrl: string;
  apiPath: string;
  transitFiles?: TransitFileStore;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export type PiHoleActionHandler = (input: Record<string, unknown>, context: PiHoleActionContext) => Promise<unknown>;

export type PiHoleQueryValue = string | number | boolean | undefined;

export interface PiHoleRequestOptions {
  context: PiHoleActionContext;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, PiHoleQueryValue>;
  body?: Record<string, unknown> | readonly unknown[] | FormData;
}

interface PiHoleSessionEntry {
  sid: string | null;
  expiresAt: number;
}

/**
 * Cache sessions per instance: re-logging in for every action would consume
 * the instance's session seats. In-flight logins are shared so concurrent
 * cold-start requests do not exhaust them.
 */
const piHoleSessionCache = new Map<string, PiHoleSessionEntry>();
const piHoleLoginInFlight = new Map<string, Promise<PiHoleSessionEntry>>();

function piHoleSessionCacheKey(context: PiHoleActionContext): string {
  return `${context.baseUrl}|${context.apiPath}|${context.appPassword}`;
}

/** Exposed for the test harness. */
export function clearPiHoleSessionCache(): void {
  piHoleSessionCache.clear();
  piHoleLoginInFlight.clear();
}

function buildPiHoleApiUrl(
  context: PiHoleActionContext,
  path: string,
  query?: Record<string, PiHoleQueryValue>,
): string {
  const base = ensureTrailingSlash(context.baseUrl);
  const prefix = `${base}${stripSlashes(context.apiPath)}/`;
  const url = new URL(`./${stripLeadingSlash(path)}`, prefix);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function performPiHoleRequest(options: PiHoleRequestOptions & { sid: string | null }): Promise<Response> {
  const { context } = options;
  const url = buildPiHoleApiUrl(context, options.path, options.query);
  const headers = new Headers({ accept: "application/json", "user-agent": providerUserAgent });
  if (options.sid) {
    headers.set("x-ftl-sid", options.sid);
  }

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }

  const timeout = createProviderTimeout(context.signal);
  try {
    return await context.fetcher(url, {
      method: options.method,
      headers,
      body,
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Pi-hole request timed out");
    }
    throw error;
  } finally {
    timeout.cleanup();
  }
}

async function readPiHolePayload(response: Response): Promise<unknown> {
  return readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "Pi-hole returned an invalid JSON response",
  });
}

function mapPiHoleHttpError(status: number, payload: unknown): ProviderRequestError {
  const error = optionalRecord(optionalRecord(payload)?.error);
  const message = optionalString(error?.message) ?? optionalString(optionalRecord(payload)?.message);
  return new ProviderRequestError(status, message ?? `Pi-hole request failed with HTTP ${status}`, payload);
}

async function authenticatePiHole(context: PiHoleActionContext): Promise<PiHoleSessionEntry> {
  const response = await performPiHoleRequest({
    context,
    method: "POST",
    path: "auth",
    body: { password: context.appPassword },
    sid: null,
  });
  const payload = await readPiHolePayload(response);
  const session = optionalRecord(optionalRecord(payload)?.session);
  if (session?.valid === true) {
    const sid = optionalString(session.sid);
    if (sid === undefined) {
      // No authentication is required on this server; cache the no-auth state for a
      // bounded time so the proxy picks it up if authentication is enabled later.
      return { sid: null, expiresAt: Date.now() + piHoleNoAuthCacheTtlMs };
    }
    const validitySeconds = optionalNumber(session.validity) ?? 0;
    // Leave a small buffer so the cached session expires before the server does.
    return { sid, expiresAt: Date.now() + Math.max(0, validitySeconds - 5) * 1000 };
  }

  if (!response.ok) {
    // HTTP-level failures (rate limiting, invalid TOTP, malformed requests) carry a structured error body.
    throw mapPiHoleHttpError(response.status, payload);
  }

  // A 200 response with an invalid session means the password was rejected.
  if (session?.totp === true) {
    throw new ProviderRequestError(
      401,
      "Pi-hole login failed: two-factor authentication is enabled, so use an application password instead of your account password.",
    );
  }
  throw new ProviderRequestError(401, "Invalid Pi-hole application password.");
}

export async function ensurePiHoleSession(context: PiHoleActionContext): Promise<string | null> {
  const key = piHoleSessionCacheKey(context);
  const cached = piHoleSessionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.sid;
  }

  const inFlight = piHoleLoginInFlight.get(key);
  if (inFlight) {
    return (await inFlight).sid;
  }

  const login = authenticatePiHole(context)
    .then((session) => {
      piHoleSessionCache.set(key, session);
      return session;
    })
    .finally(() => {
      piHoleLoginInFlight.delete(key);
    });
  piHoleLoginInFlight.set(key, login);
  return (await login).sid;
}

export async function requestPiHoleJson(options: PiHoleRequestOptions): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const sid = await ensurePiHoleSession(options.context);
    const response = await performPiHoleRequest({ ...options, sid });
    const payload = await readPiHolePayload(response);
    if (response.ok) {
      return payload;
    }
    if (response.status === 401 && attempt === 0) {
      piHoleSessionCache.delete(piHoleSessionCacheKey(options.context));
      continue;
    }
    throw mapPiHoleHttpError(response.status, payload);
  }
  throw new ProviderRequestError(401, "Pi-hole rejected the session after re-authentication.");
}

/** Raw-response variant for binary endpoints that cannot be read as JSON. */
async function requestPiHoleResponse(options: PiHoleRequestOptions): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const sid = await ensurePiHoleSession(options.context);
    const response = await performPiHoleRequest({ ...options, sid });
    if (response.ok) {
      return response;
    }
    if (response.status === 401 && attempt === 0) {
      piHoleSessionCache.delete(piHoleSessionCacheKey(options.context));
      continue;
    }
    const payload = await readPiHolePayload(response).catch(() => null);
    throw mapPiHoleHttpError(response.status, payload);
  }
  throw new ProviderRequestError(401, "Pi-hole rejected the session after re-authentication.");
}

function encodePiHoleBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function normalizePiHoleBaseUrl(
  value: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  // Private instance targets are allowed only with the deployment opt-in.
  const raw = optionalString(value)?.trim();
  if (!raw) {
    throw new ProviderRequestError(400, "baseUrl is required");
  }

  const url = assertPublicHttpUrl(raw, {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
    allowPrivateNetwork,
  });
  if (url.username || url.password || url.search || url.hash) {
    throw new ProviderRequestError(400, "baseUrl must be a clean instance root URL");
  }

  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  // Users often paste the API root (https://pi.hole/api) as the instance URL;
  // the API path is appended below the root, so drop a trailing api segment to
  // avoid double-prefixing every request.
  if (/\/api$/i.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/api$/i, "") || "/";
  }
  return url.pathname === "/" ? url.origin : `${url.origin}${url.pathname}`;
}

export function normalizePiHoleApiPath(value: unknown): string {
  const raw = optionalString(value)?.trim();
  const normalized = stripSlashes(raw ?? "");
  if (!normalized) {
    return defaultPiHoleApiPath;
  }
  if (/[\s?#]/.test(normalized) || normalized.split("/").includes("..")) {
    throw new ProviderRequestError(400, "apiPath must be a URL path segment such as api");
  }
  return normalized;
}

export function resolvePiHoleBaseUrl(input: {
  values?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): string {
  const value = optionalString(input.metadata?.baseUrl) ?? optionalString(input.values?.baseUrl);
  return normalizePiHoleBaseUrl(value);
}

export function resolvePiHoleApiPath(input: {
  values?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): string {
  const value = optionalString(input.metadata?.apiPath) ?? optionalString(input.values?.apiPath);
  return normalizePiHoleApiPath(value);
}

function readRecordPayload(payload: unknown): Record<string, unknown> {
  return optionalRecord(payload) ?? {};
}

function stripPiHoleTook(payload: Record<string, unknown>): Record<string, unknown> {
  const { took: _took, ...rest } = payload;
  return rest;
}

function readBlockingStatus(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    blocking: optionalString(payload.blocking),
    timer: optionalNumber(payload.timer) ?? null,
  };
}

function readGravityStatus(text: string): string | null {
  if (/\[✗\]|\berror\b|\bfatal\b|\bfailed\b/i.test(text)) {
    return "failed";
  }
  if (/\[✓\]\s*done|\bdone\.?\s*$/im.test(text.trimEnd())) {
    return "success";
  }
  return null;
}

function readRestartFlag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return undefined;
}

export const piHoleActionHandlers: ProviderActionHandlerSubset<"pi_hole", PiHoleActionHandler> = {
  async get_overview(_input, context) {
    const payload = readRecordPayload(await requestPiHoleJson({ context, method: "GET", path: "stats/summary" }));
    return { summary: stripPiHoleTook(payload) };
  },
  async get_dns_blocking_status(_input, context) {
    const payload = readRecordPayload(await requestPiHoleJson({ context, method: "GET", path: "dns/blocking" }));
    return readBlockingStatus(payload);
  },
  async set_dns_blocking(input, context) {
    const blocking = requiredBoolean(input.blocking, "blocking", providerInputError);
    const body: Record<string, unknown> = { blocking };
    if (input.timer !== undefined) {
      if (input.timer === null) {
        body.timer = null;
      } else {
        const timer = optionalNumber(input.timer);
        if (timer === undefined) {
          throw providerInputError("timer must be a number or null");
        }
        body.timer = timer;
      }
    }
    const payload = readRecordPayload(await requestPiHoleJson({ context, method: "POST", path: "dns/blocking", body }));
    return readBlockingStatus(payload);
  },
  async get_queries(input, context) {
    const payload = readRecordPayload(
      await requestPiHoleJson({
        context,
        method: "GET",
        path: "queries",
        query: {
          from: optionalNumber(input.from),
          until: optionalNumber(input.until),
          length: optionalInteger(input.length),
          start: optionalInteger(input.start),
          cursor: optionalInteger(input.cursor),
          domain: optionalString(input.domain),
          client_ip: optionalString(input.clientIp),
          client_name: optionalString(input.clientName),
          upstream: optionalString(input.upstream),
          type: optionalString(input.type),
          status: optionalString(input.status),
          reply: optionalString(input.reply),
          dnssec: optionalString(input.dnssec),
          disk: optionalBoolean(input.disk),
        },
      }),
    );
    return {
      queries: optionalObjectArray(payload.queries, "Pi-hole queries response"),
      cursor: optionalInteger(payload.cursor) ?? null,
      recordsTotal: optionalInteger(payload.recordsTotal) ?? 0,
      recordsFiltered: optionalInteger(payload.recordsFiltered) ?? 0,
      earliestTimestamp: optionalNumber(payload.earliest_timestamp) ?? null,
      earliestTimestampDisk: optionalNumber(payload.earliest_timestamp_disk) ?? null,
    };
  },
  async get_query_types(_input, context) {
    const payload = readRecordPayload(await requestPiHoleJson({ context, method: "GET", path: "stats/query_types" }));
    return { types: optionalRecord(payload.types) ?? {} };
  },
  async get_top_domains(input, context) {
    const payload = readRecordPayload(
      await requestPiHoleJson({
        context,
        method: "GET",
        path: "stats/top_domains",
        query: { count: optionalInteger(input.count), blocked: optionalBoolean(input.blocked) },
      }),
    );
    return {
      domains: optionalObjectArray(payload.domains, "Pi-hole top domains response"),
      totalQueries: optionalInteger(payload.total_queries) ?? 0,
      blockedQueries: optionalInteger(payload.blocked_queries) ?? 0,
    };
  },
  async get_top_clients(input, context) {
    const payload = readRecordPayload(
      await requestPiHoleJson({
        context,
        method: "GET",
        path: "stats/top_clients",
        query: { count: optionalInteger(input.count), blocked: optionalBoolean(input.blocked) },
      }),
    );
    return {
      clients: optionalObjectArray(payload.clients, "Pi-hole top clients response"),
      totalQueries: optionalInteger(payload.total_queries) ?? 0,
      blockedQueries: optionalInteger(payload.blocked_queries) ?? 0,
    };
  },
  async get_recent_blocked(input, context) {
    const payload = readRecordPayload(
      await requestPiHoleJson({
        context,
        method: "GET",
        path: "stats/recent_blocked",
        query: { count: optionalInteger(input.count) },
      }),
    );
    return { blocked: stringArray(payload.blocked, "Pi-hole recent blocked response") };
  },
  async get_upstreams(_input, context) {
    const payload = readRecordPayload(await requestPiHoleJson({ context, method: "GET", path: "stats/upstreams" }));
    return {
      upstreams: optionalObjectArray(payload.upstreams, "Pi-hole upstreams response"),
      forwardedQueries: optionalInteger(payload.forwarded_queries) ?? 0,
      totalQueries: optionalInteger(payload.total_queries) ?? 0,
    };
  },
  async get_history(_input, context) {
    const payload = readRecordPayload(await requestPiHoleJson({ context, method: "GET", path: "history" }));
    return { history: optionalObjectArray(payload.history, "Pi-hole history response") };
  },
  async search_domain(input, context) {
    const domain = requiredInputString(input.domain, "domain");
    const payload = readRecordPayload(
      await requestPiHoleJson({
        context,
        method: "GET",
        path: `search/${encodeURIComponent(domain)}`,
        query: { partial: optionalBoolean(input.partial), N: optionalInteger(input.maxResults) },
      }),
    );
    return { search: optionalRecord(payload.search) ?? {} };
  },
  async get_config(_input, context) {
    const payload = readRecordPayload(await requestPiHoleJson({ context, method: "GET", path: "config" }));
    return { config: optionalRecord(payload.config) ?? {} };
  },
  async update_config(input, context) {
    const config = requiredRecord(input.config, "config", providerInputError);
    const restart = input.restart === undefined ? undefined : readRestartFlag(input.restart);
    if (input.restart !== undefined && restart === undefined) {
      throw providerInputError("restart must be a boolean");
    }
    const payload = readRecordPayload(
      await requestPiHoleJson({
        context,
        method: "PATCH",
        path: "config",
        query: restart === undefined ? undefined : { restart },
        body: { config },
      }),
    );
    return { config: optionalRecord(payload.config) ?? {} };
  },
  async run_gravity(_input, context) {
    // POST /api/action/gravity streams the gravity log as text/plain (chunked)
    // rather than returning JSON, so read it as text and relay a tail of the
    // log alongside a best-effort status.
    for (let attempt = 0; attempt < 2; attempt++) {
      const sid = await ensurePiHoleSession(context);
      const response = await performPiHoleRequest({ context, method: "POST", path: "action/gravity", sid });
      const text = await readProviderTextBody(response, "Pi-hole gravity response");
      if (response.ok) {
        const trimmed = text.trim();
        return {
          status: readGravityStatus(trimmed),
          output:
            trimmed.length > piHoleGravityOutputTailChars ? trimmed.slice(-piHoleGravityOutputTailChars) : trimmed,
        };
      }
      if (response.status === 401 && attempt === 0) {
        piHoleSessionCache.delete(piHoleSessionCacheKey(context));
        continue;
      }
      throw mapPiHoleHttpError(response.status, text);
    }
    throw new ProviderRequestError(401, "Pi-hole rejected the session after re-authentication.");
  },
  async restart_dns(_input, context) {
    const payload = readRecordPayload(await requestPiHoleJson({ context, method: "POST", path: "action/restartdns" }));
    return { status: optionalString(payload.status) ?? null };
  },
  async flush_dns_logs(_input, context) {
    const payload = readRecordPayload(await requestPiHoleJson({ context, method: "POST", path: "action/flush/logs" }));
    return { status: optionalString(payload.status) ?? null };
  },
  async export_backup(_input, context) {
    const response = await requestPiHoleResponse({ context, method: "GET", path: "teleporter" });
    const maxBytes = context.transitFiles?.maxBytes ?? piHoleTeleporterMaxBytes;
    const bytes = await readBoundedResponseBytes(response, {
      maxBytes,
      fieldName: "teleporter export",
      createError: (message) => new ProviderRequestError(413, message),
    });
    if (bytes.length === 0) {
      throw new ProviderRequestError(502, "Pi-hole returned an empty backup response.");
    }
    const name = "teleporter.zip";
    const mimeType = optionalString(response.headers.get("content-type")) ?? "application/zip";
    if (context.transitFiles) {
      const upload = await context.transitFiles.create(new File([Uint8Array.from(bytes)], name, { type: mimeType }));
      return {
        file: {
          fileId: upload.fileId,
          downloadUrl: upload.downloadUrl,
          name: upload.name,
          mimeType: upload.mimeType,
          sizeBytes: upload.sizeBytes,
          data: null,
        },
      };
    }
    return {
      file: {
        name,
        mimeType,
        sizeBytes: bytes.length,
        fileId: null,
        downloadUrl: null,
        data: encodePiHoleBase64(bytes),
      },
    };
  },
  async import_backup(input, context) {
    const file = await readTransitFileInput(input.file, context);
    const form = new FormData();
    form.append("file", new File([file.file], file.name, { type: file.mimeType ?? "application/zip" }));
    const payload = readRecordPayload(
      await requestPiHoleJson({ context, method: "POST", path: "teleporter", body: form }),
    );
    return { files: optionalStringArray(payload.files) ?? [] };
  },
};

/**
 * The validator fetcher must already be re-guarded with the same
 * private-network opt-in as the provider executors.
 */
export async function validatePiHoleCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const appPassword = requiredInputString(input.apiKey, "apiKey");
  const baseUrl = normalizePiHoleBaseUrl(input.values.baseUrl);
  const apiPath = normalizePiHoleApiPath(input.values.apiPath);

  const context = { appPassword, baseUrl, apiPath, fetcher, signal };
  const session = await authenticatePiHole(context);
  if (session.sid) {
    // Validation is a one-shot check, so release the session seat immediately.
    await performPiHoleRequest({ context, method: "DELETE", path: "auth", sid: session.sid }).catch(() => {});
  }

  return {
    profile: {
      accountId: `pi_hole:${baseUrl}`,
      displayName: `Pi-hole (${baseUrl})`,
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      baseUrl,
      apiPath,
      credentialHelpUrl: piHoleCredentialHelpUrl,
    },
  };
}

function stripLeadingSlash(value: string): string {
  return value.replace(/^\/+/, "");
}

function stripSlashes(value: string): string {
  return value.replace(/^\/+/, "").replace(/\/+$/, "");
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
