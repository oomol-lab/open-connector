import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "statuscake";
const statuscakeApiBaseUrl = "https://api.statuscake.com/v1";

type StatuscakePhase = "validate" | "execute";
type StatuscakeActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const statuscakeActionHandlers: ProviderActionHandlers<"statuscake", StatuscakeActionHandler> = {
  list_uptime_tests(input, context) {
    return listUptimeTests(input, context);
  },
  get_uptime_test(input, context) {
    return getUptimeTest(input, context);
  },
  create_uptime_test(input, context) {
    return createUptimeTest(input, context);
  },
  update_uptime_test(input, context) {
    return updateUptimeTest(input, context);
  },
  delete_uptime_test(input, context) {
    return deleteUptimeTest(input, context);
  },
  list_uptime_test_history(input, context) {
    return listUptimeTestHistory(input, context);
  },
  list_uptime_test_periods(input, context) {
    return listUptimeTestPeriods(input, context);
  },
  list_uptime_test_alerts(input, context) {
    return listUptimeTestAlerts(input, context);
  },
  list_uptime_locations(_input, context) {
    return listUptimeLocations(context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, statuscakeActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: ApiKeyProviderContext = {
      apiKey: input.apiKey,
      fetcher,
      signal,
    };
    const payload = await requestStatuscakeJson<Record<string, unknown>>({
      apiKey: input.apiKey,
      path: "/uptime",
      query: buildQueryParams({ limit: 1 }),
      context,
      phase: "validate",
    });
    const body = requireObjectPayload(payload, "statuscake uptime list response");
    const tests = requireArrayPayload(body.data, "statuscake uptime list response data");
    const metadata = optionalRecord(body.metadata);

    return {
      profile: {
        accountId: "statuscake-api-token",
        displayName: "StatusCake API Token",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: statuscakeApiBaseUrl,
        validationEndpoint: "/uptime?limit=1",
        uptimeTestCount: typeof metadata?.total_count === "number" ? metadata.total_count : tests.length,
      },
    };
  },
};

async function listUptimeTests(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestStatuscakeJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: "/uptime",
    query: buildQueryParams(input),
    context,
    phase: "execute",
  });
  const body = requireObjectPayload(payload, "statuscake uptime list response");
  return {
    tests: requireArrayPayload(body.data, "statuscake uptime list response data"),
    pagination: optionalRecord(body.metadata) ?? null,
  };
}

async function getUptimeTest(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const testId = requireInputString(input.test_id, "test_id");
  const payload = await requestStatuscakeJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/uptime/${encodeURIComponent(testId)}`,
    context,
    phase: "execute",
  });
  const body = requireObjectPayload(payload, "statuscake uptime test response");
  return { test: requireObjectPayload(body.data, "statuscake uptime test") };
}

async function createUptimeTest(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestStatuscakeJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: "/uptime",
    method: "POST",
    body: buildUptimeFormBody(input),
    context,
    phase: "execute",
  });
  const body = requireObjectPayload(payload, "statuscake create uptime test response");
  return { test: requireObjectPayload(body.data, "statuscake created uptime test") };
}

async function updateUptimeTest(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const testId = requireInputString(input.test_id, "test_id");
  const payload = await requestStatuscakeJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/uptime/${encodeURIComponent(testId)}`,
    method: "PUT",
    body: buildUptimeFormBody(input, { skipTestId: true }),
    context,
    phase: "execute",
  });
  const body = requireObjectPayload(payload, "statuscake update uptime test response");
  return { test: requireObjectPayload(body.data, "statuscake updated uptime test") };
}

async function deleteUptimeTest(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const testId = requireInputString(input.test_id, "test_id");
  await requestStatuscakeJson({
    apiKey: context.apiKey,
    path: `/uptime/${encodeURIComponent(testId)}`,
    method: "DELETE",
    context,
    phase: "execute",
  });
  return { deleted: true };
}

async function listUptimeTestHistory(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return listWindowedUptimeResource({
    apiKey: context.apiKey,
    testId: requireInputString(input.test_id, "test_id"),
    resourcePath: "history",
    resultKey: "history",
    input,
    context,
  });
}

async function listUptimeTestPeriods(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return listWindowedUptimeResource({
    apiKey: context.apiKey,
    testId: requireInputString(input.test_id, "test_id"),
    resourcePath: "periods",
    resultKey: "periods",
    input,
    context,
  });
}

async function listUptimeTestAlerts(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return listWindowedUptimeResource({
    apiKey: context.apiKey,
    testId: requireInputString(input.test_id, "test_id"),
    resourcePath: "alerts",
    resultKey: "alerts",
    input,
    context,
  });
}

async function listWindowedUptimeResource(input: {
  apiKey: string;
  testId: string;
  resourcePath: "history" | "periods" | "alerts";
  resultKey: "history" | "periods" | "alerts";
  input: Record<string, unknown>;
  context: ApiKeyProviderContext;
}): Promise<unknown> {
  const payload = await requestStatuscakeJson<Record<string, unknown>>({
    apiKey: input.apiKey,
    path: `/uptime/${encodeURIComponent(input.testId)}/${input.resourcePath}`,
    query: buildQueryParams(input.input),
    context: input.context,
    phase: "execute",
  });
  const body = requireObjectPayload(payload, `statuscake ${input.resourcePath} response`);
  return {
    [input.resultKey]: requireArrayPayload(body.data, `statuscake ${input.resourcePath} response data`),
    links: optionalRecord(body.links) ?? null,
  };
}

async function listUptimeLocations(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestStatuscakeJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: "/uptime-locations",
    context,
    phase: "execute",
  });
  const body = requireObjectPayload(payload, "statuscake uptime locations response");
  return {
    locations: requireArrayPayload(body.data, "statuscake uptime locations response data"),
  };
}

async function requestStatuscakeJson<T>(input: {
  apiKey: string;
  path: string;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: StatuscakePhase;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: URLSearchParams;
  body?: URLSearchParams;
}): Promise<T> {
  const response = await statuscakeFetch(input);
  const payload = await readStatuscakePayload(response);
  if (!response.ok) {
    throw createStatuscakeError(response, payload, input.phase);
  }
  return payload as T;
}

async function statuscakeFetch(input: {
  apiKey: string;
  path: string;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: URLSearchParams;
  body?: URLSearchParams;
}): Promise<Response> {
  const relativePath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(relativePath, `${statuscakeApiBaseUrl}/`);
  if (input.query) {
    url.search = input.query.toString();
  }

  const timeout = createProviderTimeout(input.context.signal);
  try {
    return await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: buildStatuscakeHeaders(input.apiKey, input.body),
      signal: timeout.signal,
      body: input.body,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "statuscake request timed out.");
    }
    throw new ProviderRequestError(
      502,
      `statuscake request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildStatuscakeHeaders(apiKey: string, body?: URLSearchParams): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    "User-Agent": providerUserAgent,
    ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
  };
}

async function readStatuscakePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "statuscake returned invalid JSON.");
  }
}

function createStatuscakeError(response: Response, payload: unknown, phase: StatuscakePhase): ProviderRequestError {
  const message = readStatuscakeErrorMessage(payload) ?? `statuscake request failed with status ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status >= 500) {
    return new ProviderRequestError(502, message, payload);
  }
  if (phase === "validate" || (response.status >= 400 && response.status < 500)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function readStatuscakeErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload) {
    return payload;
  }
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }
  const directMessage = optionalString(object.message);
  if (directMessage) {
    return directMessage;
  }
  const errors = optionalRecord(object.errors);
  if (!errors) {
    return undefined;
  }
  for (const [field, value] of Object.entries(errors)) {
    if (Array.isArray(value)) {
      const firstMessage = value.find((item) => typeof item === "string");
      if (typeof firstMessage === "string") {
        return `${field}: ${firstMessage}`;
      }
    }
    const directError = optionalString(value);
    if (directError) {
      return `${field}: ${directError}`;
    }
  }
  return undefined;
}

function requireObjectPayload(value: unknown, label: string): Record<string, unknown> {
  const parsed = optionalRecord(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `${label} is not an object.`, value);
  }
  return parsed;
}

function requireArrayPayload(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} is not an array.`, value);
  }
  return value;
}

function requireInputString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required.`);
  }
  return parsed;
}

function buildQueryParams(input: Record<string, unknown>): URLSearchParams {
  const query = new URLSearchParams();
  appendQueryValue(query, "page", optionalInteger(input.page));
  appendQueryValue(query, "limit", optionalInteger(input.limit));
  appendQueryValue(query, "tags", optionalString(input.tags));
  appendQueryValue(query, "uptime", optionalBoolean(input.uptime));
  appendQueryValue(query, "before", optionalInteger(input.before));
  appendQueryValue(query, "after", optionalInteger(input.after));
  return query;
}

function buildUptimeFormBody(
  input: Record<string, unknown>,
  options: {
    skipTestId?: boolean;
  } = {},
): URLSearchParams {
  const body = new URLSearchParams();
  if (!options.skipTestId) {
    appendFormValue(body, "test_id", optionalString(input.test_id));
  }
  appendFormValue(body, "host", optionalString(input.host));
  appendFormValue(body, "name", optionalString(input.name));
  appendFormValue(body, "port", optionalInteger(input.port));
  appendFormArray(body, "tags[]", input.tags);
  appendFormValue(body, "paused", optionalBoolean(input.paused));
  appendFormArray(body, "dns_ips[]", input.dns_ips);
  appendFormArray(body, "regions[]", input.regions);
  appendFormValue(body, "timeout", optionalInteger(input.timeout));
  appendFormValue(body, "use_jar", optionalBoolean(input.use_jar));
  appendFormValue(body, "post_raw", optionalString(input.post_raw));
  appendFormValue(body, "post_body", optionalString(input.post_body));
  appendFormValue(body, "test_type", optionalString(input.test_type));
  appendFormValue(body, "check_rate", optionalInteger(input.check_rate));
  appendFormValue(body, "dns_server", optionalString(input.dns_server));
  appendFormValue(body, "user_agent", optionalString(input.user_agent));
  appendFormValue(body, "do_not_find", optionalBoolean(input.do_not_find));
  appendFormValue(body, "find_string", optionalString(input.find_string));
  appendFormValue(body, "website_url", optionalString(input.website_url));
  appendFormValue(body, "confirmation", optionalInteger(input.confirmation));
  appendFormValue(body, "trigger_rate", optionalInteger(input.trigger_rate));
  appendFormJsonValue(body, "custom_header", input.custom_header);
  appendFormValue(body, "basic_password", optionalString(input.basic_password));
  appendFormValue(body, "basic_username", optionalString(input.basic_username));
  appendFormArray(body, "contact_groups[]", input.contact_groups);
  appendFormValue(body, "follow_redirects", optionalBoolean(input.follow_redirects));
  appendFormValue(body, "include_header", optionalBoolean(input.include_header));
  appendFormArray(body, "status_codes[]", input.status_codes);
  return body;
}

function appendQueryValue(query: URLSearchParams, key: string, value: unknown): void {
  if (value !== undefined) {
    query.append(key, String(value));
  }
}

function appendFormValue(body: URLSearchParams, key: string, value: unknown): void {
  if (value !== undefined) {
    body.append(key, String(value));
  }
}

function appendFormArray(body: URLSearchParams, key: string, value: unknown): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (const item of value) {
    if (item !== undefined && item !== null && item !== "") {
      body.append(key, String(item));
    }
  }
}

function appendFormJsonValue(body: URLSearchParams, key: string, value: unknown): void {
  const direct = optionalString(value);
  if (direct) {
    body.append(key, direct);
    return;
  }
  const object = optionalRecord(value);
  if (object) {
    body.append(key, JSON.stringify(object));
  }
}
