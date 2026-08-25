import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ResolvedCredential,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "nyne_ai";
const nyneAiApiBaseUrl = "https://api.nyne.ai";
const nyneAiRequestTimeoutMs = 30_000;

type NyneAiMode = "validate" | "execute";
type NyneAiActionHandler = ProviderRuntimeHandler<NyneAiActionContext>;

interface NyneAiActionContext {
  apiKey: string;
  apiSecret: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface NyneAiRequestInput {
  method: "GET" | "POST";
  path: string;
  query?: Array<[string, unknown]>;
  body?: Record<string, unknown>;
  mode: NyneAiMode;
}

export const nyneAiActionHandlers: ProviderActionHandlers<"nyne_ai", NyneAiActionHandler> = {
  async get_usage(input, context) {
    const payload = await requestNyneAiJson(
      {
        method: "GET",
        path: "/usage",
        query: [
          ["month", input.month],
          ["year", input.year],
        ],
        mode: "execute",
      },
      context,
    );

    return normalizeUsage(payload);
  },
  async submit_person_search(input, context) {
    assertAnyField(input, ["query", "customFilters", "cursor", "requestId"]);
    const payload = await requestNyneAiJson(
      {
        method: "POST",
        path: "/person/search",
        body: compactObject({
          query: input.query,
          limit: input.limit,
          show_emails: input.showEmails,
          show_phone_numbers: input.showPhoneNumbers,
          require_emails: input.requireEmails,
          require_phone_numbers: input.requirePhoneNumbers,
          require_phones_or_emails: input.requirePhonesOrEmails,
          insights: input.insights,
          profile_scoring: input.profileScoring,
          custom_filters: input.customFilters,
          cursor: input.cursor,
          offset: input.offset,
          request_id: input.requestId,
          callback_url: optionalCallbackUrl(input.callbackUrl),
        }),
        mode: "execute",
      },
      context,
    );

    return normalizeSubmit(payload);
  },
  async get_person_search(input, context) {
    return getSearchStatus("/person/search", input.requestId, context);
  },
  async submit_person_enrichment(input, context) {
    assertAnyField(input, ["email", "phone", "socialMediaUrl", "name"]);
    const payload = await requestNyneAiJson(
      {
        method: "POST",
        path: "/person/enrichment",
        body: compactObject({
          email: input.email,
          phone: input.phone,
          social_media_url: input.socialMediaUrl,
          name: input.name,
          company: input.company,
          city: input.city,
          newsfeed: input.newsfeed,
          ai_enhanced_search: input.aiEnhancedSearch,
          strict_email_check: input.strictEmailCheck,
          lite_enrich: input.liteEnrich,
          probability_score: input.probabilityScore,
          force_organization_refresh: input.forceOrganizationRefresh,
          required_fields: input.requiredFields,
          callback_url: optionalCallbackUrl(input.callbackUrl),
        }),
        mode: "execute",
      },
      context,
    );

    return normalizeSubmit(payload);
  },
  async get_person_enrichment(input, context) {
    return getEnrichmentStatus("/person/enrichment", input.requestId, context);
  },
  async submit_company_search(input, context) {
    const payload = await requestNyneAiJson(
      {
        method: "POST",
        path: "/company/search",
        body: compactObject({
          query: input.query,
          limit: input.limit,
          offset: input.offset,
          profile_scoring: input.profileScoring,
          insights: input.insights,
          callback_url: optionalCallbackUrl(input.callbackUrl),
        }),
        mode: "execute",
      },
      context,
    );

    return normalizeSubmit(payload);
  },
  async get_company_search(input, context) {
    return getSearchStatus("/company/search", input.requestId, context);
  },
  async submit_company_enrichment(input, context) {
    assertAnyField(input, ["domain", "email", "phone", "socialMediaUrl"]);
    const payload = await requestNyneAiJson(
      {
        method: "POST",
        path: "/company/enrichment",
        body: compactObject({
          domain: input.domain,
          email: input.email,
          phone: input.phone,
          social_media_url: input.socialMediaUrl,
          callback_url: optionalCallbackUrl(input.callbackUrl),
        }),
        mode: "execute",
      },
      context,
    );

    return normalizeSubmit(payload);
  },
  async get_company_enrichment(input, context) {
    return getEnrichmentStatus("/company/enrichment", input.requestId, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<NyneAiActionContext>({
  service,
  handlers: nyneAiActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<NyneAiActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiSecret: requiredString(
        credential.values.apiSecret,
        "apiSecret",
        (message) => new ProviderRequestError(401, message),
      ),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: nyneAiApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  customizeRequest({ headers, credential }) {
    const apiCredential = credential as Extract<ResolvedCredential, { authType: "api_key" }>;
    headers.set(
      "x-api-secret",
      requiredString(apiCredential.values.apiSecret, "apiSecret", (message) => new ProviderRequestError(401, message)),
    );
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context = {
      apiKey: input.apiKey,
      apiSecret: requiredString(
        input.values.apiSecret,
        "apiSecret",
        (message) => new ProviderRequestError(401, message),
      ),
      fetcher,
      signal,
    };
    const usage = normalizeUsage(
      await requestNyneAiJson(
        {
          method: "GET",
          path: "/usage",
          mode: "validate",
        },
        context,
      ),
    );
    const availableCredits = optionalNumber(usage.limits.available_credits);
    const monthlyAllocation = optionalNumber(usage.limits.monthly_allocation);

    return {
      profile: {
        accountId: "nyne_ai",
        displayName:
          availableCredits === undefined ? "Nyne.ai API Key" : `Nyne.ai (${formatCredits(availableCredits)} credits)`,
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: nyneAiApiBaseUrl,
        validationEndpoint: "/usage",
        period: usage.period ?? undefined,
        availableCredits,
        monthlyAllocation,
      }),
    };
  },
};

async function getSearchStatus(path: string, requestId: unknown, context: NyneAiActionContext): Promise<unknown> {
  const payload = await requestNyneAiJson(
    {
      method: "GET",
      path,
      query: [["request_id", requestId]],
      mode: "execute",
    },
    context,
  );

  return normalizeSearchStatus(payload);
}

async function getEnrichmentStatus(path: string, requestId: unknown, context: NyneAiActionContext): Promise<unknown> {
  const payload = await requestNyneAiJson(
    {
      method: "GET",
      path,
      query: [["request_id", requestId]],
      mode: "execute",
    },
    context,
  );

  return normalizeEnrichmentStatus(payload);
}

async function requestNyneAiJson(
  input: NyneAiRequestInput,
  context: NyneAiActionContext,
): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(context.signal, nyneAiRequestTimeoutMs);
  try {
    const response = await context.fetcher(buildNyneAiUrl(input), {
      method: input.method,
      headers: buildNyneAiHeaders(context, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readNyneAiPayload(response);

    if (!response.ok) {
      throw createNyneAiError(response.status, payload, input.mode);
    }

    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "Nyne.ai returned an invalid payload", payload);
    }

    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Nyne.ai request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Nyne.ai request failed: ${error.message}` : "Nyne.ai request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildNyneAiUrl(input: NyneAiRequestInput): URL {
  const url = new URL(`${nyneAiApiBaseUrl}${input.path}`);
  for (const [key, value] of input.query ?? []) {
    appendQueryValue(url, key, value);
  }
  return url;
}

function buildNyneAiHeaders(context: NyneAiActionContext, hasBody: boolean): Record<string, string> {
  return compactObject({
    accept: "application/json",
    "content-type": hasBody ? "application/json" : undefined,
    "user-agent": providerUserAgent,
    "X-API-Key": context.apiKey,
    "X-API-Secret": context.apiSecret,
  }) as Record<string, string>;
}

async function readNyneAiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Nyne.ai returned invalid JSON");
    }
    return { error: text };
  }
}

function createNyneAiError(status: number, payload: unknown, mode: NyneAiMode): ProviderRequestError {
  const message = readNyneAiErrorMessage(payload) ?? `Nyne.ai request failed with HTTP ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : 403, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 402 || status === 404 || (status >= 400 && status < 500)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message, payload);
}

function readNyneAiErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const nestedError = optionalRecord(record.error);
  return (
    optionalString(nestedError?.message) ??
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail)
  );
}

function normalizeUsage(payload: Record<string, unknown>): {
  month: number | null;
  year: number | null;
  period: string | null;
  creditsUsed: Record<string, unknown>;
  requestsCount: Record<string, unknown>;
  limits: Record<string, unknown>;
  breakdown: Record<string, unknown>;
  raw: Record<string, unknown>;
} {
  const limits = optionalRecord(payload.limits) ?? {};
  return {
    month: nullableInteger(payload.month),
    year: nullableInteger(payload.year),
    period: nullableString(payload.period),
    creditsUsed: optionalRecord(payload.credits_used) ?? {},
    requestsCount: optionalRecord(payload.requests_count) ?? {},
    limits,
    breakdown: optionalRecord(payload.breakdown) ?? {},
    raw: payload,
  };
}

function normalizeSubmit(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    requestId: readRequestId(payload),
    status: optionalString(payload.status) ?? "",
    completed: nullableBoolean(payload.completed),
    raw: payload,
  };
}

function normalizeSearchStatus(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    requestId: readRequestId(payload),
    status: optionalString(payload.status) ?? "",
    completed: nullableBoolean(payload.completed),
    results: objectArray(payload.results),
    returnedCount: nullableInteger(payload.returned_count),
    totalResults: nullableInteger(payload.total_results),
    hasMore: nullableBoolean(payload.has_more),
    nextCursor: nullableString(payload.next_cursor),
    nextOffset: nullableInteger(payload.next_offset),
    raw: payload,
  };
}

function normalizeEnrichmentStatus(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    requestId: readRequestId(payload),
    status: optionalString(payload.status) ?? "",
    completed: nullableBoolean(payload.completed),
    result: optionalRecord(payload.result) ?? null,
    raw: payload,
  };
}

function readRequestId(payload: Record<string, unknown>): string {
  return requiredString(payload.request_id, "request_id", (message) => new ProviderRequestError(502, message));
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  url.searchParams.set(key, String(value));
}

function objectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => optionalRecord(item) ?? {});
}

function nullableString(value: unknown): string | null {
  return value === null ? null : (optionalString(value) ?? null);
}

function nullableInteger(value: unknown): number | null {
  return Number.isInteger(value) ? (value as number) : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return value === null ? null : typeof value === "boolean" ? value : null;
}

function formatCredits(value: number): string {
  return String(value);
}

function assertAnyField(input: Record<string, unknown>, keys: string[]): void {
  if (keys.some((key) => hasValue(input[key]))) {
    return;
  }
  throw new ProviderRequestError(400, `${keys.join(", ")}: at least one field is required`);
}

function optionalCallbackUrl(value: unknown): string | undefined {
  const text = optionalString(value);
  if (!text) {
    return undefined;
  }
  return assertPublicHttpUrl(text, {
    fieldName: "callbackUrl",
    createError: (message) => new ProviderRequestError(400, message),
  }).toString();
}

function hasValue(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value !== undefined && value !== null;
}
