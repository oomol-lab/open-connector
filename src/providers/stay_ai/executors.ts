import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "stay_ai";
const stayAiApiBaseUrl = "https://api.retextion.com/api/v2";

type StayAiRequestPhase = "validate" | "execute";
type StayAiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const stayAiActionHandlers: ProviderActionHandlers<"stay_ai", StayAiActionHandler> = {
  async get_account_settings(input, context) {
    const payload = await requestStayAiJson({
      path: "/settings",
      context,
      phase: "execute",
      searchParams: buildQuery(input, ["accountId"]),
    });

    return { settings: requiredRecord(payload, "Stay AI account settings", providerResponseError) };
  },
  async list_subscriptions(input, context) {
    return normalizeStayAiList(
      await requestStayAiJson({
        path: "/subscriptions",
        context,
        phase: "execute",
        searchParams: buildQuery(input, [
          "email",
          "status",
          "createdAtMin",
          "createdAtMax",
          "updatedAtMin",
          "updatedAtMax",
          "nextBillingDateMin",
          "nextBillingDateMax",
          "prepaidNextDeliveryDateMin",
          "prepaidNextDeliveryDateMax",
          "page",
          "pageSize",
          "sortBy",
          "sortDirection",
        ]),
      }),
      "subscriptions",
    );
  },
  async get_subscription(input, context) {
    const subscriptionId = requiredString(input.subscriptionId, "subscriptionId", providerInputError);
    const subscription = await requestStayAiJson({
      path: `/subscriptions/${encodeURIComponent(subscriptionId)}`,
      context,
      phase: "execute",
    });

    return { subscription: requiredRecord(subscription, "Stay AI subscription", providerResponseError) };
  },
  async list_orders(input, context) {
    return normalizeStayAiList(
      await requestStayAiJson({
        path: "/orders",
        context,
        phase: "execute",
        searchParams: buildQuery(input, [
          "createdAtMin",
          "createdAtMax",
          "updatedAtMin",
          "updatedAtMax",
          "page",
          "pageSize",
          "sortBy",
          "sortDirection",
        ]),
      }),
      "orders",
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, stayAiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestStayAiJson({
      path: "/settings",
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });
    const settings = requiredRecord(payload, "Stay AI account settings", providerResponseError);
    const emailSenderName = optionalString(settings.emailSenderName);
    const emailSenderAddress = optionalString(settings.emailSenderAddress);

    return {
      profile: {
        accountId: "stay_ai:api_key",
        displayName: emailSenderName ?? emailSenderAddress ?? "Stay AI API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: stayAiApiBaseUrl,
        validationEndpoint: "/settings",
        emailSenderName,
        emailSenderAddress,
      }),
    };
  },
};

async function requestStayAiJson(input: {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: StayAiRequestPhase;
  searchParams?: URLSearchParams;
}): Promise<unknown> {
  const response = await requestStayAi(input);
  const payload = await readStayAiPayload(response);
  if (!response.ok) {
    throw createStayAiError(response, payload, input.phase);
  }
  return payload;
}

async function requestStayAi(input: {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  searchParams?: URLSearchParams;
}): Promise<Response> {
  const url = stayAiUrl(input.path);
  for (const [key, value] of input.searchParams ?? []) {
    url.searchParams.append(key, value);
  }

  try {
    return await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-retextion-access-token": input.context.apiKey,
      },
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Stay AI request failed: ${error.message}` : "Stay AI request failed",
    );
  }
}

async function readStayAiPayload(response: Response): Promise<unknown> {
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

function createStayAiError(response: Response, payload: unknown, phase: StayAiRequestPhase): ProviderRequestError {
  const message = extractStayAiErrorMessage(payload) ?? response.statusText;

  if (response.status === 429) {
    return new ProviderRequestError(429, message || "Stay AI rate limit exceeded", payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message || "invalid Stay AI API key", payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message || "Stay AI credential expired", payload);
  }
  if ([400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message || "invalid Stay AI request", payload);
  }
  return new ProviderRequestError(response.status || 500, message || "Stay AI request failed", payload);
}

function extractStayAiErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : undefined;
  if (!record) {
    return undefined;
  }

  for (const key of ["message", "error", "detail", "title"]) {
    const value = optionalString((record as Record<string, unknown>)[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function buildQuery(input: Record<string, unknown>, keys: readonly string[]): URLSearchParams {
  const searchParams = new URLSearchParams();
  for (const key of keys) {
    const value = input[key];
    if (value === undefined || value === null) {
      continue;
    }
    searchParams.append(key, String(value));
  }
  return searchParams;
}

function normalizeStayAiList(payload: unknown, key: "subscriptions" | "orders"): Record<string, unknown> {
  const record = requiredRecord(payload, `Stay AI ${key} list`, providerResponseError);
  const data = record.data;
  const total = record.total;
  if (!Array.isArray(data)) {
    throw new ProviderRequestError(502, `invalid Stay AI ${key} list`, payload);
  }
  if (typeof total !== "number") {
    throw new ProviderRequestError(502, `invalid Stay AI ${key} total`, payload);
  }
  return {
    total,
    [key]: data,
  };
}

function stayAiUrl(path: string): URL {
  const relativePath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(relativePath, `${stayAiApiBaseUrl}/`);
}
