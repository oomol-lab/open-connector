import { optionalRecord, optionalString } from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

interface ApiKeyProviderActionInput {
  apiKey: string;
  values: Record<string, string>;
  actionName: string;
  input: Record<string, unknown>;
}

export const practitestApiBaseUrl = "https://api.practitest.com/api/v2";

interface PractitestActionInput extends ApiKeyProviderActionInput {
  actionName: string;
  input: Record<string, unknown>;
}

interface PractitestRequestOptions {
  apiKey: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  fetcher: typeof fetch;
  phase: "validate" | "execute";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

export async function validatePractitestCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<{ accountLabel: string; providerScopes: string[]; providerMetadata: Record<string, unknown> }> {
  const apiKey = input.apiKey;
  await requestPractitest({
    apiKey,
    method: "GET",
    path: "/projects.json",
    query: { "page[number]": "1", "page[size]": "1" },
    fetcher,
    phase: "validate",
  });
  return {
    accountLabel: "PractiTest API Token",
    providerScopes: [],
    providerMetadata: {
      apiBaseUrl: practitestApiBaseUrl,
      validationEndpoint: "/projects.json",
    },
  };
}

export async function executePractitestAction(input: PractitestActionInput, fetcher: typeof fetch): Promise<unknown> {
  const apiKey = input.apiKey;
  if (input.actionName === "list_projects") {
    return normalizeListResponse(
      await requestPractitest({
        apiKey,
        method: "GET",
        path: "/projects.json",
        query: buildPageQuery(input.input),
        fetcher,
        phase: "execute",
      }),
      "projects",
    );
  }

  const projectId = encodeURIComponent(requireString(input.input.projectId, "projectId"));
  if (input.actionName === "get_project") {
    return {
      project: normalizeSingleResponse(
        await requestPractitest({
          apiKey,
          method: "GET",
          path: `/projects/${projectId}.json`,
          fetcher,
          phase: "execute",
        }),
        "project",
      ),
    };
  }
  if (input.actionName === "list_tests") {
    return normalizeListResponse(
      await requestPractitest({
        apiKey,
        method: "GET",
        path: `/projects/${projectId}/tests.json`,
        query: buildTestListQuery(input.input),
        fetcher,
        phase: "execute",
      }),
      "tests",
    );
  }
  if (input.actionName === "create_test") {
    return {
      test: normalizeSingleResponse(
        await requestPractitest({
          apiKey,
          method: "POST",
          path: `/projects/${projectId}/tests.json`,
          body: buildTestBody(input.input, true),
          fetcher,
          phase: "execute",
        }),
        "test",
      ),
    };
  }

  const testId = encodeURIComponent(requireString(input.input.testId, "testId"));
  if (input.actionName === "get_test") {
    return {
      test: normalizeSingleResponse(
        await requestPractitest({
          apiKey,
          method: "GET",
          path: `/projects/${projectId}/tests/${testId}.json`,
          query: { relationships: stringifyBoolean(input.input.relationships) },
          fetcher,
          phase: "execute",
        }),
        "test",
      ),
    };
  }
  if (input.actionName === "update_test") {
    return {
      test: normalizeSingleResponse(
        await requestPractitest({
          apiKey,
          method: "PUT",
          path: `/projects/${projectId}/tests/${testId}.json`,
          body: buildTestBody(input.input, false),
          fetcher,
          phase: "execute",
        }),
        "test",
      ),
    };
  }
  if (input.actionName === "delete_test") {
    await requestPractitest({
      apiKey,
      method: "DELETE",
      path: `/projects/${projectId}/tests/${testId}.json`,
      fetcher,
      phase: "execute",
    });
    return { deleted: true, testId: decodeURIComponent(testId) };
  }
  throw new ProviderRequestError(400, `unknown practitest action: ${input.actionName}`);
}

function buildPageQuery(input: Record<string, unknown>) {
  return jsonObject({
    "page[number]": stringifyNumber(input.page),
    "page[size]": stringifyNumber(input.pageSize),
  });
}

function buildTestListQuery(input: Record<string, unknown>) {
  const displayIds = Array.isArray(input.displayIds) ? input.displayIds.join(",") : undefined;
  return jsonObject({
    ...buildPageQuery(input),
    "filter-id": optionalString(input.filterId),
    "autofilter-value": optionalString(input.autoFilterValue),
    "sub-autofilter-value": optionalString(input.subAutoFilterValue),
    "filter-user-id": optionalString(input.filterUserId),
    "display-ids": displayIds,
    name_exact: optionalString(input.nameExact),
    name_like: optionalString(input.nameLike),
    relationships: stringifyBoolean(input.relationships),
  });
}

function buildTestBody(input: Record<string, unknown>, includeSteps: boolean) {
  const attributes = jsonObject({
    name: input.name,
    "author-id": input.authorId,
    description: input.description,
    "test-type": input.testType,
    "assigned-to-id": input.assignedToId,
    "assigned-to-type": input.assignedToType,
    "planned-execution": input.plannedExecution,
    status: input.status,
    version: input.version,
    priority: input.priority,
    "duration-estimate": input.durationEstimate,
    "custom-fields": input.customFields,
    "automated-fields": input.automatedFields,
    tags: input.tags,
  });
  const steps =
    includeSteps && Array.isArray(input.steps)
      ? {
          data: input.steps.map((step) => {
            const value = optionalRecord(step) ?? {};
            return jsonObject({
              name: value.name,
              description: value.description,
              "expected-results": value.expectedResults,
            });
          }),
        }
      : undefined;
  return { data: jsonObject({ type: "tests", attributes, steps }) };
}

async function requestPractitest(options: PractitestRequestOptions): Promise<unknown> {
  const timeout = createProviderTimeout(undefined);
  const url = new URL(`${practitestApiBaseUrl}${options.path}`);
  for (const [name, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
  try {
    const response = await options.fetcher(url, {
      method: options.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        PTToken: options.apiKey,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) throw createPractitestError(response.status, payload, options.phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || (error instanceof DOMException && error.name === "AbortError")) {
      throw new ProviderRequestError(504, "PractiTest request timed out.");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `PractiTest request failed: ${error.message}` : "PractiTest request failed.",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "PractiTest returned invalid JSON.");
  }
}

function normalizeSingleResponse(payload: unknown, resourceName: string) {
  const response = requireObject(payload, `${resourceName} response`);
  return requireObject(response.data, `${resourceName} response data`);
}

function normalizeListResponse(payload: unknown, resourceName: "projects" | "tests") {
  const response = requireObject(payload, `${resourceName} list response`);
  if (!Array.isArray(response.data)) {
    throw new ProviderRequestError(502, `PractiTest ${resourceName} list response is missing data.`);
  }
  const meta = requireObject(response.meta, `${resourceName} pagination metadata`);
  return {
    [resourceName]: response.data,
    pagination: {
      currentPage: requireInteger(meta["current-page"], "current-page"),
      nextPage: optionalInteger(meta["next-page"], "next-page"),
      previousPage: optionalInteger(meta["prev-page"], "prev-page"),
      totalPages: requireInteger(meta["total-pages"], "total-pages"),
      totalCount: requireInteger(meta["total-count"], "total-count"),
    },
  };
}

function createPractitestError(status: number, payload: unknown, phase: PractitestRequestOptions["phase"]) {
  const message = readErrorMessage(payload) ?? `PractiTest request failed with HTTP ${status}.`;
  if (status === 429) return new ProviderRequestError(429, message);
  if (status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  }
  if (status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  }
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message);
}

function readErrorMessage(payload: unknown) {
  if (typeof payload === "string") return payload.trim() || undefined;
  const response = optionalRecord(payload);
  const errors = response?.errors;
  if (Array.isArray(errors)) {
    const first = optionalRecord(errors[0]);
    return optionalString(first?.detail ?? first?.title)?.trim();
  }
  return optionalString(response?.message ?? response?.error)?.trim();
}

function requireObject(value: unknown, description: string) {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `PractiTest ${description} must be an object.`);
  }
  return object;
}

function requireString(value: unknown, fieldName: string) {
  const text = optionalString(value)?.trim();
  if (!text) throw new ProviderRequestError(400, `${fieldName} is required`);
  return text;
}

function requireInteger(value: unknown, fieldName: string) {
  if (!Number.isInteger(value)) {
    throw new ProviderRequestError(502, `PractiTest pagination field ${fieldName} must be an integer.`);
  }
  return value as number;
}

function optionalInteger(value: unknown, fieldName: string) {
  if (value == null) return null;
  return requireInteger(value, fieldName);
}

function stringifyNumber(value: unknown) {
  return typeof value == "number" ? String(value) : undefined;
}

function stringifyBoolean(value: unknown) {
  return typeof value == "boolean" ? String(value) : undefined;
}
