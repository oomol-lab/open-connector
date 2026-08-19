import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const ripplingApiBaseUrl = "https://rest.ripplingapis.com";

type RipplingMode = "validate" | "execute";
type RipplingActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface RipplingRequestOptions {
  apiKey: string;
  path: string;
  query?: URLSearchParams;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  mode?: RipplingMode;
}

export const ripplingActionHandlers: ProviderActionHandlers<"rippling", RipplingActionHandler> = {
  async list_companies(input, context) {
    return normalizeListResponse(
      await requestRippling({
        ...context,
        path: "/companies/",
        query: buildQuery(input, ["expand", "order_by", "cursor"]),
      }),
    );
  },
  async list_workers(input, context) {
    return normalizeListResponse(
      await requestRippling({
        ...context,
        path: "/workers/",
        query: buildQuery(input, ["filter", "expand", "order_by", "cursor"]),
      }),
    );
  },
  async get_worker(input, context) {
    return normalizeResourceResponse(
      await requestRippling({
        ...context,
        path: `/workers/${encodeURIComponent(requiredProviderString(input.id, "id"))}/`,
        query: buildQuery(input, ["expand"]),
      }),
    );
  },
  async list_departments(input, context) {
    return normalizeListResponse(
      await requestRippling({
        ...context,
        path: "/departments/",
        query: buildQuery(input, ["expand", "order_by", "cursor"]),
      }),
    );
  },
};

export async function validateRipplingCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const companies = normalizeListResponse(
    await requestRippling({
      apiKey,
      path: "/companies/",
      fetcher,
      signal,
      mode: "validate",
    }),
  );
  const firstCompany = optionalRecord(companies.results[0]);
  const companyId = firstCompany ? optionalString(firstCompany.id) : undefined;
  const companyName = firstCompany
    ? (optionalString(firstCompany.name) ?? optionalString(firstCompany.legal_name))
    : undefined;

  return {
    profile: {
      accountId: companyId ?? "api_key",
      displayName: companyName ?? companyId ?? "Rippling API Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: ripplingApiBaseUrl,
      validationEndpoint: "/companies/",
      companyId,
      companyName,
    }),
  };
}

function buildQuery(input: Record<string, unknown>, fields: readonly string[]): URLSearchParams {
  const query = new URLSearchParams();
  for (const field of fields) {
    const value = optionalString(input[field]);
    if (value) {
      query.set(field, value);
    }
  }
  return query;
}

async function requestRippling(input: RipplingRequestOptions): Promise<unknown> {
  let response: Response;
  let body: unknown;
  try {
    const url = new URL(input.path, ripplingApiBaseUrl);
    input.query?.forEach((value, key) => {
      url.searchParams.set(key, value);
    });

    response = await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: input.signal,
    });
    body = await readRipplingBody(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Rippling request failed: ${error.message}` : "Rippling request failed",
      error,
    );
  }

  if (!response.ok) {
    throw mapRipplingError(response, body, input.mode ?? "execute");
  }
  return body;
}

async function readRipplingBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Rippling returned malformed JSON");
  }
}

function normalizeListResponse(
  payload: unknown,
): { results: Array<Record<string, unknown>> } & Record<string, unknown> {
  const record = expectRipplingObject(payload, "list response");
  if (!Array.isArray(record.results)) {
    throw new ProviderRequestError(502, "Rippling list response missing results", payload);
  }

  return compactObject({
    __meta: optionalRecord(record.__meta),
    results: record.results.map((item) => expectRipplingObject(item, "list response result")),
    next_link: optionalString(record.next_link),
  }) as { results: Array<Record<string, unknown>> } & Record<string, unknown>;
}

function normalizeResourceResponse(payload: unknown): Record<string, unknown> {
  return expectRipplingObject(payload, "resource response");
}

function expectRipplingObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `Rippling ${label} must be an object`, value);
  }
  return value as Record<string, unknown>;
}

function mapRipplingError(response: Response, body: unknown, mode: RipplingMode): ProviderRequestError {
  const message = extractRipplingErrorMessage(body) ?? `Rippling request failed with ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(400, message, body);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, body);
  }
  if (mode === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, body);
  }
  return new ProviderRequestError(response.status >= 500 ? response.status : 502, message, body);
}

function extractRipplingErrorMessage(body: unknown): string | undefined {
  if (typeof body === "string") {
    return body;
  }
  const record = optionalRecord(body);
  if (!record) {
    return undefined;
  }

  const direct =
    optionalString(record.message) ??
    optionalString(record.detail) ??
    optionalString(record.error) ??
    optionalString(record.title);
  if (direct) {
    return direct;
  }

  const errors = Array.isArray(record.errors) ? record.errors : undefined;
  const firstError = errors ? optionalRecord(errors[0]) : undefined;
  if (!firstError) {
    return undefined;
  }
  return optionalString(firstError.message) ?? optionalString(firstError.detail) ?? optionalString(firstError.title);
}

function requiredProviderString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}
