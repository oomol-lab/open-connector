import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const gtmetrixApiBaseUrl = "https://gtmetrix.com/api/2.0";
const gtmetrixJsonMediaType = "application/vnd.api+json";

type GtmetrixRequestPhase = "validate" | "execute";
type GtmetrixQueryValue = string | number | boolean | readonly string[] | readonly number[] | undefined;

interface GtmetrixRequestInput {
  apiKey: string;
  path: string;
  method: "GET" | "POST";
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: GtmetrixRequestPhase;
  query?: Record<string, GtmetrixQueryValue>;
  body?: unknown;
  redirect?: RequestRedirect;
  allowedStatuses?: number[];
}

export const gtmetrixActionHandlers: ProviderActionHandlers<
  "gtmetrix",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async get_account_status(_input, context): Promise<unknown> {
    const { payload } = await requestGtmetrixJson({
      apiKey: context.apiKey,
      path: "/status",
      method: "GET",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return {
      status: readStatusAttributes(payload),
    };
  },
  async list_locations(_input, context): Promise<unknown> {
    const { payload } = await requestGtmetrixJson({
      apiKey: context.apiKey,
      path: "/locations",
      method: "GET",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return {
      locations: readDataArray(payload, "gtmetrix locations response"),
    };
  },
  async get_location(input, context): Promise<unknown> {
    const locationId = readRequiredInputString(input, "location_id");
    const { payload } = await requestGtmetrixJson({
      apiKey: context.apiKey,
      path: `/locations/${encodeURIComponent(locationId)}`,
      method: "GET",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return {
      location: readDataObject(payload, "gtmetrix location response"),
    };
  },
  async list_browsers(_input, context): Promise<unknown> {
    const { payload } = await requestGtmetrixJson({
      apiKey: context.apiKey,
      path: "/browsers",
      method: "GET",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return {
      browsers: readDataArray(payload, "gtmetrix browsers response"),
    };
  },
  async get_browser(input, context): Promise<unknown> {
    const browserId = readRequiredInputString(input, "browser_id");
    const { payload } = await requestGtmetrixJson({
      apiKey: context.apiKey,
      path: `/browsers/${encodeURIComponent(browserId)}`,
      method: "GET",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return {
      browser: readDataObject(payload, "gtmetrix browser response"),
    };
  },
  async list_simulated_devices(_input, context): Promise<unknown> {
    const { payload } = await requestGtmetrixJson({
      apiKey: context.apiKey,
      path: "/simulated-devices",
      method: "GET",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return {
      simulated_devices: readDataArray(payload, "gtmetrix simulated devices response"),
    };
  },
  async get_simulated_device(input, context): Promise<unknown> {
    const simulatedDeviceId = readRequiredInputString(input, "simulated_device_id");
    const { payload } = await requestGtmetrixJson({
      apiKey: context.apiKey,
      path: `/simulated-devices/${encodeURIComponent(simulatedDeviceId)}`,
      method: "GET",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return {
      simulated_device: readDataObject(payload, "gtmetrix simulated device response"),
    };
  },
  async start_test(input, context): Promise<unknown> {
    const { payload } = await requestGtmetrixJson({
      apiKey: context.apiKey,
      path: "/tests",
      method: "POST",
      body: buildStartTestBody(input),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    const root = requiredRecord(payload, "gtmetrix start test response", providerResponseError);

    return {
      test: readDataObject(root, "gtmetrix start test response"),
      meta: requiredRecord(root.meta, "gtmetrix start test response meta", providerResponseError),
      links: requiredRecord(root.links, "gtmetrix start test response links", providerResponseError),
    };
  },
  async list_tests(input, context): Promise<unknown> {
    const { payload } = await requestGtmetrixJson({
      apiKey: context.apiKey,
      path: "/tests",
      method: "GET",
      query: buildListTestsQuery(input),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    const root = requiredRecord(payload, "gtmetrix tests response", providerResponseError);

    return {
      tests: readDataArray(root, "gtmetrix tests response"),
      links: optionalRecord(root.links) ?? null,
      meta: optionalRecord(root.meta) ?? null,
    };
  },
  async get_test(input, context): Promise<unknown> {
    const testId = readRequiredInputString(input, "test_id");
    const { response, payload } = await requestGtmetrixJson({
      apiKey: context.apiKey,
      path: `/tests/${encodeURIComponent(testId)}`,
      method: "GET",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      redirect: "manual",
      allowedStatuses: [303],
    });
    const root = requiredRecord(payload, "gtmetrix test response", providerResponseError);
    const test = readDataObject(root, "gtmetrix test response");
    const reportUrlHeader = optionalString(response.headers.get("Location"));
    const retryAfterHeader = parseOptionalIntegerHeader(response.headers.get("Retry-After"));
    const isComplete = response.status === 303 || readNestedState(test) === "completed";
    const result: Record<string, unknown> = {
      test,
      is_complete: isComplete,
      report_url: reportUrlHeader ?? readNestedReportLink(test),
    };
    if (!isComplete && retryAfterHeader !== undefined) {
      result.retry_after_seconds = retryAfterHeader;
    }
    return compactObject(result);
  },
  async list_pages(input, context): Promise<unknown> {
    const { payload } = await requestGtmetrixJson({
      apiKey: context.apiKey,
      path: "/pages",
      method: "GET",
      query: buildListPagesQuery(input),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    const root = requiredRecord(payload, "gtmetrix pages response", providerResponseError);

    return {
      pages: readDataArray(root, "gtmetrix pages response"),
      links: optionalRecord(root.links) ?? null,
      meta: optionalRecord(root.meta) ?? null,
    };
  },
  async get_page(input, context): Promise<unknown> {
    const pageId = readRequiredInputString(input, "page_id");
    const { payload } = await requestGtmetrixJson({
      apiKey: context.apiKey,
      path: `/pages/${encodeURIComponent(pageId)}`,
      method: "GET",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return {
      page: readDataObject(payload, "gtmetrix page response"),
    };
  },
  async list_page_reports(input, context): Promise<unknown> {
    const pageId = readRequiredInputString(input, "page_id");
    const { payload } = await requestGtmetrixJson({
      apiKey: context.apiKey,
      path: `/pages/${encodeURIComponent(pageId)}/reports`,
      method: "GET",
      query: buildListPageReportsQuery(input),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    const root = requiredRecord(payload, "gtmetrix page reports response", providerResponseError);

    return {
      reports: readDataArray(root, "gtmetrix page reports response"),
      links: optionalRecord(root.links) ?? null,
      meta: optionalRecord(root.meta) ?? null,
    };
  },
  async get_latest_page_report(input, context): Promise<unknown> {
    const pageId = readRequiredInputString(input, "page_id");
    const { payload } = await requestGtmetrixJson({
      apiKey: context.apiKey,
      path: `/pages/${encodeURIComponent(pageId)}/latest-report`,
      method: "GET",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return {
      report: readDataObject(payload, "gtmetrix latest page report response"),
    };
  },
  async get_report(input, context): Promise<unknown> {
    const reportSlug = readRequiredInputString(input, "report_slug");
    const { payload } = await requestGtmetrixJson({
      apiKey: context.apiKey,
      path: `/reports/${encodeURIComponent(reportSlug)}`,
      method: "GET",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return {
      report: readDataObject(payload, "gtmetrix report response"),
    };
  },
};

export async function validateGtmetrixCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const { payload } = await requestGtmetrixJson({
    apiKey,
    path: "/status",
    method: "GET",
    fetcher,
    signal,
    phase: "validate",
  });
  const status = readStatusAttributes(payload);

  return {
    profile: {
      accountId: `gtmetrix:api_key:${createHash("sha256").update(apiKey).digest("hex").slice(0, 16)}`,
      displayName: "GTmetrix API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: gtmetrixApiBaseUrl,
      validationEndpoint: "/status",
      accountType: optionalString(status.account_type),
      apiCredits: optionalNumber(status.api_credits),
      apiRefill: optionalInteger(status.api_refill),
      apiRefillAmount: optionalNumber(status.api_refill_amount),
      accountProAnalysisOptionsAccess: optionalBoolean(status.account_pro_analysis_options_access),
      accountProLocationsAccess: optionalBoolean(status.account_pro_locations_access),
      accountWhitelabelPdfAccess: optionalBoolean(status.account_whitelabel_pdf_access),
      accountProTeamRole: optionalString(status.account_pro_team_role),
    }),
  };
}

async function requestGtmetrixJson(input: GtmetrixRequestInput): Promise<{
  response: Response;
  payload: Record<string, unknown>;
}> {
  const response = await fetchGtmetrix(input);
  const payload = await readGtmetrixPayload(response);
  const allowedStatuses = new Set(input.allowedStatuses ?? []);
  if (!response.ok && !allowedStatuses.has(response.status)) {
    throw buildGtmetrixError(response.status, payload, input.phase);
  }
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "GTmetrix returned an invalid JSON response");
  }
  return { response, payload: record };
}

async function fetchGtmetrix(input: GtmetrixRequestInput): Promise<Response> {
  const timeout = createProviderTimeout(input.signal);
  const url = new URL(normalizePath(input.path), `${gtmetrixApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined) continue;
    url.searchParams.set(key, Array.isArray(value) ? value.map((item) => String(item)).join(",") : String(value));
  }

  try {
    return await input.fetcher(url, {
      method: input.method,
      headers: buildGtmetrixHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      redirect: input.redirect,
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, `GTmetrix request to ${input.path} timed out after 30 seconds`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `GTmetrix request failed: ${error.message}` : "GTmetrix request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildGtmetrixHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: gtmetrixJsonMediaType,
    authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = gtmetrixJsonMediaType;
  }
  return headers;
}

async function readGtmetrixPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "GTmetrix returned invalid JSON");
  }
}

function buildGtmetrixError(status: number, payload: unknown, phase: GtmetrixRequestPhase): ProviderRequestError {
  const message = extractGtmetrixErrorMessage(payload) ?? `GTmetrix request failed with ${status || 500}`;
  if (status === 402 || status === 429) return new ProviderRequestError(429, message, payload);
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 400 || status === 404) return new ProviderRequestError(status, message, payload);
  return new ProviderRequestError(status || 500, message, payload);
}

function buildStartTestBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    data: {
      type: "test",
      attributes: compactObject({
        url: readRequiredInputString(input, "url"),
        location: optionalString(input.location_id),
        browser: optionalString(input.browser_id),
        report: optionalString(input.report),
        retention: optionalInteger(input.retention),
        httpauth_username: optionalString(input.httpauth_username),
        httpauth_password: optionalString(input.httpauth_password),
        adblock: booleanToFlag(optionalBoolean(input.adblock)),
        cookies: readStringArray(input.cookies),
        video: booleanToFlag(optionalBoolean(input.video)),
        stop_onload: booleanToFlag(optionalBoolean(input.stop_onload)),
        throttle: optionalString(input.throttle),
        allow_url: readStringArray(input.allow_url),
        block_url: readStringArray(input.block_url),
        dns: readStringArray(input.dns),
        simulate_device: optionalString(input.simulate_device_id),
        anonymize_user_agent: booleanToFlag(optionalBoolean(input.anonymize_user_agent)),
        user_agent: optionalString(input.user_agent),
        browser_width: optionalInteger(input.browser_width),
        browser_height: optionalInteger(input.browser_height),
        browser_dppx: optionalNumber(input.browser_dppx),
        browser_rotate: booleanToFlag(optionalBoolean(input.browser_rotate)),
      }),
    },
  };
}

function buildListTestsQuery(input: Record<string, unknown>): Record<string, GtmetrixQueryValue> {
  const query: Record<string, GtmetrixQueryValue> = {
    "page[size]": optionalInteger(input.page_size),
    "page[number]": optionalInteger(input.page_number),
    sort: readStringArray(input.sort),
    "filter[:bool]": optionalString(input.filter_bool),
    "filter[source]": readStringArray(input.sources),
    "filter[state]": readStringArray(input.states),
    "filter[location]": readStringArray(input.location_ids),
    "filter[browser]": readStringArray(input.browser_ids),
  };
  addTimestampComparisons(query, input, "created");
  addTimestampComparisons(query, input, "started");
  addTimestampComparisons(query, input, "finished");
  return query;
}

function buildListPagesQuery(input: Record<string, unknown>): Record<string, GtmetrixQueryValue> {
  const query: Record<string, GtmetrixQueryValue> = {
    "page[size]": optionalInteger(input.page_size),
    "page[number]": optionalInteger(input.page_number),
    sort: readStringArray(input.sort),
    "filter[:bool]": optionalString(input.filter_bool),
    "filter[location]": readStringArray(input.location_ids),
    "filter[browser]": readStringArray(input.browser_ids),
    "filter[monitored]": readStringArray(input.monitored),
    "filter[url]": readStringArray(input.urls),
  };
  addTimestampComparisons(query, input, "created");
  addTimestampComparisons(query, input, "latest_report_time");
  return query;
}

function buildListPageReportsQuery(input: Record<string, unknown>): Record<string, GtmetrixQueryValue> {
  return {
    "page[size]": optionalInteger(input.page_size),
    "page[number]": optionalInteger(input.page_number),
    sort: readStringArray(input.sort),
  };
}

function addTimestampComparisons(
  query: Record<string, GtmetrixQueryValue>,
  input: Record<string, unknown>,
  field: string,
) {
  for (const operator of ["eq", "gt", "gte", "lt", "lte"]) {
    const key = `${field}_${operator}`;
    const value = optionalInteger(input[key]);
    if (value !== undefined) {
      query[`filter[${field}:${operator}]`] = value;
    }
  }
}

function readStatusAttributes(payload: Record<string, unknown>): Record<string, unknown> {
  const resource = readDataObject(payload, "gtmetrix status response");
  return requiredRecord(resource.attributes, "gtmetrix status attributes", providerResponseError);
}

function readDataObject(payload: Record<string, unknown>, label: string): Record<string, unknown> {
  return requiredRecord(payload.data, `${label} data`, providerResponseError);
}

function readDataArray(payload: Record<string, unknown>, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(payload.data)) {
    throw new ProviderRequestError(502, `${label} must contain a data array`);
  }
  return payload.data.map((item) => requiredRecord(item, `${label} item`, providerResponseError));
}

function extractGtmetrixErrorMessage(payload: unknown): string | undefined {
  const root = optionalRecord(payload);
  const errors = root?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return undefined;
  const first = optionalRecord(errors[0]);
  return optionalString(first?.detail) ?? optionalString(first?.title) ?? optionalString(first?.code);
}

function readNestedState(test: Record<string, unknown>): string | undefined {
  return optionalString(optionalRecord(test.attributes)?.state);
}

function readNestedReportLink(test: Record<string, unknown>): string | undefined {
  return optionalString(optionalRecord(test.links)?.report);
}

function readRequiredInputString(input: Record<string, unknown>, key: string): string {
  const value = optionalString(input[key]);
  if (!value) {
    throw new ProviderRequestError(400, `${key} is required`);
  }
  return value;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value.map((item) => optionalString(item)).filter((item): item is string => item !== undefined);
  return parsed.length > 0 ? parsed : undefined;
}

function booleanToFlag(value: boolean | undefined): number | undefined {
  if (value === undefined) return undefined;
  return value ? 1 : 0;
}

function parseOptionalIntegerHeader(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}
