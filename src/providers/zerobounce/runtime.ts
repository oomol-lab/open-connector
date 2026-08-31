import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const zerobounceApiBaseUrl = "https://api.zerobounce.net";
const zerobounceDefaultRequestTimeoutMs = 30_000;

type ZerobounceRequestPhase = "validate" | "execute";
type ZerobounceActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const zerobounceActionHandlers: ProviderActionHandlers<"zerobounce", ZerobounceActionHandler> = {
  get_credit_balance(_input, context) {
    return requestZerobounceCreditBalance({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  get_api_usage(input, context) {
    return requestZerobounceApiUsage({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      startDate: requiredString(input.start_date, "start_date", providerInputError),
      endDate: requiredString(input.end_date, "end_date", providerInputError),
    });
  },
  validate_email(input, context) {
    return requestZerobounceValidateEmail({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      email: requiredString(input.email, "email", providerInputError),
      ipAddress: optionalString(input.ip_address),
      creditsInfo: optionalBoolean(input.credits_info),
    });
  },
  get_activity_data(input, context) {
    return requestZerobounceActivityData({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      email: requiredString(input.email, "email", providerInputError),
    });
  },
  create_filter_rule(input, context) {
    return requestZerobounceCreateFilterRule({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      rule: requiredString(input.rule, "rule", providerInputError),
      target: requiredString(input.target, "target", providerInputError),
      value: requiredString(input.value, "value", providerInputError),
    });
  },
  list_filter_rules(_input, context) {
    return requestZerobounceListFilterRules({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
};

export async function validateZerobounceCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestZerobounceCreditBalance({ apiKey, fetcher, signal, phase: "validate" });
  return {
    profile: {
      accountId: "zerobounce",
      displayName: "ZeroBounce API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: zerobounceApiBaseUrl,
      validationEndpoint: "/v2/getcredits",
      credits: payload.credits,
    },
  };
}

async function requestZerobounceCreditBalance(input: ZerobounceRequestInput): Promise<{ credits: number }> {
  const payload = await requestZerobounceJson({
    path: "/v2/getcredits",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
  });
  const record = requireZerobounceObject(unwrapZerobouncePayload(payload), "/v2/getcredits");
  const credits = optionalInteger(record.Credits);
  if (credits === undefined) {
    throw new ProviderRequestError(502, "ZeroBounce /v2/getcredits returned invalid Credits", record);
  }
  if (credits === -1) {
    throw new ProviderRequestError(400, "Invalid ZeroBounce API key", record);
  }

  return { credits };
}

async function requestZerobounceApiUsage(
  input: ZerobounceRequestInput & { startDate: string; endDate: string },
): Promise<Record<string, unknown>> {
  const payload = await requestZerobounceJson({
    path: "/v2/getapiusage",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
    query: {
      start_date: input.startDate,
      end_date: input.endDate,
    },
  });

  return requireZerobounceObject(unwrapZerobouncePayload(payload), "/v2/getapiusage");
}

async function requestZerobounceValidateEmail(
  input: ZerobounceRequestInput & { email: string; ipAddress?: string; creditsInfo?: boolean },
): Promise<Record<string, unknown>> {
  const payload = await requestZerobounceJson({
    path: "/v2/validate",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
    query: compactObject({
      email: input.email,
      ip_address: input.ipAddress,
      credits_info: input.creditsInfo === undefined ? undefined : String(input.creditsInfo),
    }),
  });

  const record = requireZerobounceObject(unwrapZerobouncePayload(payload), "/v2/validate");
  return {
    ...record,
    free_email: parseZerobounceBooleanField(record.free_email, "/v2/validate", "free_email"),
    mx_found: parseZerobounceBooleanField(record.mx_found, "/v2/validate", "mx_found"),
  };
}

async function requestZerobounceActivityData(
  input: ZerobounceRequestInput & { email: string },
): Promise<Record<string, unknown>> {
  const payload = await requestZerobounceJson({
    path: "/v2/activity",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
    query: { email: input.email },
  });

  return requireZerobounceObject(unwrapZerobouncePayload(payload), "/v2/activity");
}

async function requestZerobounceCreateFilterRule(
  input: ZerobounceRequestInput & { rule: string; target: string; value: string },
): Promise<{ message: string }> {
  const payload = await requestZerobounceJson({
    path: "/v2/filters/add",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
    query: {
      rule: input.rule,
      target: input.target,
      value: input.value,
    },
  });
  const record = requireZerobounceObject(unwrapZerobouncePayload(payload), "/v2/filters/add");
  const message = optionalString(record.Message);
  if (!message) {
    throw new ProviderRequestError(502, "ZeroBounce /v2/filters/add returned invalid Message", record);
  }

  return { message };
}

async function requestZerobounceListFilterRules(input: ZerobounceRequestInput): Promise<{ filters: unknown[] }> {
  const payload = await requestZerobounceJson({
    path: "/v2/filters/list",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
  });
  const unwrapped = unwrapZerobouncePayload(payload);
  if (Array.isArray(unwrapped)) {
    return { filters: unwrapped };
  }
  const record = requireZerobounceObject(unwrapped, "/v2/filters/list");
  if (!Array.isArray(record.filters)) {
    throw new ProviderRequestError(502, "ZeroBounce /v2/filters/list returned invalid filters", record);
  }

  return { filters: record.filters };
}

interface ZerobounceRequestInput {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: ZerobounceRequestPhase;
}

async function requestZerobounceJson(
  input: ZerobounceRequestInput & {
    path: string;
    query?: Record<string, string | undefined>;
  },
): Promise<unknown> {
  const url = new URL(input.path, zerobounceApiBaseUrl);
  url.searchParams.set("api_key", input.apiKey);
  for (const [key, value] of Object.entries(queryParams(input.query ?? {}))) {
    url.searchParams.set(key, value);
  }

  const timeout = createProviderTimeout(input.signal, zerobounceDefaultRequestTimeoutMs);
  try {
    const response = await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readZerobouncePayload(response);
    if (!response.ok) {
      throw mapZerobounceError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "ZeroBounce request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ZeroBounce request failed: ${error.message}` : "ZeroBounce request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function unwrapZerobouncePayload(payload: unknown): unknown {
  const record = optionalRecord(payload);
  if (!record) {
    return payload;
  }
  const data = optionalRecord(record.data);
  return data ?? payload;
}

function requireZerobounceObject(payload: unknown, path: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `ZeroBounce ${path} returned invalid JSON`, payload);
  }
  return record;
}

function mapZerobounceError(status: number, payload: unknown, phase: ZerobounceRequestPhase): ProviderRequestError {
  const message = readZerobounceErrorMessage(payload) ?? `ZeroBounce request failed with HTTP ${status}`;

  if (status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(status || 502, message, payload);
}

function readZerobounceErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  if (typeof record.error === "string") {
    return optionalString(record.error);
  }
  if (typeof record.message === "string") {
    return optionalString(record.message);
  }
  const nested = optionalRecord(record.error);
  return optionalString(nested?.message);
}

function parseZerobounceBooleanField(value: unknown, path: string, fieldName: string): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === undefined) {
    return undefined;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  throw new ProviderRequestError(502, `ZeroBounce ${path} returned invalid ${fieldName}`);
}

async function readZerobouncePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "ZeroBounce returned invalid JSON");
  }
}
