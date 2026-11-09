import { hmacHex } from "../../core/aws-sigv4.ts";
import { optionalInteger, optionalRawString, optionalRecord } from "../../core/cast.ts";
import {
  ProviderRequestError,
  isAbortLikeError,
  providerUserAgent,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const metaGraphApiVersion: "v27.0" = "v27.0";
export const metaGraphApiBaseUrl: "https://graph.facebook.com/v27.0" = `https://graph.facebook.com/${metaGraphApiVersion}`;

export interface MetaContext {
  accessToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  appSecret?: string;
  profileId?: string;
}

interface MetaRequestOptions {
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  phase?: "validate" | "execute";
}

export function metaRequest(
  path: string,
  context: MetaContext,
  options: MetaRequestOptions = {},
): Promise<Record<string, unknown>> {
  return runProviderRequest({ label: "Meta", signal: context.signal }, async (signal) => {
    const url = new URL(`${metaGraphApiBaseUrl}/${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value != null) {
        url.searchParams.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
      }
    }

    if (context.appSecret && context.accessToken) {
      url.searchParams.set("appsecret_proof", hmacHex(context.appSecret, context.accessToken));
    }

    const headers = new Headers({ accept: "application/json", "user-agent": providerUserAgent });
    if (context.accessToken) {
      headers.set("authorization", `Bearer ${context.accessToken}`);
    }

    if (options.body) {
      headers.set("content-type", "application/json");
    }

    const response = await context.fetcher(url.toString(), {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal,
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (isAbortLikeError(error)) throw error;
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        "Meta returned invalid JSON",
        undefined,
        "provider_error",
      );
    }

    const error = optionalRecord(optionalRecord(payload)?.error);
    if (!response.ok || error) {
      const code = optionalInteger(error?.code);
      const subcode = optionalInteger(error?.error_subcode);
      const detail = optionalRawString(error?.message) ?? `Meta request failed with status ${response.status}`;
      const codes: string[] = [];
      if (code != null) codes.push(`code ${code}`);
      if (subcode != null) codes.push(`subcode ${subcode}`);
      const message = codes.length > 0 ? `${detail} (${codes.join(", ")})` : detail;
      if (code === 190 || code === 102) {
        throw new ProviderRequestError(
          options.phase === "validate" ? 400 : 401,
          message,
          undefined,
          options.phase === "validate" ? "invalid_input" : "authorization_failed",
        );
      }

      if (response.status === 429 || [4, 17, 32, 613].includes(code ?? -1)) {
        throw new ProviderRequestError(429, message, undefined, "rate_limited");
      }

      if (code === 10 || (code != null && 200 <= code && code <= 299)) {
        throw new ProviderRequestError(403, message, undefined, "provider_error");
      }

      if (code === 100) {
        throw new ProviderRequestError(400, message, undefined, "invalid_input");
      }

      throw new ProviderRequestError(response.ok ? 502 : response.status, message, undefined, "provider_error");
    }

    return requiredResponseRecord(payload, "Meta response");
  });
}

export function metaId(value: string): string {
  if (value === "." || value === "..") {
    throw new ProviderRequestError(400, "Invalid Meta object ID", undefined, "invalid_input");
  }

  return encodeURIComponent(value);
}

export function metaAdAccountId(value: string): string {
  return metaId(value.startsWith("act_") ? value : `act_${value}`);
}

export function metaFields(value: unknown, defaults: string): string {
  return Array.isArray(value) ? value.join(",") : (optionalRawString(value) ?? defaults);
}

export function sanitizeMetaOutput(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeMetaOutput);
  }

  const object = optionalRecord(value);
  if (object) {
    return Object.fromEntries(
      Object.entries(object)
        .filter(([key]) => !["access_token", "appsecret_proof", "client_secret"].includes(key))
        .map(([key, item]) => [key, sanitizeMetaOutput(item)]),
    );
  }

  if (typeof value === "string" && (value.startsWith("https://") || value.startsWith("http://"))) {
    try {
      const url = new URL(value);
      let changed = false;
      for (const key of ["access_token", "appsecret_proof", "client_secret"]) {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }

      return changed ? url.toString() : value;
    } catch {
      return value;
    }
  }

  return value;
}

export function normalizePaging(value: unknown): {
  cursors: { before: string | null; after: string | null };
  next: string | null;
  previous: string | null;
} {
  const paging = optionalRecord(value);
  const cursors = optionalRecord(paging?.cursors);
  return {
    cursors: {
      before: optionalRawString(cursors?.before) ?? null,
      after: optionalRawString(cursors?.after) ?? null,
    },
    next: optionalRawString(paging?.next) ?? null,
    previous: optionalRawString(paging?.previous) ?? null,
  };
}
