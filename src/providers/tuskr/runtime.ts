import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

export const tuskrApiBaseUrl = "https://api.tuskr.live/api";
const maxResponseBytes = 10 * 1024 * 1024;

export interface TuskrActionContext {
  accessToken: string;
  tenantId: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const tuskrActionHandlers: ProviderActionHandlers<"tuskr", ProviderRuntimeHandler<TuskrActionContext>> = {
  list_projects(input, context) {
    return tuskrGet("/project", buildProjectListQuery(input), context);
  },
  create_project(input, context) {
    return tuskrDataPost("/project", buildCreateProjectData(input), context);
  },
  list_test_cases(input, context) {
    return tuskrGet("/test-case", buildTestCaseListQuery(input), context);
  },
  create_test_case(input, context) {
    return tuskrDataPost("/test-case", buildCreateTestCaseData(input), context);
  },
  list_test_runs(input, context) {
    return tuskrGet("/test-run", buildTestRunListQuery(input), context);
  },
  create_test_run(input, context) {
    if (input.testCaseInclusionType === "SPECIFIC" && !Array.isArray(input.testCases)) {
      throw new ProviderRequestError(400, "testCases is required when testCaseInclusionType is SPECIFIC.");
    }
    return tuskrDataPost("/test-run", buildCreateTestRunData(input), context);
  },
  add_test_run_results(input, context) {
    return tuskrDataPost("/test-run-result/bulk", buildAddResultsData(input), context);
  },
};

export async function validateTuskrCredential(
  input: { apiKey: string; values: Record<string, string> },
  { fetcher, signal }: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const tenantId = resolveTuskrTenantId(input.values.tenantId);
  const context = { accessToken: input.apiKey, tenantId, fetcher, signal };
  await tuskrGet("/project", {}, context, "validate");
  return {
    profile: { accountId: `tuskr:${tenantId}`, displayName: "Tuskr API Token" },
    grantedScopes: [],
    metadata: { apiBaseUrl: tuskrApiBaseUrl, tenantId, validationEndpoint: "/project" },
  };
}

async function tuskrGet(
  path: string,
  query: Record<string, string | number | undefined>,
  context: TuskrActionContext,
  phase: "validate" | "execute" = "execute",
): Promise<unknown> {
  const url = buildTuskrUrl(path, context);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return tuskrRequest(url, { method: "GET" }, context, phase);
}

async function tuskrDataPost(
  path: string,
  data: Record<string, unknown>,
  context: TuskrActionContext,
): Promise<unknown> {
  const payload = await tuskrRequest(
    buildTuskrUrl(path, context),
    {
      method: "POST",
      body: JSON.stringify({ data }),
      headers: { "content-type": "application/json" },
    },
    context,
    "execute",
  );
  return { raw: payload };
}

async function tuskrRequest(
  url: URL,
  init: RequestInit,
  context: TuskrActionContext,
  phase: "validate" | "execute",
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal);
  try {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${context.accessToken}`);
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
    const response = await context.fetcher(url, {
      ...init,
      headers,
      signal: timeout.signal,
    });
    const payload = await readTuskrPayload(response);
    if (!response.ok) throw createTuskrError(response.status, payload, phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Tuskr request timed out");
    }
    throw new ProviderRequestError(
      502,
      `Tuskr request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildProjectListQuery(input: Record<string, unknown>) {
  return compactObject({
    "filter[name]": optionalString(input.name),
    "filter[status]": optionalString(input.status),
    page: optionalInteger(input.page),
  });
}

function buildTestCaseListQuery(input: Record<string, unknown>) {
  return compactObject({
    "filter[project]": optionalString(input.project),
    "filter[testSuite]": optionalString(input.testSuite),
    "filter[testSuiteSection]": optionalString(input.testSuiteSection),
    "filter[key]": optionalString(input.key),
    "filter[testCaseType]": optionalString(input.testCaseType),
    "filter[name]": optionalString(input.name),
    page: optionalInteger(input.page),
    ...flattenCustomFieldFilters(input.customFields),
  });
}

function buildTestRunListQuery(input: Record<string, unknown>) {
  return compactObject({
    "filter[project]": optionalString(input.project),
    "filter[name]": optionalString(input.name),
    "filter[key]": optionalString(input.key),
    "filter[status]": optionalString(input.status),
    "filter[assignedTo]": optionalString(input.assignedTo),
    page: optionalInteger(input.page),
  });
}

function buildCreateProjectData(input: Record<string, unknown>) {
  return compactObject({
    name: optionalString(input.name),
    team: input.team,
    status: optionalString(input.status),
    description: optionalString(input.description),
    externalId: optionalString(input.externalId),
    integrationData: optionalString(input.integrationData),
    issueUrlTemplate: optionalString(input.issueUrlTemplate),
    referenceUrlTemplate: optionalString(input.referenceUrlTemplate),
  });
}

function buildCreateTestCaseData(input: Record<string, unknown>) {
  return compactObject({
    name: optionalString(input.name),
    project: optionalString(input.project),
    testSuite: optionalString(input.testSuite),
    testSuiteSection: optionalString(input.testSuiteSection),
    description: optionalString(input.description),
    testCaseType: optionalString(input.testCaseType),
    estimatedTimeInMinutes: optionalInteger(input.estimatedTimeInMinutes),
    customFields: input.customFields,
  });
}

function buildCreateTestRunData(input: Record<string, unknown>) {
  return compactObject({
    name: optionalString(input.name),
    project: optionalString(input.project),
    testCaseInclusionType: optionalString(input.testCaseInclusionType),
    testCases: Array.isArray(input.testCases) ? input.testCases : undefined,
    description: optionalString(input.description),
    deadline: optionalString(input.deadline),
    assignedTo: optionalString(input.assignedTo),
  });
}

function buildAddResultsData(input: Record<string, unknown>) {
  return compactObject({
    status: optionalString(input.status),
    testRun: optionalString(input.testRun),
    testCases: Array.isArray(input.testCases) ? input.testCases : undefined,
    assignedTo: optionalString(input.assignedTo),
    comments: optionalString(input.comments),
    timeSpentInMinutes: optionalInteger(input.timeSpentInMinutes),
    customFields: input.customFields,
  });
}

function flattenCustomFieldFilters(value: unknown): Record<string, string | number> {
  const record = optionalRecord(value);
  if (!record) return {};
  const output: Record<string, string | number> = {};
  for (const [key, child] of Object.entries(record)) {
    if (typeof child === "string" || typeof child === "number") {
      output[`filter[customFields][${key}]`] = child;
    }
  }
  return output;
}

function buildTuskrUrl(path: string, context: TuskrActionContext): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(`tenant/${encodeURIComponent(context.tenantId)}/${normalizedPath}`, `${tuskrApiBaseUrl}/`);
}

async function readTuskrPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Tuskr response", maxResponseBytes);
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Tuskr returned invalid JSON");
  }
}

function createTuskrError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(record?.errorMessage) ??
    `Tuskr request failed with status ${status}`;
  if ((status === 401 || status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message);
  }
  if (status >= 400 && status < 500) return new ProviderRequestError(status, message);
  return new ProviderRequestError(status || 502, message);
}

export function resolveTuskrTenantId(value: unknown): string {
  const tenantId = optionalString(value);
  if (!tenantId) throw new ProviderRequestError(400, "tenantId is required");
  return tenantId;
}
