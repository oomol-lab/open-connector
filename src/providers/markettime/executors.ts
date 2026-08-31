import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "markettime";
const markettimeApiBaseUrl = "https://publicapi.markettime.com";

type RequestPhase = "validate" | "execute";

interface MarkettimeContext {
  apiKey: string;
  accountId: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface MarkettimeRequestInput {
  path: string;
  context: MarkettimeContext;
  phase: RequestPhase;
  method?: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

export const markettimeActionHandlers: Record<string, ProviderRuntimeHandler<MarkettimeContext>> = {
  async list_items(input, context) {
    return parseListResponse(
      await requestMarkettime({
        path: `/mtpublic/api/v1/${encodeURIComponent(context.accountId)}/items`,
        context,
        phase: "execute",
        query: input,
      }),
    );
  },
  async list_manufacturers(input, context) {
    return parseListResponse(
      await requestMarkettime({
        path: `/mtpublic/api/v1/${encodeURIComponent(context.accountId)}/manufacturers`,
        context,
        phase: "execute",
        query: input,
      }),
    );
  },
  async search_orders(input, context) {
    const { includeTotalCount, excludeOrderDetails, ...body } = input;
    return parseOrderSearchResponse(
      await requestMarkettime({
        path: `/mtpublic/api/v2/${encodeURIComponent(context.accountId)}/orders/search`,
        context,
        phase: "execute",
        method: "POST",
        query: { includeTotalCount, excludeOrderDetails },
        body,
      }),
      includeTotalCount === true,
    );
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<MarkettimeContext>({
  service,
  handlers: markettimeActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<MarkettimeContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      accountId: readAccountId(credential.values.accountId ?? credential.metadata.accountId),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: markettimeApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const accountId = readAccountId(input.values.accountId);
    const context = { apiKey: input.apiKey, accountId, fetcher, signal };
    await requestMarkettime({
      path: `/mtpublic/api/v1/${encodeURIComponent(accountId)}/items`,
      context,
      phase: "validate",
      query: { offset: 0, recordSize: 1 },
    });
    return {
      profile: { accountId, displayName: `MarketTime ${accountId}` },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: markettimeApiBaseUrl,
        accountId,
        validationEndpoint: "/mtpublic/api/v1/{whoAmI}/items",
      },
    };
  },
};

async function requestMarkettime(input: MarkettimeRequestInput): Promise<unknown> {
  const url = new URL(input.path, markettimeApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value != null) url.searchParams.set(key, String(value));
  }
  const timeout = createProviderTimeout(input.context.signal);
  try {
    const response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": input.context.apiKey,
      },
      body: input.body == null ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readJson(response, response.ok);
    if (!response.ok) throw createMarkettimeError(response, payload, input.phase);
    const envelope = optionalRecord(payload);
    if (envelope?.success === false) throw createMarkettimeError(response, payload, input.phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "MarketTime request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `MarketTime request failed: ${error.message}` : "MarketTime request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function parseListResponse(payload: unknown): Record<string, unknown> {
  const envelope = requireProviderRecord(payload, "MarketTime list response");
  return {
    records: requireArray(envelope.response, "MarketTime list response records"),
    total: requireInteger(envelope.total, "MarketTime list response total"),
    timestamp: requireProviderString(envelope.timeStamp, "MarketTime list response timestamp"),
  };
}

function parseOrderSearchResponse(payload: unknown, totalCountRequested: boolean): Record<string, unknown> {
  const envelope = requireProviderRecord(payload, "MarketTime order search response");
  const page = requireProviderRecord(envelope.response, "MarketTime order search page");
  return {
    records: requireArray(page.data, "MarketTime order search records"),
    currentPage: requireInteger(page.currentPage, "MarketTime order search currentPage"),
    pageSize: requireInteger(page.pageSize, "MarketTime order search pageSize"),
    totalNumberOfPages: readConditionalInteger(
      page.totalNumberOfPages,
      "MarketTime order search totalNumberOfPages",
      totalCountRequested,
    ),
    totalNumberOfRecords: readConditionalInteger(
      page.totalNumberOfRecords,
      "MarketTime order search totalNumberOfRecords",
      totalCountRequested,
    ),
    timestamp: requireProviderString(envelope.timeStamp, "MarketTime order search timestamp"),
  };
}

function readAccountId(value: unknown): string {
  return requiredString(value, "accountId", (message) => new ProviderRequestError(400, message));
}

async function readJson(response: Response, required: boolean): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    if (required) throw new ProviderRequestError(502, "MarketTime returned an empty response");
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!required) return null;
    throw new ProviderRequestError(502, "MarketTime returned invalid JSON");
  }
}

function createMarkettimeError(response: Response, payload: unknown, phase: RequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  const message =
    optionalString(error?.message) ??
    optionalString(record?.message) ??
    `MarketTime request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  return new ProviderRequestError(
    response.status >= 400 && response.status < 500 ? response.status : 502,
    message,
    payload,
  );
}

function requireProviderRecord(value: unknown, label: string): Record<string, unknown> {
  return requiredRecord(value, label, () => new ProviderRequestError(502, `${label} was not an object`));
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `${label} was not an array`);
  return value;
}

function requireInteger(value: unknown, label: string): number {
  const result = optionalInteger(value);
  if (result === undefined) throw new ProviderRequestError(502, `${label} was not an integer`);
  return result;
}

function readConditionalInteger(value: unknown, label: string, required: boolean): number | undefined {
  if (value == null && !required) return undefined;
  return requireInteger(value, label);
}

function requireProviderString(value: unknown, label: string): string {
  const result = optionalString(value);
  if (result === undefined) throw new ProviderRequestError(502, `${label} was not a string`);
  return result;
}
