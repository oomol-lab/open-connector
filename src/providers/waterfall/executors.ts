import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { WaterfallActionName } from "./actions.ts";

import { optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { compactJson } from "../../core/request.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "waterfall";
const waterfallApiBaseUrl = "https://api.waterfall.io";

type WaterfallActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

const waterfallActionHandlers: Record<WaterfallActionName, WaterfallActionHandler> = {
  async verify_email(input, context): Promise<unknown> {
    const payload = await requestWaterfall({
      path: "/v1/verify/email",
      method: "POST",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      body: { email: input.email },
    });
    const record = requireObject(payload, "Waterfall email verification response");
    return {
      status: optionalString(record.status) ?? "unknown",
      email: optionalString(record.email) ?? String(input.email),
      reason: optionalString(record.reason) ?? "",
      usage: readUsage(record),
      raw: record,
    };
  },
  async launch_contact_enrichment(input, context): Promise<unknown> {
    return requestJobEnvelope({
      path: "/v1/enrichment/contact",
      method: "POST",
      body: buildWaterfallBody(input),
      context,
    });
  },
  async get_contact_enrichment(input, context): Promise<unknown> {
    return requestJobEnvelope({
      path: "/v1/enrichment/contact",
      method: "GET",
      query: [["job_id", input.job_id]],
      context,
    });
  },
  async launch_company_enrichment(input, context): Promise<unknown> {
    return requestJobEnvelope({
      path: "/v1/enrichment/company",
      method: "POST",
      body: buildWaterfallBody(input),
      context,
    });
  },
  async get_company_enrichment(input, context): Promise<unknown> {
    return requestJobEnvelope({
      path: "/v1/enrichment/company",
      method: "GET",
      query: [["job_id", input.job_id]],
      context,
    });
  },
  async check_job_change(input, context): Promise<unknown> {
    return requestJobEnvelope({
      path: "/v1/job/change",
      method: "POST",
      body: buildWaterfallBody(input),
      context,
    });
  },
  async get_account_usage(input, context): Promise<unknown> {
    const payload = await requestWaterfall({
      path: "/v2/account",
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      query: [["month", input.month]],
    });
    const record = requireObject(payload, "Waterfall account usage response");
    return {
      key_usage: optionalRecord(record.key_usage) ?? {},
      account_usage: optionalRecord(record.account_usage) ?? {},
      balance_remaining_usd: optionalNumber(record.balance_remaining_usd) ?? 0,
      raw: record,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, waterfallActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const payload = await requestWaterfall({
      path: "/v2/account",
      method: "GET",
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
    });
    const record = requireObject(payload, "Waterfall account response");
    return {
      profile: {
        accountId: "waterfall:api_key",
        displayName: "Waterfall API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: waterfallApiBaseUrl,
        balanceRemainingUsd: optionalNumber(record.balance_remaining_usd),
      },
    };
  },
};

async function requestJobEnvelope(input: {
  path: string;
  method: "GET" | "POST";
  context: ApiKeyProviderContext;
  query?: Array<[string, unknown]>;
  body?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const payload = await requestWaterfall({
    path: input.path,
    method: input.method,
    apiKey: input.context.apiKey,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    query: input.query,
    body: input.body,
  });
  const record = requireObject(payload, "Waterfall job envelope");
  const jobId = readJobId(record);
  const status = optionalString(record.status);
  if (!jobId || !status) {
    throw new ProviderRequestError(502, "Waterfall returned an invalid job envelope");
  }

  return {
    ...record,
    job_id: jobId,
    status,
    raw: record,
  };
}

async function requestWaterfall(input: {
  path: string;
  method: "GET" | "POST";
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  query?: Array<[string, unknown]>;
  body?: unknown;
  phase?: "validate" | "execute";
}): Promise<unknown> {
  const url = new URL(input.path, waterfallApiBaseUrl);
  for (const [key, value] of input.query ?? []) {
    appendQueryValue(url, key, value);
  }

  let response: Response;
  try {
    response = await input.fetcher(url.toString(), {
      method: input.method,
      headers: buildWaterfallHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Waterfall request failed: ${error.message}` : "Waterfall request failed",
    );
  }

  const payload = await readWaterfallPayload(response);
  if (!response.ok) {
    throw mapWaterfallHttpError(response.status, payload, input.phase ?? "execute");
  }
  return payload;
}

function buildWaterfallHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readWaterfallPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Waterfall returned invalid JSON");
  }
}

function mapWaterfallHttpError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = readWaterfallErrorMessage(payload) ?? `Waterfall request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status === 404 ? 404 : 400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function readWaterfallErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload) ?? {};
  const error = optionalRecord(record.error) ?? {};
  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(error.message);
}

function buildWaterfallBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactJson({ ...input }) as Record<string, unknown>;
}

function readJobId(record: Record<string, unknown>): string | undefined {
  const topLevelJobId = optionalString(record.job_id);
  if (topLevelJobId) {
    return topLevelJobId;
  }

  const task = optionalRecord(optionalRecord(record.input)?.task) ?? {};
  return optionalString(task.job_id);
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  url.searchParams.set(key, String(value));
}

function readUsage(record: Record<string, unknown>): Record<string, unknown> | null {
  const usage = optionalRecord(optionalRecord(record.output)?.usage) ?? {};
  return Object.keys(usage).length > 0 ? usage : null;
}

function requireObject(value: unknown, name: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${name} is not a JSON object`);
  }
  return record;
}
