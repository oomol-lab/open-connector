import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BenchmarkEmailActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const benchmarkEmailDefaultRequestTimeoutMs = 30_000;
const benchmarkEmailValidationMethod = "clientGetProfileDetails";

type BenchmarkEmailRequestPhase = "validate" | "execute";

export interface BenchmarkEmailContext extends ApiKeyProviderContext {
  baseUrl: string;
}

type BenchmarkEmailActionHandler = ProviderRuntimeHandler<BenchmarkEmailContext>;

export const benchmarkEmailActionHandlers: Record<BenchmarkEmailActionName, BenchmarkEmailActionHandler> = {
  get_account_summary(_input, context) {
    return requestBenchmarkEmailJson({
      context,
      query: {
        method: "clientGetPlanInfo",
      },
      phase: "execute",
    });
  },
  get_contacts_in_list(input, context) {
    return requestBenchmarkEmailJson({
      context,
      query: compactObject({
        method: "listGetFilteredContacts",
        listID: requireNonEmptyString(input.list_id, "list_id"),
        language: optionalString(input.language),
        filter: optionalString(input.filter),
        orderBy: optionalString(input.order_by),
        sortOrder: optionalString(input.sort_order),
        pageSize: optionalIntegerString(input.page_size),
        pageNumber: optionalIntegerString(input.page_number),
        searchType: optionalString(input.search_type),
        searchField: optionalString(input.search_field),
        searchFilter: optionalString(input.search_filter),
      }),
      phase: "execute",
    });
  },
  get_contact_details(input, context) {
    return requestBenchmarkEmailJson({
      context,
      query: {
        method: "listGetContactDetails",
        listID: requireNonEmptyString(input.list_id, "list_id"),
        email: requireNonEmptyString(input.email, "email"),
      },
      phase: "execute",
    });
  },
  get_contact_list_summary(input, context) {
    return requestBenchmarkEmailJson({
      context,
      query: {
        method: "listGet",
        listID: requireNonEmptyString(input.list_id, "list_id"),
      },
      phase: "execute",
    });
  },
};

export async function validateBenchmarkEmailCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const baseUrl = normalizeBaseUrl(input.values.baseUrl);
  const payload = await requestBenchmarkEmailJson({
    context: {
      apiKey: input.apiKey,
      baseUrl,
      fetcher,
      signal,
    },
    query: {
      method: benchmarkEmailValidationMethod,
    },
    phase: "validate",
  });
  const record = requireRecord(payload, "benchmark_email validation response");
  const clientId = optionalString(record.client_id);
  const login = optionalString(record.login);
  const email = optionalString(record.email);

  return {
    profile: {
      accountId: clientId ?? login ?? email ?? "benchmark_email",
      displayName: email ?? login ?? "Benchmark Email API Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      baseUrl,
      validationMethod: benchmarkEmailValidationMethod,
      clientId,
      login,
      email,
      planName: optionalString(record.plan_name),
    }),
  };
}

async function requestBenchmarkEmailJson(input: {
  context: Pick<BenchmarkEmailContext, "apiKey" | "baseUrl" | "fetcher" | "signal">;
  phase: BenchmarkEmailRequestPhase;
  query?: Record<string, string | undefined>;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, benchmarkEmailDefaultRequestTimeoutMs);

  try {
    const response = await input.context.fetcher(
      buildBenchmarkEmailUrl(input.context.baseUrl, {
        token: input.context.apiKey,
        output: "json",
        ...input.query,
      }),
      {
        method: "GET",
        headers: {
          accept: "application/json",
          "user-agent": providerUserAgent,
        },
        signal: timeout.signal,
      },
    );
    const payload = await readBenchmarkEmailPayload(response);

    if (!response.ok) {
      throw createBenchmarkEmailError(response.status, payload, input.phase);
    }

    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "benchmark_email returned invalid JSON");
    }

    if (optionalString(record.Status) === "-1") {
      const upstreamStatus = response.status >= 400 ? response.status : 400;
      throw createBenchmarkEmailError(upstreamStatus, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "benchmark_email request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `benchmark_email request failed: ${error.message}` : "benchmark_email request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildBenchmarkEmailUrl(baseUrl: string, query: Record<string, string | undefined> = {}): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function readBenchmarkEmailPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "benchmark_email returned invalid JSON");
  }
}

function createBenchmarkEmailError(
  status: number,
  payload: unknown,
  phase: BenchmarkEmailRequestPhase,
): ProviderRequestError {
  const message = readBenchmarkEmailErrorMessage(payload) ?? `benchmark_email request failed with ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function readBenchmarkEmailErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.error) ??
    optionalString(record.message) ??
    optionalString(record.Message) ??
    optionalString(record.Error) ??
    optionalString(record.StatusText) ??
    optionalString(record.ErrorMessage)
  );
}

function normalizeBaseUrl(value: unknown): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, "baseUrl is required");
  }

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new ProviderRequestError(400, "baseUrl must be a valid http(s) URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ProviderRequestError(400, "baseUrl must be a valid http(s) URL");
  }

  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.toString().replace(/\/+$/u, "");
}

export function resolveBenchmarkEmailBaseUrl(
  values: Record<string, string>,
  metadata: Record<string, unknown>,
): string {
  return normalizeBaseUrl(optionalString(metadata.baseUrl) ?? optionalString(values.baseUrl));
}

function requireRecord(value: unknown, context: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${context} is invalid`);
  }
  return record;
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  const result = optionalString(value);
  if (!result) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return result;
}

function optionalIntegerString(value: unknown): string | undefined {
  const parsed = optionalInteger(value);
  return parsed === undefined ? undefined : String(parsed);
}
