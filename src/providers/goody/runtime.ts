import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const goodyApiBaseUrl = "https://api.ongoody.com";

type GoodyRequestPhase = "validate" | "execute";
type GoodyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const goodyActionHandlers: ProviderActionHandlers<"goody", GoodyActionHandler> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  list_products(input, context) {
    return listProducts(input, context);
  },
  get_product(input, context) {
    return getProduct(input, context);
  },
  list_orders(input, context) {
    return listOrders(input, context);
  },
  get_order(input, context) {
    return getOrder(input, context);
  },
  list_payment_methods(_input, context) {
    return goodyRequest({
      path: "/v1/payment_methods",
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  list_workspaces(_input, context) {
    return goodyRequest({
      path: "/v1/workspaces",
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
};

export async function validateGoodyCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await goodyRequest({
    path: "/v1/me",
    method: "GET",
    apiKey: input.apiKey,
    fetcher,
    signal,
    phase: "validate",
  });
  const response = requireObject(payload, "goody current user response");
  const email = optionalString(response.email);

  return {
    profile: {
      accountId: email ?? "goody",
      displayName: email ?? "Goody API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: goodyApiBaseUrl,
      validationEndpoint: "/v1/me",
      publicAppId: optionalString(response.public_app_id),
    }),
  };
}

async function getCurrentUser(context: ApiKeyProviderContext): Promise<unknown> {
  const response = requireObject(
    await goodyRequest({
      path: "/v1/me",
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    }),
    "goody current user response",
  );

  return {
    email: response.email === null ? null : optionalString(response.email),
    public_app_id: response.public_app_id === null ? null : optionalString(response.public_app_id),
    raw: response,
  };
}

async function listProducts(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return goodyRequest({
    path: buildPath("/v1/products", {
      page: input.page,
      per_page: input.per_page,
      use_custom_catalog: input.use_custom_catalog,
      country_code: input.country_code,
      custom_catalog_show_inactive: input.custom_catalog_show_inactive,
    }),
    method: "GET",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
}

async function getProduct(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return goodyRequest({
    path: buildPath(`/v1/products/${encodeURIComponent(String(input.id))}`, {
      use_custom_catalog: input.use_custom_catalog,
    }),
    method: "GET",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
}

async function listOrders(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return goodyRequest({
    path: buildPath("/v1/orders", {
      page: input.page,
      per_page: input.per_page,
      "created_at[after]": input.created_at_after,
      "created_at[before]": input.created_at_before,
    }),
    method: "GET",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
}

async function getOrder(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return goodyRequest({
    path: `/v1/orders/${encodeURIComponent(String(input.id))}`,
    method: "GET",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
}

interface GoodyRequestInput {
  path: string;
  method: "GET";
  apiKey: string;
  fetcher: typeof fetch;
  phase: GoodyRequestPhase;
  signal?: AbortSignal;
}

async function goodyRequest(input: GoodyRequestInput): Promise<unknown> {
  let response: Response;
  let payload: unknown;

  try {
    response = await input.fetcher(new URL(input.path, goodyApiBaseUrl), {
      method: input.method,
      headers: goodyHeaders(input.apiKey),
      signal: input.signal,
    });
    payload = await readGoodyPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `goody request failed: ${error.message}` : "goody request failed",
    );
  }

  if (!response.ok) {
    throw createGoodyError(response, payload, input.phase);
  }

  return payload;
}

function goodyHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

function buildPath(path: string, query: Record<string, unknown>): string {
  const url = new URL(path, goodyApiBaseUrl);
  for (const [key, value] of Object.entries(compactObject(query))) {
    url.searchParams.set(key, String(value));
  }
  return `${url.pathname}${url.search}`;
}

async function readGoodyPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createGoodyError(response: Response, payload: unknown, phase: GoodyRequestPhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? (response.statusText.trim() || "goody request failed");

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 402 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const object = optionalRecord(payload);
  const error = optionalString(object?.error);
  if (error?.trim()) {
    return error;
  }

  const message = optionalString(object?.message);
  return message?.trim() ? message : undefined;
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return record;
}
