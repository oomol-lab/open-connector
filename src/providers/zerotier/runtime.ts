import type { CredentialValidationResult } from "../../core/types.ts";

import { looseArray, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
  runProviderRequest,
} from "../provider-runtime.ts";

type ZerotierApiVersion = "v1" | "v2";

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
  const version = optionalString(value)?.toLowerCase();
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
  const apiKey = optionalString(values.apiKey);
  if (!apiKey) {
    throw providerInputError("zerotier apiKey is required.");
  }
  return {
    apiVersion,
    apiKey,
    orgId: optionalString(values.orgId),
    fetcher,
    signal,
  };
}

/**
 * Encode one ID as a single path segment. encodeURIComponent leaves "." and
 * ".." intact and new URL() collapses them, so memberId ".." would turn
 * delete_member into DELETE /network/{id}; reject dot segments and separators.
 */
export function zerotierPathSegment(value: string, field: string): string {
  if (value === "." || value === ".." || value.includes("/") || value.includes("\\")) {
    throw providerInputError(`${field} must be a single path segment.`);
  }
  return encodePathSegment(value);
}

export function zerotierAuthorizationHeader(credential: Pick<ZerotierActionContext, "apiVersion" | "apiKey">): string {
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
      // A non-JSON error body (such as a proxy's HTML page) keeps the upstream
      // status instead of becoming a 502 parse failure; only its start is kept.
      invalidJsonFallback: response.ok ? undefined : (text) => ({ message: text.trim().slice(0, 500) }),
    });
    if (!response.ok) {
      const record = optionalRecord(payload);
      const summary = optionalString(record?.message) ?? `ZeroTier request failed with status ${response.status}`;
      // v2 validation failures list the offending fields under details[{field, message}].
      const details = looseArray(record?.details).flatMap((item) => {
        const detail = optionalRecord(item);
        const field = optionalString(detail?.field);
        const reason = optionalString(detail?.message);
        return reason ? [field ? `${field}: ${reason}` : reason] : [];
      });
      const message = details.length > 0 ? `${summary}: ${details.join("; ")}` : summary;
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

/**
 * Wrap a ZeroTier array response into the action list envelope. v2 list
 * endpoints answer `{ items, stats? }`; the aggregate `stats` requested with
 * `stats=true` is kept next to the items.
 */
export function zerotierList(payload: unknown): Record<string, unknown> {
  if (payload === null || payload === undefined) {
    return { items: [] };
  }
  if (Array.isArray(payload)) {
    return { items: payload };
  }
  const record = optionalRecord(payload);
  if (record && Array.isArray(record.items)) {
    return { items: record.items, stats: record.stats };
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

/** Organization ID from the action input, falling back to the connection's orgId field. */
export function zerotierOrgId(context: ZerotierActionContext, input: Record<string, unknown>): string | undefined {
  return optionalString(input.orgId) ?? context.orgId;
}

const v1ValidationEndpoint = "/status";
const v2ValidationEndpoint = "/org";

interface ZerotierCredentialAccount {
  /** Provider-side identity; undefined lets the runtime derive its default account id. */
  accountId?: string;
  displayName: string;
}

/**
 * Legacy Central reports the token's user under `user` on GET /status. The
 * status document itself is not an authorization check, so a response without
 * a user means the token did not authenticate.
 */
function readV1Account(payload: unknown): ZerotierCredentialAccount {
  const user = optionalRecord(optionalRecord(payload)?.user);
  const accountId = optionalString(user?.id);
  if (!accountId) {
    throw new ProviderRequestError(401, "ZeroTier did not return a user for this API token.");
  }
  return {
    accountId,
    displayName: optionalString(user?.displayName) ?? optionalString(user?.email) ?? "ZeroTier Central v1",
  };
}

/**
 * New Central GET /org lists the organizations the service account can reach.
 * A service account belongs to one organization, which identifies the account.
 * A configured orgId must name an organization the key can reach, because the
 * list actions and get_org keep using it; one missing from the list is looked
 * up directly so the upstream 403/404 rejects a mistyped id. Without an orgId,
 * a single listed organization identifies the account, otherwise the runtime
 * default account id applies.
 */
async function readV2Account(context: ZerotierActionContext, payload: unknown): Promise<ZerotierCredentialAccount> {
  const orgs = looseArray(optionalRecord(payload)?.items).map((item) => optionalRecord(item));
  const orgId = context.orgId;
  if (!orgId) {
    const onlyOrg = orgs.length === 1 ? orgs[0] : undefined;
    return {
      accountId: optionalString(onlyOrg?.id),
      displayName: optionalString(onlyOrg?.name) ?? "ZeroTier New Central v2",
    };
  }
  const org =
    orgs.find((item) => optionalString(item?.id) === orgId) ??
    optionalRecord(await zerotierRequest(context, { path: `/org/${zerotierPathSegment(orgId, "orgId")}` }));
  return {
    accountId: optionalString(org?.id) ?? orgId,
    displayName: optionalString(org?.name) ?? "ZeroTier New Central v2",
  };
}

/**
 * Verify a ZeroTier credential against the API generation it selects: v1 calls
 * GET /status on Legacy Central, v2 calls GET /org on New Central (plus
 * GET /org/{orgId} when the configured orgId is not in that list).
 */
export async function validateZerotierCredential(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createZerotierContext(values, fetcher, signal);
  const path = context.apiVersion === "v1" ? v1ValidationEndpoint : v2ValidationEndpoint;
  const payload = await zerotierRequest(context, { path });
  const account = context.apiVersion === "v1" ? readV1Account(payload) : await readV2Account(context, payload);
  return {
    profile: {
      accountId: account.accountId,
      displayName: account.displayName,
    },
    metadata: {
      apiVersion: context.apiVersion,
      apiBaseUrl: context.apiVersion === "v1" ? zerotierV1BaseUrl : zerotierV2BaseUrl,
      validationEndpoint: path,
    },
  };
}
