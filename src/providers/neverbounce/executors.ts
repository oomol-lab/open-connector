import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "neverbounce";
const neverbounceApiBaseUrl = "https://api.neverbounce.com/v4.2";

type NeverBouncePhase = "validate" | "execute";
type NeverBounceActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const neverbounceActionHandlers: ProviderActionHandlers<"neverbounce", NeverBounceActionHandler> = {
  get_account_info(_input, context) {
    return requestNeverBounceJson("/account/info", context, "validate", {});
  },
  single_check(input, context) {
    return requestNeverBounceJson("/single/check", context, "execute", {
      email: requiredInputString(input.email, "email"),
      address_info: booleanFlag(input.address_info),
      credits_info: booleanFlag(input.credits_info),
      timeout: optionalInteger(input.timeout)?.toString(),
    });
  },
  create_job(input, context) {
    return requestNeverBounceJson("/jobs/create", context, "execute", {}, "POST", buildCreateJobForm(input));
  },
  parse_job(input, context) {
    return requestNeverBounceJson("/jobs/parse", context, "execute", {}, "POST", {
      job_id: requiredJobId(input.job_id, "job_id"),
      auto_start: booleanText(input.auto_start),
    });
  },
  start_job(input, context) {
    return requestNeverBounceJson("/jobs/start", context, "execute", {}, "POST", {
      job_id: requiredJobId(input.job_id, "job_id"),
      run_sample: booleanText(input.run_sample),
    });
  },
  get_job_status(input, context) {
    return requestNeverBounceJson("/jobs/status", context, "execute", {
      job_id: requiredJobId(input.job_id, "job_id"),
    });
  },
  get_job_results(input, context) {
    return requestNeverBounceJson("/jobs/results", context, "execute", {
      job_id: requiredJobId(input.job_id, "job_id"),
      page: optionalInteger(input.page)?.toString(),
      items_per_page: optionalInteger(input.items_per_page)?.toString(),
    });
  },
  async download_job_results(input, context) {
    const response = await requestNeverBounceRaw(
      "/jobs/download",
      context,
      "execute",
      buildDownloadQuery(input),
      "GET",
      {
        accept: "text/csv, text/plain, */*",
      },
    );
    return {
      filename:
        parseContentDispositionFilename(response.headers.get("content-disposition")) ??
        `neverbounce-${requiredJobId(input.job_id, "job_id")}.csv`,
      content_type: response.headers.get("content-type") ?? "text/csv",
      csv: response.bodyText,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, neverbounceActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = optionalRecord(
      await requestNeverBounceJson(
        "/account/info",
        {
          apiKey: input.apiKey,
          fetcher,
          signal,
        },
        "validate",
        {},
      ),
    );
    return {
      profile: {
        accountId: "neverbounce",
        displayName: "NeverBounce API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: neverbounceApiBaseUrl,
        validationEndpoint: "/account/info",
        credits_info: payload?.credits_info,
        job_counts: payload?.job_counts,
      }),
    };
  },
};

async function requestNeverBounceJson(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: NeverBouncePhase,
  query: Record<string, string | undefined>,
  method: "GET" | "POST" = "GET",
  form: Record<string, string | undefined> = {},
): Promise<unknown> {
  const response = await requestNeverBounceRaw(path, context, phase, query, method, {
    accept: "application/json",
    form,
  });
  return response.payload;
}

async function requestNeverBounceRaw(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: NeverBouncePhase,
  query: Record<string, string | undefined>,
  method: "GET" | "POST" = "GET",
  options: { accept: string; form?: Record<string, string | undefined> },
): Promise<{ payload: unknown; bodyText: string; headers: Headers }> {
  const url = new URL(`${neverbounceApiBaseUrl}${path}`);
  if (method === "GET") {
    url.searchParams.set("key", context.apiKey);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
  }

  const timeout = createProviderTimeout(context.signal);
  try {
    const headers: Record<string, string> = {
      accept: options.accept,
      "user-agent": providerUserAgent,
    };
    let body: URLSearchParams | undefined;
    if (method === "POST") {
      headers["content-type"] = "application/x-www-form-urlencoded;charset=UTF-8";
      body = new URLSearchParams();
      body.set("key", context.apiKey);
      for (const [key, value] of Object.entries(options.form ?? {})) {
        if (value !== undefined) {
          body.set(key, value);
        }
      }
    }

    const response = await context.fetcher(url, {
      method,
      headers,
      body,
      signal: timeout.signal,
    });
    const bodyText = await response.text();
    const contentType = response.headers.get("content-type");
    const payload = parseNeverBouncePayload(bodyText, contentType);
    if (!response.ok) {
      throw createNeverBounceError(response.status, payload, phase);
    }
    if (contentType?.includes("application/json")) {
      const record = optionalRecord(payload);
      if (!record || optionalString(record.status) !== "success") {
        throw createNeverBounceError(response.status, payload, phase);
      }
    }
    return { payload, bodyText, headers: response.headers };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "NeverBounce request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `NeverBounce request failed: ${error.message}` : "NeverBounce request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildCreateJobForm(input: Record<string, unknown>): Record<string, string | undefined> {
  const requestMetaData = optionalRecord(input.request_meta_data);
  const callbackHeaders = optionalRecord(input.callback_headers);
  const form: Record<string, string | undefined> = {
    input_location: requiredInputString(input.input_location, "input_location"),
    input:
      typeof input.input === "string" ? input.input : JSON.stringify(Array.isArray(input.input) ? input.input : []),
    filename: optionalString(input.filename),
    auto_parse: booleanText(input.auto_parse),
    auto_start: booleanText(input.auto_start),
    run_sample: booleanText(input.run_sample),
    allow_manual_review: booleanText(input.allow_manual_review),
    callback_url: optionalString(input.callback_url),
  };
  const leverageHistoricalData = optionalBoolean(requestMetaData?.leverage_historical_data);
  if (leverageHistoricalData !== undefined) {
    form["request_meta_data[leverage_historical_data]"] = leverageHistoricalData ? "true" : "false";
  }
  if (callbackHeaders) {
    for (const [key, value] of Object.entries(callbackHeaders)) {
      const headerValue = optionalString(value);
      if (headerValue) {
        form[`callback_headers[${key}]`] = headerValue;
      }
    }
  }
  return compactObject(form) as Record<string, string>;
}

function buildDownloadQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  const query: Record<string, string | undefined> = {
    job_id: requiredJobId(input.job_id, "job_id"),
  };
  for (const key of [
    "valids",
    "invalids",
    "catchalls",
    "unknowns",
    "disposables",
    "include_duplicates",
    "only_duplicates",
    "only_bad_syntax",
    "email_status",
    "email_status_int",
    "has_dns_info",
    "has_mail_server",
    "mail_server_reachable",
    "free_email_host",
    "role_account",
    "addr",
    "alias",
    "host",
    "fqdn",
    "subdomain",
    "domain",
    "tld",
    "network",
    "bad_syntax",
  ]) {
    query[key] = booleanFlag(input[key]);
  }
  query.binary_operators_type = optionalString(input.binary_operators_type);
  query.line_feed_type = optionalString(input.line_feed_type);
  return query;
}

function parseNeverBouncePayload(bodyText: string, contentType: string | null): unknown {
  if (!bodyText) {
    return null;
  }
  if (!contentType?.includes("application/json")) {
    return bodyText;
  }
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return bodyText;
  }
}

function createNeverBounceError(status: number, payload: unknown, phase: NeverBouncePhase): ProviderRequestError {
  const message = extractNeverBounceErrorMessage(payload) ?? "NeverBounce request failed";
  const lower = message.toLowerCase();
  const credentialFailure =
    lower.includes("api key") || lower.includes("authentication") || lower.includes("authorized");
  if (credentialFailure || status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractNeverBounceErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  return (
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(record?.error_message) ??
    optionalString(record?.reason)
  );
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requiredJobId(value: unknown, fieldName: string): string {
  const jobId = optionalInteger(value);
  if (jobId === undefined || jobId <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return String(jobId);
}

function booleanText(value: unknown): string | undefined {
  const parsed = optionalBoolean(value);
  return parsed === undefined ? undefined : parsed ? "true" : "false";
}

function booleanFlag(value: unknown): string | undefined {
  const parsed = optionalBoolean(value);
  return parsed === undefined ? undefined : parsed ? "1" : "0";
}

function parseContentDispositionFilename(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const filenameStarMatch = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (filenameStarMatch?.[1]) {
    try {
      return decodeURIComponent(filenameStarMatch[1]);
    } catch {}
  }
  return value.match(/filename="?([^";]+)"?/i)?.[1];
}
