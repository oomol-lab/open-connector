import type { CredentialValidationResult } from "../../core/types.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

interface TaigaCredential {
  apiBaseUrl: string;
  username: string;
  password: string;
}

interface TaigaContext {
  credential: TaigaCredential;
  authToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface TaigaRequestInput {
  credential: TaigaCredential;
  method: "GET" | "POST" | "PATCH";
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  phase: "validate" | "execute" | "proxy";
  signal?: AbortSignal;
}

interface TaigaActionRequest {
  method: "GET" | "POST" | "PATCH";
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  outputKey: string;
}

interface TaigaListResult {
  items: unknown[];
  pagination: { page: number; pageSize: number; pages: number; count: number };
}

type TaigaActionHandler = (input: Record<string, unknown>, context: TaigaContext) => Promise<unknown>;

export const taigaActionHandlers: Record<string, TaigaActionHandler> = {
  list_projects: actionHandler("list_projects"),
  get_project: actionHandler("get_project"),
  create_project: actionHandler("create_project"),
  update_project: actionHandler("update_project"),
  list_user_stories: actionHandler("list_user_stories"),
  get_user_story: actionHandler("get_user_story"),
  create_user_story: actionHandler("create_user_story"),
  update_user_story: actionHandler("update_user_story"),
  list_tasks: actionHandler("list_tasks"),
  get_task: actionHandler("get_task"),
  create_task: actionHandler("create_task"),
  update_task: actionHandler("update_task"),
  list_issues: actionHandler("list_issues"),
  get_issue: actionHandler("get_issue"),
  create_issue: actionHandler("create_issue"),
  update_issue: actionHandler("update_issue"),
};

function actionHandler(actionName: string): TaigaActionHandler {
  return async (input, context) => executeTaigaAction(actionName, input, context);
}

export async function createTaigaContext(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<TaigaContext> {
  const credential = readTaigaCredential(values);
  return {
    credential,
    authToken: await authenticateTaiga(credential, fetcher, "execute", signal),
    fetcher,
    signal,
  };
}

export async function validateTaigaCredential(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const credential = readTaigaCredential(values);
  const authToken = await authenticateTaiga(credential, fetcher, "validate", signal);
  const response = await requestTaigaWithToken({
    credential,
    authToken,
    method: "GET",
    path: "/users/me",
    fetcher,
    phase: "validate",
    signal,
  });
  const profile = requireObject(await readJson(response), "Taiga user profile");
  const id = profile.id;
  const username = optionalString(profile.username);
  const fullName = optionalString(profile.full_name_display);
  if ((typeof id != "number" && typeof id != "string") || !username) {
    throw new ProviderRequestError(502, "Taiga returned an invalid user profile", profile);
  }
  return {
    profile: {
      accountId: `taiga:${new URL(credential.apiBaseUrl).host}:${id}`,
      displayName: fullName || username,
    },
    grantedScopes: [],
    metadata: { apiBaseUrl: credential.apiBaseUrl },
  };
}

export async function applyTaigaProxyAuthorization(
  values: Record<string, string>,
  headers: Headers,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<void> {
  const credential = readTaigaCredential(values);
  const authToken = await authenticateTaiga(credential, fetcher, "proxy", signal);
  headers.set("authorization", `Bearer ${authToken}`);
}

export function normalizeTaigaBaseUrl(value: unknown): string {
  const url = assertPublicHttpUrl(requiredString(value, "baseUrl", providerInputError), {
    fieldName: "baseUrl",
    createError: providerInputError,
    allowPrivateNetwork: isPrivateNetworkAccessAllowed(),
  });
  if (url.protocol != "https:") throw providerInputError("Taiga baseUrl must use HTTPS");
  if (url.username || url.password || url.search || url.hash) {
    throw providerInputError("Taiga baseUrl must not include credentials, a query string, or a fragment");
  }
  let pathname = url.pathname;
  while (pathname.endsWith("/")) pathname = pathname.slice(0, -1);
  url.pathname = pathname.endsWith("/api/v1") ? pathname : `${pathname}/api/v1`;
  return url.toString().replace(/\/$/u, "");
}

function readTaigaCredential(values: Record<string, string>): TaigaCredential {
  return {
    apiBaseUrl: normalizeTaigaBaseUrl(values.baseUrl),
    username: requiredString(values.username, "username", providerInputError),
    password: requiredString(values.password, "password", providerInputError),
  };
}

async function authenticateTaiga(
  credential: TaigaCredential,
  fetcher: typeof fetch,
  phase: TaigaRequestInput["phase"],
  signal?: AbortSignal,
): Promise<string> {
  const response = await requestWithoutToken({
    credential,
    method: "POST",
    path: "/auth",
    body: { type: "normal", username: credential.username, password: credential.password },
    fetcher,
    phase,
    signal,
  });
  const payload = requireObject(await readJson(response), "Taiga authentication response");
  const authToken = optionalString(payload.auth_token);
  if (!authToken) throw new ProviderRequestError(502, "Taiga authentication returned no auth_token", payload);
  return authToken;
}

async function executeTaigaAction(
  actionName: string,
  input: Record<string, unknown>,
  context: TaigaContext,
): Promise<unknown> {
  const action = resolveActionRequest(actionName, input);
  const response = await requestTaigaWithToken({
    ...action,
    credential: context.credential,
    authToken: context.authToken,
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });
  if (action.outputKey == "items") return readListResult(response, input);
  return { [action.outputKey]: requireObject(await readJson(response), `Taiga ${action.outputKey}`) };
}

async function requestTaigaWithToken(input: TaigaRequestInput & { authToken: string }): Promise<Response> {
  return requestWithoutToken(input, input.authToken);
}

async function requestWithoutToken(input: TaigaRequestInput, authToken?: string): Promise<Response> {
  const url = new URL(`${input.credential.apiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value != null) url.searchParams.set(key, String(value));
  }
  const headers = new Headers({
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  });
  if (authToken) headers.set("authorization", `Bearer ${authToken}`);
  const timeout = createProviderTimeout(input.signal);
  try {
    const response = await input.fetcher(url, {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    if (!response.ok) throw createTaigaError(response, input.phase);
    return response;
  } catch (error) {
    if (timeout.didTimeout() && isAbortLikeError(error)) throw new ProviderRequestError(504, "Taiga request timed out");
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Taiga request failed: ${error.message}` : "Taiga request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function resolveActionRequest(actionName: string, input: Record<string, unknown>): TaigaActionRequest {
  const list = actionName.startsWith("list_");
  const resource = actionName.endsWith("projects")
    ? "projects"
    : actionName.endsWith("user_stories")
      ? "userstories"
      : actionName.endsWith("tasks")
        ? "tasks"
        : actionName.endsWith("issues")
          ? "issues"
          : actionName.includes("user_story")
            ? "userstories"
            : actionName.includes("project")
              ? "projects"
              : actionName.includes("task")
                ? "tasks"
                : "issues";
  const outputKey = resource == "userstories" ? "userStory" : resource.slice(0, -1);
  if (list) {
    return { method: "GET", path: `/${resource}`, query: renamePagination(input), outputKey: "items" };
  }
  const idKey = resource == "userstories" ? "userStoryId" : `${resource.slice(0, -1)}Id`;
  const id = input[idKey];
  if (actionName.startsWith("get_")) return { method: "GET", path: `/${resource}/${id}`, outputKey };
  if (actionName.startsWith("create_")) return { method: "POST", path: `/${resource}`, body: input, outputKey };
  return {
    method: "PATCH",
    path: `/${resource}/${id}`,
    body: omitKeys(input, new Set([idKey])),
    outputKey,
  };
}

function renamePagination(input: Record<string, unknown>): Record<string, unknown> {
  const query = omitKeys(input, new Set(["page", "pageSize"]));
  query.page = input.page;
  query.page_size = input.pageSize;
  return query;
}

function omitKeys(input: Record<string, unknown>, keys: Set<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([key]) => !keys.has(key)));
}

async function readListResult(response: Response, input: Record<string, unknown>): Promise<TaigaListResult> {
  const payload = await readJson(response);
  if (!Array.isArray(payload)) throw new ProviderRequestError(502, "Taiga returned an invalid list response", payload);
  const pageSize = headerInteger(response.headers, "x-paginated-by", Number(input.pageSize ?? 30));
  const count = headerInteger(response.headers, "x-pagination-count", payload.length);
  return {
    items: payload,
    pagination: {
      page: headerInteger(response.headers, "x-pagination-current", Number(input.page ?? 1)),
      pageSize,
      pages: pageSize > 0 ? Math.ceil(count / pageSize) : 0,
      count,
    },
  };
}

function headerInteger(headers: Headers, name: string, fallback: number): number {
  const raw = headers.get(name);
  if (raw == null || raw.trim() == "") return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return JSON.parse(await response.text()) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Taiga returned invalid JSON");
  }
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) throw new ProviderRequestError(502, `${label} is invalid`, value);
  return object;
}

function createTaigaError(response: Response, phase: TaigaRequestInput["phase"]): ProviderRequestError {
  const message = `Taiga request failed with status ${response.status}`;
  if (response.status == 400) return new ProviderRequestError(400, message);
  if (response.status == 401 || response.status == 403) {
    return new ProviderRequestError(phase == "validate" ? 400 : response.status, message);
  }
  if (response.status == 404) return new ProviderRequestError(400, message);
  if (response.status == 409 || response.status == 429) return new ProviderRequestError(response.status, message);
  return new ProviderRequestError(502, message);
}
