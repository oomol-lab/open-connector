import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
  setSearchParams,
} from "../provider-runtime.ts";

interface PretixCredential {
  token: string;
  baseUrl: string;
}

export interface PretixActionContext extends PretixCredential {
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type PretixActionHandler = (input: Record<string, unknown>, context: PretixActionContext) => Promise<unknown>;

const requestTimeoutMs = 30_000;

export const pretixActionHandlers: ProviderActionHandlers<"pretix", PretixActionHandler> = {
  async list_organizers(input, context) {
    return normalizePage(await requestPretix(context, "/api/v1/organizers/", pickPageQuery(input)), "organizers");
  },
  async get_organizer(input, context) {
    return { organizer: await requestPretix(context, `/api/v1/organizers/${segment(input.organizer)}/`) };
  },
  async list_events(input, context) {
    return normalizePage(
      await requestPretix(context, `/api/v1/organizers/${segment(input.organizer)}/events/`, pickPageQuery(input)),
      "events",
    );
  },
  async get_event(input, context) {
    return {
      event: await requestPretix(
        context,
        `/api/v1/organizers/${segment(input.organizer)}/events/${segment(input.event)}/`,
      ),
    };
  },
  async list_items(input, context) {
    return normalizePage(
      await requestPretix(
        context,
        `/api/v1/organizers/${segment(input.organizer)}/events/${segment(input.event)}/items/`,
        pickPageQuery(input),
      ),
      "items",
    );
  },
  async get_item(input, context) {
    return {
      item: await requestPretix(
        context,
        `/api/v1/organizers/${segment(input.organizer)}/events/${segment(input.event)}/items/${segment(input.itemId)}/`,
      ),
    };
  },
  async list_orders(input, context) {
    return normalizePage(
      await requestPretix(
        context,
        `/api/v1/organizers/${segment(input.organizer)}/events/${segment(input.event)}/orders/`,
        {
          page: optionalQueryValue(input.page),
          ordering: optionalString(input.ordering),
          status: optionalString(input.status),
          search: optionalString(input.search),
          modified_since: optionalString(input.modifiedSince),
        },
      ),
      "orders",
    );
  },
  async get_order(input, context) {
    return {
      order: await requestPretix(
        context,
        `/api/v1/organizers/${segment(input.organizer)}/events/${segment(input.event)}/orders/${segment(input.orderCode)}/`,
      ),
    };
  },
};

export function createPretixContext(
  apiKey: string,
  baseUrl: unknown,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): PretixActionContext {
  const token = apiKey.trim();
  if (!token) throw new ProviderRequestError(400, "pretix API token is required");
  return { token, baseUrl: normalizePretixBaseUrl(baseUrl), fetcher, signal };
}

export async function validatePretixCredential(
  apiKey: string,
  baseUrl: unknown,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createPretixContext(apiKey, baseUrl, fetcher, signal);
  await requestPretix(context, "/api/v1/organizers/", { page: "1" });
  const instanceUrl = new URL(context.baseUrl);
  const host = instanceUrl.host;
  const instanceHash = createHash("sha256").update(context.baseUrl).digest("hex");
  const tokenHash = createHash("sha256").update(context.token).digest("hex");
  return {
    profile: {
      accountId: `pretix:${host}:${instanceHash.slice(0, 12)}:${tokenHash.slice(0, 16)}`,
      displayName: `pretix ${host}${instanceUrl.pathname.replace(/\/$/, "")}`,
      grantedScopes: [],
    },
    metadata: { baseUrl: context.baseUrl },
  };
}

export function normalizePretixBaseUrl(value: unknown): string {
  const raw = optionalString(value)?.trim();
  if (!raw) throw new ProviderRequestError(400, "baseUrl is required");
  const url = assertPublicHttpUrl(raw, {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
    allowPrivateNetwork: isPrivateNetworkAccessAllowed(),
  });
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "baseUrl must use https");
  }
  if (url.search || url.hash) {
    throw new ProviderRequestError(400, "baseUrl must not include query parameters or a fragment");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

async function requestPretix(
  context: PretixActionContext,
  path: string,
  query: Record<string, string | undefined> = {},
): Promise<unknown> {
  const url = new URL(`${context.baseUrl}${path}`);
  setSearchParams(url, query);
  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);
  try {
    const response = await context.fetcher(url, {
      headers: {
        accept: "application/json",
        authorization: `Token ${context.token}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "pretix returned a non-JSON response",
    });
    if (!response.ok) throw mapPretixError(response.status, payload);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "pretix request timed out after 30 seconds");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error && error.message.trim()
        ? `pretix request failed: ${error.message}`
        : "pretix request failed: request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function mapPretixError(status: number, payload: unknown): ProviderRequestError {
  const detail = optionalString(optionalRecord(payload)?.detail) ?? `HTTP ${status}`;
  if (status === 401) return new ProviderRequestError(401, `pretix authentication failed: ${detail}`);
  if (status === 403) return new ProviderRequestError(403, `pretix denied access: ${detail}`);
  if (status === 429) return new ProviderRequestError(429, `pretix rate limit exceeded: ${detail}`);
  if (status === 400) return new ProviderRequestError(400, `pretix rejected the request: ${detail}`);
  return new ProviderRequestError(status >= 500 ? 502 : status, `pretix request failed: ${detail}`);
}

function normalizePage(payload: unknown, field: string): Record<string, unknown> {
  const page = optionalRecord(payload);
  if (!page || !Array.isArray(page.results)) {
    throw new ProviderRequestError(502, "pretix returned an invalid paginated response");
  }
  return {
    count: optionalInteger(page.count) ?? page.results.length,
    next: optionalString(page.next) ?? null,
    previous: optionalString(page.previous) ?? null,
    [field]: page.results,
  };
}

function pickPageQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return { page: optionalQueryValue(input.page), ordering: optionalString(input.ordering) };
}

function optionalQueryValue(value: unknown): string | undefined {
  return value === undefined ? undefined : String(value);
}

function segment(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new ProviderRequestError(400, "pretix path parameter is required");
  }
  return encodeURIComponent(String(value));
}
