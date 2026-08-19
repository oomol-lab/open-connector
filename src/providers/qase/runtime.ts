import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger as asOptionalInteger,
  optionalRecord as asOptionalObject,
  optionalString as asOptionalString,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const qaseApiBaseUrl = "https://api.qase.io/v1";
interface QaseActionInput {
  apiKey: string;
  actionName: string;
  input: Record<string, unknown>;
  signal?: AbortSignal;
}

interface QaseRequestInput {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: "validate" | "execute";
  method?: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}

export const qaseActionHandlers: ProviderActionHandlers<"qase", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  list_projects: handler("list_projects"),
  get_project: handler("get_project"),
  list_cases: handler("list_cases"),
  get_case: handler("get_case"),
  create_case: handler("create_case"),
  list_runs: handler("list_runs"),
  get_run: handler("get_run"),
  create_run: handler("create_run"),
  complete_run: handler("complete_run"),
};

function handler(actionName: string): ProviderRuntimeHandler<ApiKeyProviderContext> {
  return (input, context) =>
    executeQaseAction({ apiKey: context.apiKey, actionName, input, signal: context.signal }, context.fetcher);
}

export async function validateQaseCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  await requestQase({
    apiKey,
    path: "/project",
    query: { limit: "1" },
    fetcher,
    phase: "validate",
    signal,
  });
  return {
    profile: { accountId: `qase:${apiKey.slice(-8)}`, displayName: "Qase API Token" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: qaseApiBaseUrl,
      validationEndpoint: "/project?limit=1",
    },
  };
}

export async function executeQaseAction(input: QaseActionInput, fetcher: typeof fetch): Promise<unknown> {
  const apiKey = input.apiKey;
  const request = (options: Omit<QaseRequestInput, "apiKey" | "fetcher" | "phase">) =>
    requestQase({ apiKey, fetcher, phase: "execute", signal: input.signal, ...options });

  switch (input.actionName) {
    case "list_projects":
      return readPage(await request({ path: "/project", query: paginationQuery(input.input) }), "project list");
    case "get_project":
      return {
        project: readResultObject(
          await request({ path: `/project/${encodeURIComponent(readProjectCode(input.input))}` }),
          "project",
        ),
      };
    case "list_cases": {
      const projectCode = readProjectCode(input.input);
      return readPage(
        await request({
          path: `/case/${encodeURIComponent(projectCode)}`,
          query: compactObject({
            search: asOptionalString(input.input.search),
            suite_id: stringifyInteger(asOptionalInteger(input.input.suiteId)),
            status: asOptionalString(input.input.status),
            priority: asOptionalString(input.input.priority),
            type: asOptionalString(input.input.type),
            ...paginationQuery(input.input),
          }),
        }),
        "test case list",
      );
    }
    case "get_case": {
      const projectCode = readProjectCode(input.input);
      const caseId = readRequiredInteger(input.input.caseId, "caseId");
      return {
        testCase: readResultObject(
          await request({ path: `/case/${encodeURIComponent(projectCode)}/${caseId}` }),
          "test case",
        ),
      };
    }
    case "create_case": {
      const projectCode = readProjectCode(input.input);
      const payload = await request({
        path: `/case/${encodeURIComponent(projectCode)}`,
        method: "POST",
        body: compactObject({
          title: readRequiredString(input.input.title, "title"),
          description: asOptionalString(input.input.description),
          preconditions: asOptionalString(input.input.preconditions),
          postconditions: asOptionalString(input.input.postconditions),
          suite_id: asOptionalInteger(input.input.suiteId),
          isManual: optionalBoolean(input.input.isManual),
          isToBeAutomated: optionalBoolean(input.input.isToBeAutomated),
          tags: input.input.tags,
        }),
      });
      return { caseId: readResultId(payload, "test case") };
    }
    case "list_runs": {
      const projectCode = readProjectCode(input.input);
      return readPage(
        await request({
          path: `/run/${encodeURIComponent(projectCode)}`,
          query: compactObject({
            search: asOptionalString(input.input.search),
            status: asOptionalString(input.input.status),
            ...paginationQuery(input.input),
          }),
        }),
        "test run list",
      );
    }
    case "get_run": {
      const projectCode = readProjectCode(input.input);
      const runId = readRequiredInteger(input.input.runId, "runId");
      return {
        run: readResultObject(await request({ path: `/run/${encodeURIComponent(projectCode)}/${runId}` }), "test run"),
      };
    }
    case "create_run": {
      const projectCode = readProjectCode(input.input);
      const payload = await request({
        path: `/run/${encodeURIComponent(projectCode)}`,
        method: "POST",
        body: compactObject({
          title: readRequiredString(input.input.title, "title"),
          description: asOptionalString(input.input.description),
          include_all_cases: optionalBoolean(input.input.includeAllCases),
          cases: input.input.caseIds,
          environment_id: asOptionalInteger(input.input.environmentId),
          milestone_id: asOptionalInteger(input.input.milestoneId),
          plan_id: asOptionalInteger(input.input.planId),
          tags: input.input.tags,
        }),
      });
      return { runId: readResultId(payload, "test run") };
    }
    case "complete_run": {
      const projectCode = readProjectCode(input.input);
      const runId = readRequiredInteger(input.input.runId, "runId");
      await request({
        path: `/run/${encodeURIComponent(projectCode)}/${runId}/complete`,
        method: "POST",
      });
      return { completed: true };
    }
  }
}

async function requestQase(input: QaseRequestInput) {
  const url = new URL(`${qaseApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  try {
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        token: input.apiKey,
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) throw createQaseError(response, payload, input.phase);
    const record = asOptionalObject(payload);
    if (record?.status === false) throw createQaseError(response, payload, input.phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Qase request failed: ${error.message}` : "Qase request failed",
    );
  }
}

async function readPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    if (!response.ok) return null;
    throw invalidPayload("response did not include JSON");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) return null;
    throw invalidPayload("response was not valid JSON");
  }
}

function createQaseError(response: Response, payload: unknown, phase: "validate" | "execute") {
  const record = asOptionalObject(payload);
  const message =
    asOptionalString(record?.message) ??
    asOptionalString(record?.error) ??
    `Qase request failed with status ${response.status}`;
  if (response.status === 429) return new ProviderRequestError(429, message);
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (400 <= response.status && response.status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function readPage(payload: unknown, entity: string) {
  const result = readResultObject(payload, entity);
  if (!Array.isArray(result.entities)) throw invalidPayload(`${entity} response omitted entities`);
  return {
    total: readRequiredInteger(result.total, "total"),
    filtered: readRequiredInteger(result.filtered, "filtered"),
    count: readRequiredInteger(result.count, "count"),
    entities: result.entities,
  };
}

function readResultObject(payload: unknown, entity: string) {
  const result = asOptionalObject(asOptionalObject(payload)?.result);
  if (!result) throw invalidPayload(`${entity} response omitted result`);
  return result;
}

function readResultId(payload: unknown, entity: string) {
  return readRequiredInteger(readResultObject(payload, entity).id, "id");
}

function paginationQuery(input: Record<string, unknown>) {
  return compactObject({
    limit: stringifyInteger(asOptionalInteger(input.limit)),
    offset: stringifyInteger(asOptionalInteger(input.offset)),
  });
}

function readProjectCode(input: Record<string, unknown>) {
  return readRequiredString(input.projectCode, "projectCode");
}

function readRequiredString(value: unknown, field: string) {
  const result = asOptionalString(value);
  if (!result) throw new ProviderRequestError(400, `Qase requires ${field}`);
  return result;
}

function readRequiredInteger(value: unknown, field: string) {
  const result = asOptionalInteger(value);
  if (result === undefined) throw new ProviderRequestError(400, `Qase requires ${field}`);
  return result;
}

function stringifyInteger(value: number | undefined) {
  return value === undefined ? undefined : String(value);
}

function invalidPayload(message: string) {
  return new ProviderRequestError(502, `Invalid Qase response: ${message}`);
}
