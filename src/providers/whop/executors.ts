import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRawString, optionalRecord } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "whop";

export const whopApiBaseUrl = "https://api.whop.com/api/v1";
export const whopApiVersion = "2026-07-01";

const whopValidationPath = "/companies";

type WhopQueryValue = boolean | number | readonly string[] | string | undefined;
type WhopRequestMode = "validate" | "execute";
type WhopActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type WhopActionHandler = (input: Record<string, unknown>, context: WhopActionContext) => Promise<unknown>;

interface WhopRequestOptions {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  mode: WhopRequestMode;
  query?: Record<string, WhopQueryValue>;
}

export const whopActionHandlers: ProviderActionHandlers<"whop", WhopActionHandler> = {
  list_companies(input, context) {
    return requestWhopJson({
      apiKey: context.apiKey,
      path: "/companies",
      query: compactObject({
        after: optionalRawString(input.after),
        before: optionalRawString(input.before),
        first: optionalNumber(input.first),
        last: optionalNumber(input.last),
        parent_company_id: optionalRawString(input.parent_company_id),
        direction: optionalRawString(input.direction),
        created_before: optionalRawString(input.created_before),
        created_after: optionalRawString(input.created_after),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  get_company(input, context) {
    return requestWhopJson({
      apiKey: context.apiKey,
      path: `/companies/${encodeURIComponent(requireInputString(input.id, "id"))}`,
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  list_products(input, context) {
    return requestWhopJson({
      apiKey: context.apiKey,
      path: "/products",
      query: compactObject({
        company_id: optionalRawString(input.company_id),
        visibilities: optionalStringArray(input.visibilities),
        access_pass_types: optionalStringArray(input.access_pass_types),
        direction: optionalRawString(input.direction),
        order: optionalRawString(input.order),
        first: optionalNumber(input.first),
        after: optionalRawString(input.after),
        last: optionalNumber(input.last),
        before: optionalRawString(input.before),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  get_product(input, context) {
    return requestWhopJson({
      apiKey: context.apiKey,
      path: `/products/${encodeURIComponent(requireInputString(input.id, "id"))}`,
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  list_memberships(input, context) {
    return requestWhopJson({
      apiKey: context.apiKey,
      path: "/memberships",
      query: compactObject({
        after: optionalRawString(input.after),
        before: optionalRawString(input.before),
        first: optionalNumber(input.first),
        last: optionalNumber(input.last),
        company_id: optionalRawString(input.company_id),
        direction: optionalRawString(input.direction),
        order: optionalRawString(input.order),
        product_ids: optionalStringArray(input.product_ids),
        statuses: optionalStringArray(input.statuses),
        cancel_options: optionalStringArray(input.cancel_options),
        plan_ids: optionalStringArray(input.plan_ids),
        user_ids: optionalStringArray(input.user_ids),
        promo_code_ids: optionalStringArray(input.promo_code_ids),
        created_before: optionalRawString(input.created_before),
        created_after: optionalRawString(input.created_after),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  get_membership(input, context) {
    return requestWhopJson({
      apiKey: context.apiKey,
      path: `/memberships/${encodeURIComponent(requireInputString(input.id, "id"))}`,
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  list_authorized_users(input, context) {
    return requestWhopJson({
      apiKey: context.apiKey,
      path: "/authorized_users",
      query: compactObject({
        after: optionalRawString(input.after),
        before: optionalRawString(input.before),
        first: optionalNumber(input.first),
        last: optionalNumber(input.last),
        company_id: optionalRawString(input.company_id),
        user_id: optionalRawString(input.user_id),
        role: optionalRawString(input.role),
        created_before: optionalRawString(input.created_before),
        created_after: optionalRawString(input.created_after),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  get_authorized_user(input, context) {
    return requestWhopJson({
      apiKey: context.apiKey,
      path: `/authorized_users/${encodeURIComponent(requireInputString(input.id, "id"))}`,
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, whopActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestWhopJson({
      apiKey: input.apiKey,
      path: whopValidationPath,
      query: { first: 1 },
      fetcher,
      signal,
      mode: "validate",
    });

    const data = Array.isArray(payload.data) ? payload.data : [];
    const firstCompany = optionalRecord(data[0]);
    const pageInfo = optionalRecord(payload.page_info);
    const firstCompanyId = optionalRawString(firstCompany?.id);
    const firstCompanyTitle = optionalRawString(firstCompany?.title);

    return {
      profile: {
        accountId: firstCompanyId ? `whop:${firstCompanyId}` : "whop-api-key",
        displayName: firstCompanyTitle ?? "Whop API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: whopApiBaseUrl,
        apiVersion: whopApiVersion,
        validationEndpoint: whopValidationPath,
        firstCompanyId,
        firstCompanyTitle,
        hasNextPage: optionalBoolean(pageInfo?.has_next_page),
      }),
    };
  },
};

async function requestWhopJson(input: WhopRequestOptions): Promise<Record<string, unknown>> {
  const response = await whopFetch(input);
  const raw = await readResponseBody(response);
  const payload = raw.trim() === "" ? {} : parseWhopBody(raw);

  if (!response.ok) {
    throw toWhopError(response, payload, input.mode);
  }

  const output = optionalRecord(payload);
  if (!output) {
    throw new ProviderRequestError(502, "Whop returned a non-object JSON payload", payload);
  }
  if (raw.trim() === "") {
    throw new ProviderRequestError(502, "Whop returned an empty response body");
  }

  return output;
}

async function whopFetch(input: WhopRequestOptions): Promise<Response> {
  const url = new URL(
    input.path.startsWith("/") ? `${whopApiBaseUrl}${input.path}` : `${whopApiBaseUrl}/${input.path}`,
  );

  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendQuery(url, key, value);
  }

  try {
    return await input.fetcher(url, {
      method: "GET",
      headers: whopHeaders(input.apiKey),
      signal: input.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(502, `Whop request failed for GET ${url.toString()}: ${message}`, error);
  }
}

function whopHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "api-version-date": whopApiVersion,
    "user-agent": providerUserAgent,
  };
}

function appendQuery(url: URL, key: string, value: WhopQueryValue): void {
  if (value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      url.searchParams.append(key, item);
    }
    return;
  }

  url.searchParams.set(key, String(value));
}

async function readResponseBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Failed to read Whop response body: ${error.message}`
        : "Failed to read Whop response body",
      error,
    );
  }
}

function parseWhopBody(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Whop returned invalid JSON");
  }
}

function toWhopError(response: Response, payload: unknown, mode: WhopRequestMode): ProviderRequestError {
  const message = extractWhopErrorMessage(payload) ?? `Whop request failed with ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : response.status, message, payload);
  }

  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status, message, payload);
  }

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractWhopErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  const error = optionalRecord(object.error);
  return (
    optionalRawString(error?.message) ??
    optionalRawString(object.message) ??
    optionalRawString(object.detail) ??
    optionalRawString(object.error)
  );
}

function requireInputString(value: unknown, fieldName: string): string {
  const parsed = optionalRawString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => String(item));
}
