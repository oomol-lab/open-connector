import type { CredentialValidationResult } from "../../core/types.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
  runProviderRequest,
} from "../provider-runtime.ts";

export type ZerotierApiVersion = "v1" | "v2";

export interface ZerotierActionContext {
  apiVersion: ZerotierApiVersion;
  apiKey: string;
  orgId?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

/** Legacy Central base URL; requests authenticate with `Authorization: token <key>`. */
export const zerotierV1BaseUrl = "https://api.zerotier.com/api/v1";
/** New Central base URL; requests authenticate with `Authorization: Bearer <key>`. */
export const zerotierV2BaseUrl = "https://central.zerotier.com/api/v2";
const zerotierV2BetaBaseUrl = "https://central.zerotier.com/api/v2beta";

export function parseZerotierApiVersion(value: unknown): ZerotierApiVersion {
  const version = optionalString(value)?.trim().toLowerCase();
  if (version === "v1" || version === "v2") {
    return version;
  }
  throw providerInputError('zerotier apiVersion must be "v1" (Legacy Central) or "v2" (New Central).');
}

export function createZerotierContext(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): ZerotierActionContext {
  const apiVersion = parseZerotierApiVersion(values.apiVersion);
  const apiKey = optionalString(values.apiKey)?.trim();
  if (!apiKey) {
    throw providerInputError("zerotier apiKey is required.");
  }
  return {
    apiVersion,
    apiKey,
    orgId: optionalString(values.orgId)?.trim(),
    fetcher,
    signal,
  };
}

export function zerotierAuthorizationHeader(credential: { apiVersion: ZerotierApiVersion; apiKey: string }): string {
  return credential.apiVersion === "v2" ? `Bearer ${credential.apiKey}` : `token ${credential.apiKey}`;
}

function zerotierBaseUrl(context: ZerotierActionContext, beta?: boolean): string {
  if (context.apiVersion === "v1") {
    if (beta) {
      throw providerInputError("ZeroTier beta endpoints are only available on the v2 (New Central) API.");
    }
    return zerotierV1BaseUrl;
  }
  return beta ? zerotierV2BetaBaseUrl : zerotierV2BaseUrl;
}

interface ZerotierRequestOptions {
  method?: string;
  /** API path relative to the versioned base URL, e.g. "/network". */
  path: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
  /** Hit /api/v2beta instead of /api/v2 (v2 only). */
  beta?: boolean;
}

/** Run one ZeroTier Central API request and return the parsed JSON payload, or null for empty bodies. */
export async function zerotierRequest(
  context: ZerotierActionContext,
  options: ZerotierRequestOptions,
): Promise<unknown> {
  return runProviderRequest({ signal: context.signal, label: "ZeroTier" }, async (signal) => {
    const url = new URL(zerotierBaseUrl(context, options.beta) + options.path);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const item of value) {
            url.searchParams.append(key, item);
          }
        } else {
          url.searchParams.set(key, value);
        }
      }
    }
    const response = await context.fetcher(url, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: zerotierAuthorizationHeader(context),
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "ZeroTier returned invalid JSON",
    });
    if (!response.ok) {
      const message =
        optionalString(optionalRecord(payload)?.message) ?? `ZeroTier request failed with status ${response.status}`;
      throw new ProviderRequestError(response.status, message);
    }
    return payload;
  });
}

/** Require a specific ZeroTier API version on the connection. */
export function requireZerotierApiVersion(context: ZerotierActionContext, version: ZerotierApiVersion): void {
  if (context.apiVersion !== version) {
    throw providerInputError(
      `This action requires a ${version} ZeroTier connection; the connection is configured for ${context.apiVersion}.`,
    );
  }
}

/** Wrap a ZeroTier array response into the action list envelope. */
export function zerotierList(payload: unknown): Record<string, unknown> {
  if (payload === null || payload === undefined) {
    return { items: [] };
  }
  if (Array.isArray(payload)) {
    return { items: payload };
  }
  const record = optionalRecord(payload);
  if (record && Array.isArray(record.items)) {
    return { items: record.items };
  }
  return { items: [payload] };
}

/** Wrap a ZeroTier object response into the action single-resource envelope. */
export function zerotierResult(payload: unknown): Record<string, unknown> {
  return { result: payload };
}

/** Wrap a mutating ZeroTier response that may have an empty body. */
export function zerotierStatus(payload: unknown): Record<string, unknown> {
  return { ok: true, result: payload };
}

/** Org-id query value used by v2 list endpoints; falls back to the connection's orgId field. */
export function zerotierOrgId(context: ZerotierActionContext, input: Record<string, unknown>): string | undefined {
  return optionalString(input.orgId) ?? context.orgId;
}

const v1ValidationEndpoint = "/status";
const v2ValidationEndpoint = "/org";

/**
 * Verify a ZeroTier credential against the API generation it selects: v1 calls
 * GET /status on Legacy Central, v2 calls GET /org on New Central.
 */
export async function validateZerotierCredential(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createZerotierContext(values, fetcher, signal);
  const path = context.apiVersion === "v1" ? v1ValidationEndpoint : v2ValidationEndpoint;
  const payload = await zerotierRequest(context, { path });

  const record = optionalRecord(payload);
  const displayName =
    context.apiVersion === "v1"
      ? (optionalString(optionalRecord(record?.user)?.displayName) ?? "ZeroTier Central v1")
      : "ZeroTier New Central v2";
  return {
    profile: {
      accountId: `zerotier-${context.apiVersion}`,
      displayName,
    },
    grantedScopes: [],
    metadata: {
      apiVersion: context.apiVersion,
      apiBaseUrl: context.apiVersion === "v1" ? zerotierV1BaseUrl : zerotierV2BaseUrl,
      validationEndpoint: path,
    },
  };
}
