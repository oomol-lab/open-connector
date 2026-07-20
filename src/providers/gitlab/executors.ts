import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalIntegerLike,
  optionalString as asOptionalString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const defaultGitlabApiBaseUrl = "https://gitlab.com/api/v4";
const service = "gitlab";

type GitlabRequestPhase = "validate" | "execute";
type GitlabActionInput = Record<string, unknown>;
type GitlabActionHandler = (input: GitlabActionInput, context: GitlabActionContext) => Promise<unknown>;

interface GitlabActionContext extends ApiKeyProviderContext {
  apiBaseUrl: string;
}

interface GitlabRequestOptions {
  method?: "GET" | "POST";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

export const gitlabActionHandlers: Record<string, GitlabActionHandler> = {
  get_current_user(_input, context) {
    return gitlabRequestJson("/user", context);
  },
  list_projects(input, context) {
    return listGitlabProjects(input, context);
  },
  get_project(input, context) {
    const projectId = readProjectId(input);
    return gitlabRequestJson(`/projects/${projectId}`, context);
  },
  list_project_issues(input, context) {
    return listGitlabProjectIssues(input, context);
  },
  create_project_issue(input, context) {
    return createGitlabProjectIssue(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<GitlabActionContext>({
  service,
  handlers: gitlabActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<GitlabActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    const providerContext: GitlabActionContext = {
      apiKey: credential.apiKey,
      apiBaseUrl: normalizeGitlabApiBaseUrl(credential.values.baseUrl),
      fetcher,
      signal: context.signal,
    };
    if (context.transitFiles) {
      providerContext.transitFiles = context.transitFiles;
    }
    return providerContext;
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    const value = asOptionalString(credential.metadata.apiBaseUrl) ?? asOptionalString(credential.values.baseUrl);
    return normalizeGitlabApiBaseUrl(value);
  },
  auth: { type: "api_key_header", name: "private-token" },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const apiBaseUrl = normalizeGitlabApiBaseUrl(input.values.baseUrl);
    // Re-guard the shared validator fetcher with GitLab's private-network
    // opt-in so validating a self-hosted instance on a private network works
    // when the deployment allows it (createProviderFetch unwraps an
    // already-guarded fetcher).
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    const user = await gitlabRequestJson(
      "/user",
      { apiKey: input.apiKey, apiBaseUrl, fetcher: guardedFetcher },
      "validate",
    );
    const userObject = asGitlabObject(user);
    const userId = readOptionalPrimitive(userObject.id);
    const username = asOptionalString(userObject.username);
    const name = asOptionalString(userObject.name);
    // Scope the account id by instance host for self-hosted connections so the
    // same numeric user id on different instances never collides.
    const instanceHost = apiBaseUrl === defaultGitlabApiBaseUrl ? undefined : new URL(apiBaseUrl).host;

    return {
      profile: {
        accountId: instanceHost
          ? `gitlab:${instanceHost}:${userId ?? username ?? "user"}`
          : userId
            ? `gitlab:${userId}`
            : (username ?? "gitlab:user"),
        displayName: name ?? username ?? "GitLab User",
      },
      metadata: compactObject({
        apiBaseUrl,
        validationEndpoint: "/user",
        userId,
        username,
        webUrl: asOptionalString(userObject.web_url),
      }),
    };
  },
};

/**
 * Resolves the GitLab API base URL for a connection. Empty input targets
 * GitLab.com; otherwise the self-hosted instance URL is validated, embedded
 * credentials are rejected, query/hash components are removed, and the path
 * is ensured to end in `/api/v4`. Private/overlay targets (RFC 1918,
 * Tailscale, NetBird, private hostnames) are only accepted when the
 * deployment opts in through `OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK`;
 * `allowPrivateNetwork` may be passed explicitly (used by tests).
 */
export function normalizeGitlabApiBaseUrl(
  value: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const instanceUrl = trimOptionalString(value);
  if (!instanceUrl) {
    return defaultGitlabApiBaseUrl;
  }
  const url = assertPublicHttpUrl(instanceUrl, {
    fieldName: "baseUrl",
    createError: credentialError,
    allowPrivateNetwork,
  });
  if (url.username || url.password) {
    throw credentialError("baseUrl must not include credentials");
  }
  url.hash = "";
  url.search = "";
  const path = url.pathname.replace(/\/+$/u, "");
  url.pathname = path.endsWith("/api/v4") ? path : `${path}/api/v4`;
  return url.toString().replace(/\/$/u, "");
}

function credentialError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

async function listGitlabProjects(
  input: GitlabActionInput,
  context: GitlabActionContext,
): Promise<{
  projects: unknown[];
  total: number | null;
  nextPage: number | null;
}> {
  const response = await gitlabRequest("/projects", context, {
    query: compactObject({
      search: trimOptionalString(input.search),
      membership: optionalBoolean(input.membership),
      owned: optionalBoolean(input.owned),
      simple: optionalBoolean(input.simple),
      order_by: asOptionalString(input.orderBy),
      sort: asOptionalString(input.sort),
      page: asOptionalPositiveInteger(input.page, "page"),
      per_page: asOptionalPositiveInteger(input.perPage, "perPage"),
    }),
  });

  const payload = await readGitlabPayload(response);
  if (!response.ok) {
    throw createGitlabError(response, payload, "execute");
  }
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "gitlab projects response is not an array", payload);
  }

  return {
    projects: payload,
    ...readPagination(response.headers),
  };
}

async function listGitlabProjectIssues(
  input: GitlabActionInput,
  context: GitlabActionContext,
): Promise<{
  issues: unknown[];
  total: number | null;
  nextPage: number | null;
}> {
  const projectId = readProjectId(input);
  const response = await gitlabRequest(`/projects/${projectId}/issues`, context, {
    query: compactObject({
      state: asOptionalString(input.state),
      labels: trimOptionalString(input.labels),
      assignee_id: asOptionalPositiveInteger(input.assigneeId, "assigneeId"),
      search: trimOptionalString(input.search),
      order_by: asOptionalString(input.orderBy),
      sort: asOptionalString(input.sort),
      page: asOptionalPositiveInteger(input.page, "page"),
      per_page: asOptionalPositiveInteger(input.perPage, "perPage"),
    }),
  });

  const payload = await readGitlabPayload(response);
  if (!response.ok) {
    throw createGitlabError(response, payload, "execute");
  }
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "gitlab issues response is not an array", payload);
  }

  return {
    issues: payload,
    ...readPagination(response.headers),
  };
}

function createGitlabProjectIssue(input: GitlabActionInput, context: GitlabActionContext): Promise<unknown> {
  const projectId = readProjectId(input);
  return gitlabRequestJson(`/projects/${projectId}/issues`, context, "execute", {
    method: "POST",
    body: compactObject({
      title: asOptionalString(input.title),
      description: asOptionalString(input.description),
      labels: trimOptionalString(input.labels),
      assignee_ids: Array.isArray(input.assigneeIds) ? input.assigneeIds : undefined,
      confidential: optionalBoolean(input.confidential),
      due_date: asOptionalString(input.dueDate),
    }),
  });
}

async function gitlabRequestJson(
  path: string,
  context: GitlabActionContext,
  phase: GitlabRequestPhase = "execute",
  options: GitlabRequestOptions = {},
): Promise<unknown> {
  const response = await gitlabRequest(path, context, options);
  const payload = await readGitlabPayload(response);
  if (!response.ok) {
    throw createGitlabError(response, payload, phase);
  }
  return payload;
}

async function gitlabRequest(
  path: string,
  context: GitlabActionContext,
  options: GitlabRequestOptions = {},
): Promise<Response> {
  const url = new URL(`${context.apiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = gitlabHeaders(context.apiKey, Boolean(options.body));

  try {
    return await context.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `gitlab request failed: ${error.message}` : "gitlab request failed",
    );
  }
}

function gitlabHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "PRIVATE-TOKEN": apiKey,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readGitlabPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createGitlabError(response: Response, payload: unknown, phase: GitlabRequestPhase): ProviderRequestError {
  const message = extractGitlabErrorMessage(payload) ?? response.statusText ?? "gitlab request failed";
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(
      phase === "validate" ? 400 : response.status,
      `gitlab authentication failed: ${message}`,
      payload,
    );
  }

  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status, `gitlab request failed: ${message}`, payload);
  }

  return new ProviderRequestError(response.status || 502, `gitlab request failed: ${message}`, payload);
}

function extractGitlabErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload;
  }
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const message = record.message ?? record.error ?? record.error_description;
  if (typeof message === "string") {
    return message;
  }
  if (Array.isArray(message)) {
    return message.map(String).join(", ");
  }
  if (message && typeof message === "object") {
    return Object.entries(message as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
      .join("; ");
  }
  return undefined;
}

function readProjectId(input: GitlabActionInput): string {
  const projectId = trimOptionalString(input.projectId);
  if (!projectId) {
    throw new ProviderRequestError(400, "projectId is required");
  }
  return projectId;
}

function trimOptionalString(value: unknown): string | undefined {
  const text = asOptionalString(value)?.trim();
  return text || undefined;
}

function readOptionalPrimitive(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function asGitlabObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readPagination(headers: Headers): {
  total: number | null;
  nextPage: number | null;
} {
  return {
    total: readOptionalHeaderInteger(headers, "x-total"),
    nextPage: readOptionalHeaderInteger(headers, "x-next-page"),
  };
}

function readOptionalHeaderInteger(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function asOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  const parsed = optionalIntegerLike(value, fieldName, (message) => new ProviderRequestError(400, message));
  if (parsed === undefined) {
    return undefined;
  }
  if (parsed < 1) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}
