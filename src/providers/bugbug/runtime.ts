import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const bugbugApiBaseUrl = "https://app.bugbug.io";
const bugbugValidationPath = "/api/v2/tests/";

type BugbugRequestPhase = "validate" | "execute";
type BugbugQueryValue = boolean | number | string | null | undefined;
type BugbugActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type BugbugActionHandler = (input: Record<string, unknown>, context: BugbugActionContext) => Promise<unknown>;

interface BugbugRequestOptions {
  apiKey: string;
  path: string;
  fetcher: ProviderFetch;
  phase: BugbugRequestPhase;
  method?: string;
  query?: Record<string, BugbugQueryValue>;
  body?: unknown;
  signal?: AbortSignal;
  notFoundAsInvalidInput?: boolean;
}

export const bugbugActionHandlers: ProviderActionHandlers<"bugbug", BugbugActionHandler> = {
  list_tests(input, context) {
    return listBugbugTests(input, context);
  },
  get_test(input, context) {
    return getBugbugTest(input, context);
  },
  list_suites(input, context) {
    return listBugbugSuites(input, context);
  },
  get_suite(input, context) {
    return getBugbugSuite(input, context);
  },
  list_profiles(input, context) {
    return listBugbugProfiles(input, context);
  },
  list_test_runs(input, context) {
    return listBugbugTestRuns(input, context);
  },
  run_test(input, context) {
    return runBugbugTest(input, context);
  },
  get_test_run_status(input, context) {
    return getBugbugTestRunStatus(input, context);
  },
};

export async function validateBugbugCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const trimmedApiKey = optionalString(apiKey);
  if (!trimmedApiKey) {
    throw new ProviderRequestError(400, "apiKey is required");
  }

  const payload = await requestBugbugJson<Record<string, unknown>>({
    apiKey: trimmedApiKey,
    path: bugbugValidationPath,
    query: {
      page: 1,
      page_size: 1,
    },
    fetcher,
    signal,
    phase: "validate",
  });

  return {
    profile: {
      accountId: "api_token",
      displayName: "BugBug API Token",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: bugbugApiBaseUrl,
      validationEndpoint: bugbugValidationPath,
      testCount: optionalInteger(payload.count) ?? 0,
    },
  };
}

async function listBugbugTests(
  input: Record<string, unknown>,
  context: BugbugActionContext,
): Promise<Record<string, unknown>> {
  return requestBugbugJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: "/api/v2/tests/",
    query: compactObject({
      page: optionalInteger(input.page),
      page_size: optionalInteger(input.page_size),
      query: optionalString(input.query),
      ordering: optionalString(input.ordering),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
}

async function getBugbugTest(
  input: Record<string, unknown>,
  context: BugbugActionContext,
): Promise<Record<string, unknown>> {
  return requestBugbugJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/api/v2/tests/${encodeURIComponent(requireFieldString(input.id, "id"))}/`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
}

async function listBugbugSuites(
  input: Record<string, unknown>,
  context: BugbugActionContext,
): Promise<Record<string, unknown>> {
  return requestBugbugJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: "/api/v2/suites/",
    query: compactObject({
      page: optionalInteger(input.page),
      page_size: optionalInteger(input.page_size),
      query: optionalString(input.query),
      ordering: optionalString(input.ordering),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
}

async function getBugbugSuite(
  input: Record<string, unknown>,
  context: BugbugActionContext,
): Promise<Record<string, unknown>> {
  return requestBugbugJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/api/v2/suites/${encodeURIComponent(requireFieldString(input.id, "id"))}/`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
}

async function listBugbugProfiles(
  input: Record<string, unknown>,
  context: BugbugActionContext,
): Promise<Record<string, unknown>> {
  return requestBugbugJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: "/api/v2/profiles/",
    query: compactObject({
      page: optionalInteger(input.page),
      page_size: optionalInteger(input.page_size),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
}

async function listBugbugTestRuns(
  input: Record<string, unknown>,
  context: BugbugActionContext,
): Promise<Record<string, unknown>> {
  return requestBugbugJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: "/api/v2/testruns/",
    query: compactObject({
      page: optionalInteger(input.page),
      page_size: optionalInteger(input.page_size),
      ordering: optionalString(input.ordering),
      started_after: optionalString(input.started_after),
      started_before: optionalString(input.started_before),
      status: optionalString(input.status),
      test_id: optionalString(input.test_id),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
}

async function runBugbugTest(
  input: Record<string, unknown>,
  context: BugbugActionContext,
): Promise<Record<string, unknown>> {
  return requestBugbugJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: "/api/v2/testruns/",
    method: "POST",
    body: compactObject({
      testId: requireFieldString(input.testId, "testId"),
      runProfileId: input.runProfileId === null ? null : optionalString(input.runProfileId),
      variables: Array.isArray(input.variables) ? input.variables : (input.variables ?? undefined),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
}

async function getBugbugTestRunStatus(
  input: Record<string, unknown>,
  context: BugbugActionContext,
): Promise<Record<string, unknown>> {
  return requestBugbugJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/api/v2/testruns/${encodeURIComponent(requireFieldString(input.id, "id"))}/status/`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
}

async function requestBugbugJson<T>(options: BugbugRequestOptions): Promise<T> {
  let response: Response;
  try {
    response = await options.fetcher(buildBugbugUrl(options.path, options.query), {
      method: options.method,
      headers: buildBugbugHeaders(options.apiKey, options.body !== undefined),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `bugbug request failed: ${error.message}` : "bugbug request failed",
      error,
    );
  }

  const payload = await readBugbugPayload(response);
  if (!response.ok) {
    throw createBugbugError(response, payload, options.phase, options.notFoundAsInvalidInput);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProviderRequestError(502, "bugbug response body must be an object", payload);
  }

  return payload as T;
}

function buildBugbugUrl(path: string, query: Record<string, BugbugQueryValue> = {}): string {
  const url = new URL(path, bugbugApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function buildBugbugHeaders(apiKey: string, hasJsonBody = false): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Token ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasJsonBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readBugbugPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createBugbugError(
  response: Response,
  payload: unknown,
  phase: BugbugRequestPhase,
  notFoundAsInvalidInput = false,
): ProviderRequestError {
  const message =
    extractBugbugErrorMessage(payload) ?? (response.statusText || `bugbug request failed with ${response.status}`);

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if ((response.status === 401 || response.status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message, payload);
}

function extractBugbugErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload) {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.detail) ?? optionalString(record.message) ?? optionalString(record.error);
}

function requireFieldString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}
