import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { NinjapearActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "ninjapear";
export const ninjapearApiBaseUrl = "https://nubela.co";

type NinjapearRequestPhase = "validate" | "execute";
type NinjapearQueryValue = string | number | boolean | undefined;
type NinjapearContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type NinjapearActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const ninjapearActionHandlers: Record<NinjapearActionName, NinjapearActionHandler> = {
  get_credit_balance(_, context) {
    return requestNinjapear("/api/v1/meta/credit-balance", {}, context, "execute");
  },

  check_disposable_email(input, context) {
    return requestNinjapear(
      "/api/v1/contact/disposable-email",
      {
        email: requiredNinjapearString(input.email, "email"),
      },
      context,
      "execute",
    );
  },

  lookup_company_website(input, context) {
    return requestNinjapear(
      "/api/v1/company/website",
      {
        company_name: requiredNinjapearString(input.company_name, "company_name"),
        country_code: optionalString(input.country_code),
        hint: optionalString(input.hint),
      },
      context,
      "execute",
    );
  },

  get_company_details(input, context) {
    return requestNinjapear(
      "/api/v1/company/details",
      {
        website: requiredNinjapearString(input.website, "website"),
        include_employee_count: optionalBoolean(input.include_employee_count),
        follower_count: optionalString(input.follower_count),
        addresses: optionalString(input.addresses),
        ...commonCacheQuery(input),
      },
      context,
      "execute",
    );
  },

  get_employee_count(input, context) {
    return requestNinjapear(
      "/api/v1/company/employee-count",
      {
        website: requiredNinjapearString(input.website, "website"),
        ...commonCacheQuery(input),
      },
      context,
      "execute",
    );
  },

  list_customers(input, context) {
    return requestNinjapear(
      "/api/v1/customer/listing",
      {
        website: requiredNinjapearString(input.website, "website"),
        cursor: optionalString(input.cursor),
        page_size: optionalInteger(input.page_size),
        quality_filter: optionalBoolean(input.quality_filter),
        ...commonCacheQuery(input),
      },
      context,
      "execute",
    );
  },

  list_competitors(input, context) {
    return requestNinjapear(
      "/api/v1/competitor/listing",
      {
        website: requiredNinjapearString(input.website, "website"),
        ...commonCacheQuery(input),
      },
      context,
      "execute",
    );
  },

  list_products(input, context) {
    return requestNinjapear(
      "/api/v1/product/listing",
      {
        website: requiredNinjapearString(input.website, "website"),
        ...commonCacheQuery(input),
      },
      context,
      "execute",
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ninjapearActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: ninjapearApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateNinjapearCredential(input.apiKey, fetcher, signal);
  },
};

async function validateNinjapearCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestNinjapear("/api/v1/meta/credit-balance", {}, { apiKey, fetcher, signal }, "validate");
  const creditBalance = optionalNumber(payload.credit_balance);

  return {
    profile: {
      accountId: "ninjapear-api-key",
      displayName: "NinjaPear API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: ninjapearApiBaseUrl,
      validationEndpoint: "/api/v1/meta/credit-balance",
      creditBalance,
    }),
  };
}

async function requestNinjapear(
  path: string,
  query: Record<string, NinjapearQueryValue>,
  context: NinjapearContext,
  phase: NinjapearRequestPhase,
): Promise<Record<string, unknown>> {
  const url = new URL(path, ninjapearApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: ninjapearHeaders(context.apiKey),
      signal: context.signal,
    });
    payload = await readNinjapearPayload(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown transport error";
    throw new ProviderRequestError(502, `NinjaPear request failed: ${message}`);
  }

  if (!response.ok) {
    throw createNinjapearError(response, payload, phase);
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "invalid NinjaPear response", payload);
  }
  return record;
}

function requiredNinjapearString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function commonCacheQuery(input: Record<string, unknown>): { use_cache: string | undefined } {
  return {
    use_cache: optionalString(input.use_cache),
  };
}

function ninjapearHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

async function readNinjapearPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createNinjapearError(
  response: Response,
  payload: unknown,
  phase: NinjapearRequestPhase,
): ProviderRequestError {
  const message = extractNinjapearErrorMessage(payload) ?? response.statusText ?? "NinjaPear request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }

  if (phase === "execute" && response.status === 403) {
    return new ProviderRequestError(403, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractNinjapearErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
}
