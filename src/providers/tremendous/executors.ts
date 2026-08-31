import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const tremendousApiBaseUrl = "https://api.tremendous.com/api/v2";
export const tremendousValidationPath = "/organizations";
const service = "tremendous";

type TremendousPhase = "validate" | "execute";
type TremendousActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const tremendousActionHandlers: ProviderActionHandlers<"tremendous", TremendousActionHandler> = {
  async list_products(input, context) {
    const payload = await requestTremendousJson({
      context,
      method: "GET",
      path: "/products",
      query: buildQueryParams(input, ["country", "currency", "subcategory"]),
      phase: "execute",
    });
    const body = requireProviderObject(payload, "Tremendous products list response");

    return {
      products: requireObjectArrayPayload(body.products, "Tremendous products list response"),
      raw: body,
    };
  },
  async get_product(input, context) {
    const payload = await requestTremendousJson({
      context,
      method: "GET",
      path: `/products/${encodeURIComponent(readRequiredString(input, "id"))}`,
      phase: "execute",
    });
    const body = requireProviderObject(payload, "Tremendous product response");

    return {
      product: requireNestedObject(body, "product", "Tremendous product response"),
      raw: body,
    };
  },
  async list_campaigns(_input, context) {
    const payload = await requestTremendousJson({
      context,
      method: "GET",
      path: "/campaigns",
      phase: "execute",
    });
    const body = requireProviderObject(payload, "Tremendous campaigns list response");

    return {
      campaigns: requireObjectArrayPayload(body.campaigns, "Tremendous campaigns list response"),
      raw: body,
    };
  },
  async get_campaign(input, context) {
    const payload = await requestTremendousJson({
      context,
      method: "GET",
      path: `/campaigns/${encodeURIComponent(readRequiredString(input, "id"))}`,
      phase: "execute",
    });
    const body = requireProviderObject(payload, "Tremendous campaign response");

    return {
      campaign: requireNestedObject(body, "campaign", "Tremendous campaign response"),
      raw: body,
    };
  },
  async list_funding_sources(_input, context) {
    const payload = await requestTremendousJson({
      context,
      method: "GET",
      path: "/funding_sources",
      phase: "execute",
    });
    const body = requireProviderObject(payload, "Tremendous funding sources list response");

    return {
      fundingSources: requireObjectArrayPayload(body.funding_sources, "Tremendous funding sources list response"),
      raw: body,
    };
  },
  async get_funding_source(input, context) {
    const payload = await requestTremendousJson({
      context,
      method: "GET",
      path: `/funding_sources/${encodeURIComponent(readRequiredString(input, "id"))}`,
      phase: "execute",
    });
    const body = requireProviderObject(payload, "Tremendous funding source response");

    return {
      fundingSource: requireNestedObject(body, "funding_source", "Tremendous funding source response"),
      raw: body,
    };
  },
  async list_organizations(_input, context) {
    const payload = await requestTremendousJson({
      context,
      method: "GET",
      path: tremendousValidationPath,
      phase: "execute",
    });
    const body = requireProviderObject(payload, "Tremendous organizations list response");

    return {
      organizations: requireObjectArrayPayload(body.organizations, "Tremendous organizations list response"),
      raw: body,
    };
  },
  async list_orders(input, context) {
    const payload = await requestTremendousJson({
      context,
      method: "GET",
      path: "/orders",
      query: buildQueryParams(input, [
        "offset",
        "limit",
        ["campaignId", "campaign_id"],
        ["externalId", "external_id"],
        ["createdAtGte", "created_at[gte]"],
        ["createdAtLte", "created_at[lte]"],
      ]),
      phase: "execute",
    });
    const body = requireProviderObject(payload, "Tremendous orders list response");

    return {
      orders: requireObjectArrayPayload(body.orders, "Tremendous orders list response"),
      totalCount: readRequiredNumber(body, "total_count", "Tremendous orders list response"),
      raw: body,
    };
  },
  async get_order(input, context) {
    const payload = await requestTremendousJson({
      context,
      method: "GET",
      path: `/orders/${encodeURIComponent(readRequiredString(input, "id"))}`,
      phase: "execute",
    });
    const body = requireProviderObject(payload, "Tremendous order response");

    return {
      order: requireNestedObject(body, "order", "Tremendous order response"),
      raw: body,
    };
  },
  async create_order(input, context) {
    const payload = await requestTremendousJson({
      context,
      method: "POST",
      path: "/orders",
      body: buildCreateOrderBody(input),
      phase: "execute",
    });
    const body = requireProviderObject(payload, "Tremendous create order response");

    return {
      order: requireNestedObject(body, "order", "Tremendous create order response"),
      raw: body,
    };
  },
  async list_rewards(input, context) {
    const payload = await requestTremendousJson({
      context,
      method: "GET",
      path: "/rewards",
      query: buildQueryParams(input, ["offset", "limit"]),
      phase: "execute",
    });
    const body = requireProviderObject(payload, "Tremendous rewards list response");

    return {
      rewards: requireObjectArrayPayload(body.rewards, "Tremendous rewards list response"),
      totalCount: readRequiredNumber(body, "total_count", "Tremendous rewards list response"),
      raw: body,
    };
  },
  async get_reward(input, context) {
    const payload = await requestTremendousJson({
      context,
      method: "GET",
      path: `/rewards/${encodeURIComponent(readRequiredString(input, "id"))}`,
      phase: "execute",
    });
    const body = requireProviderObject(payload, "Tremendous reward response");

    return {
      reward: requireNestedObject(body, "reward", "Tremendous reward response"),
      raw: body,
    };
  },
  async generate_reward_link(input, context) {
    const payload = await requestTremendousJson({
      context,
      method: "POST",
      path: `/rewards/${encodeURIComponent(readRequiredString(input, "id"))}/generate_link`,
      phase: "execute",
    });
    const body = requireProviderObject(payload, "Tremendous generate reward link response");

    return {
      reward: requireNestedObject(body, "reward", "Tremendous generate reward link response"),
      raw: body,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, tremendousActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: tremendousApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const payload = await requestTremendousJson({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      method: "GET",
      path: tremendousValidationPath,
      phase: "validate",
    });
    const body = requireProviderObject(payload, "Tremendous organizations list response");
    const organizations = requireObjectArrayPayload(body.organizations, "Tremendous organizations list response");
    const organization = organizations[0];
    const organizationId = optionalString(organization?.id);
    const organizationName = optionalString(organization?.name);

    return {
      profile: {
        accountId: organizationId ?? "tremendous-api-key",
        displayName: organizationName ? `Tremendous ${organizationName}` : "Tremendous API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: tremendousApiBaseUrl,
        validationEndpoint: tremendousValidationPath,
        organizationId: organizationId ?? null,
        organizationName: organizationName ?? null,
      },
    };
  },
};

async function requestTremendousJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  method: string;
  path: string;
  phase: TremendousPhase;
  query?: URLSearchParams;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal);

  try {
    const response = await input.context.fetcher(buildTremendousUrl(input), {
      method: input.method,
      headers: buildTremendousHeaders(input.context.apiKey, Boolean(input.body)),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readTremendousPayload(response);

    if (!response.ok) {
      throw createTremendousError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Tremendous request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Tremendous request failed: ${error.message}` : "Tremendous request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildTremendousUrl(input: { path: string; query?: URLSearchParams }): URL {
  const relativePath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(relativePath, `${tremendousApiBaseUrl}/`);
  if (input.query) {
    url.search = input.query.toString();
  }
  return url;
}

function buildTremendousHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function buildQueryParams(
  input: Record<string, unknown>,
  allowed: readonly (string | readonly [string, string])[],
): URLSearchParams | undefined {
  const query = new URLSearchParams();

  for (const field of allowed) {
    const inputKey = typeof field == "string" ? field : field[0];
    const outputKey = typeof field == "string" ? field : field[1];
    const value = input[inputKey];
    if (value == null || value === "") {
      continue;
    }
    query.set(outputKey, String(value));
  }

  return query.size > 0 ? query : undefined;
}

function buildCreateOrderBody(input: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    external_id: input.externalId,
    payment: {
      funding_source_id: readRequiredString(input, "fundingSourceId"),
    },
    reward: {
      campaign_id: input.campaignId,
      products: input.products,
      value: input.value,
      recipient: input.recipient,
      deliver_at: input.deliverAt,
      custom_fields: input.customFields,
      language: input.language,
      delivery: input.delivery,
    },
  };
  body.reward = jsonObject(body.reward as Record<string, unknown>);
  return jsonObject(body);
}

async function readTremendousPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return text;
    }
    throw new ProviderRequestError(502, "invalid Tremendous JSON response");
  }
}

function createTremendousError(status: number, payload: unknown, phase: TremendousPhase): ProviderRequestError {
  const message = extractTremendousErrorMessage(payload) ?? `Tremendous request failed with status ${status}`;

  if (phase == "validate" && (status == 401 || status == 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase == "execute" && (status == 401 || status == 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status == 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractTremendousErrorMessage(payload: unknown): string | undefined {
  if (typeof payload == "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const errors = optionalRecord(record.errors);

  return (
    optionalString(errors?.message)?.trim() ??
    optionalString(record.message)?.trim() ??
    optionalString(record.error)?.trim()
  );
}

function readRequiredString(input: Record<string, unknown>, key: string): string {
  return requiredString(input[key], key, (message) => new ProviderRequestError(400, message));
}

function readRequiredNumber(input: Record<string, unknown>, key: string, label: string): number {
  const value = input[key];
  if (typeof value != "number") {
    throw new ProviderRequestError(502, `${label} ${key} is invalid`, input);
  }
  return value;
}

function requireProviderObject(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is invalid`, payload);
  }

  return record;
}

function requireNestedObject(input: Record<string, unknown>, key: string, label: string): Record<string, unknown> {
  return requireProviderObject(input[key], `${label} ${key}`);
}

function requireObjectArrayPayload(payload: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `${label} is invalid`, payload);
  }

  return payload.map((item) => requireProviderObject(item, `${label} item`));
}
