import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ResolvedCredential,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalIntegerLike,
  optionalRecord,
  optionalString as asOptionalString,
  recordOrEmpty,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const defaultGitlabApiBaseUrl = "https://gitlab.com/api/v4";
const service = "gitlab";

type GitlabRequestPhase = "validate" | "execute";
type GitlabActionInput = Record<string, unknown>;
type GitlabActionHandler = (input: GitlabActionInput, context: GitlabActionContext) => Promise<unknown>;

interface GitlabActionContext {
  accessToken: string;
  tokenType: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface GitlabRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

export const gitlabActionHandlers: ProviderActionHandlers<"gitlab", GitlabActionHandler> = {
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
  get_project_issue(input, context) {
    return gitlabRequestJson(
      `/projects/${readProjectId(input)}/issues/${readRequiredPositiveInteger(input.issueIid, "issueIid")}`,
      context,
    );
  },
  update_project_issue(input, context) {
    return updateGitlabProjectIssue(input, context);
  },
  delete_project_issue(input, context) {
    return deleteGitlabResource(
      `/projects/${readProjectId(input)}/issues/${readRequiredPositiveInteger(input.issueIid, "issueIid")}`,
      context,
    );
  },
  create_project(input, context) {
    return createGitlabProject(input, context);
  },
  update_project(input, context) {
    return updateGitlabProject(input, context);
  },
  delete_project(input, context) {
    return deleteGitlabResource(`/projects/${readProjectId(input)}`, context);
  },
  list_project_merge_requests(input, context) {
    return listGitlabProjectMergeRequests(input, context);
  },
  create_merge_request(input, context) {
    return createGitlabMergeRequest(input, context);
  },
  update_merge_request(input, context) {
    return updateGitlabMergeRequest(input, context);
  },
  merge_merge_request(input, context) {
    return mergeGitlabMergeRequest(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<GitlabActionContext>({
  service,
  handlers: gitlabActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<GitlabActionContext> {
    const credential = await requireGitlabCredential(context);
    return {
      ...resolveGitlabBearerCredential(credential),
      apiBaseUrl: resolveGitlabApiBaseUrl(credential),
      fetcher,
      signal: context.signal,
    };
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    return resolveGitlabApiBaseUrl(await requireGitlabCredential(context));
  },
  auth: { type: "bearer" },
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
    return validateGitlabCredential(input.apiKey, "Bearer", apiBaseUrl, [], guardedFetcher);
  },
  async oauth2(input, { fetcher }) {
    const apiBaseUrl = resolveGitlabApiBaseUrl(input);
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    return validateGitlabCredential(
      input.accessToken,
      input.tokenType,
      apiBaseUrl,
      readGitlabScopes(input.metadata.scope),
      guardedFetcher,
    );
  },
};

async function validateGitlabCredential(
  accessToken: string,
  tokenType: string,
  apiBaseUrl: string,
  grantedScopes: string[],
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const user = await gitlabRequestJson("/user", { accessToken, tokenType, apiBaseUrl, fetcher }, "validate");
  const userObject = recordOrEmpty(user);
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
        : `gitlab:${userId ?? username ?? "user"}`,
      displayName: name ?? username ?? "GitLab User",
    },
    grantedScopes,
    metadata: compactObject({
      apiBaseUrl,
      validationEndpoint: "/user",
      userId,
      username,
      webUrl: asOptionalString(userObject.web_url),
    }),
  };
}

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
    createError: providerInputError,
    allowPrivateNetwork,
  });
  if (url.username || url.password) {
    throw providerInputError("baseUrl must not include credentials");
  }
  url.hash = "";
  url.search = "";
  const path = url.pathname.replace(/\/+$/u, "");
  url.pathname = path.endsWith("/api/v4") ? path : `${path}/api/v4`;
  return url.toString().replace(/\/$/u, "");
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

function updateGitlabProjectIssue(input: GitlabActionInput, context: GitlabActionContext): Promise<unknown> {
  const body = compactObject({
    title: asOptionalString(input.title),
    description: asClearableString(input.description),
    labels: asClearableString(input.labels),
    add_labels: asClearableString(input.addLabels),
    remove_labels: asClearableString(input.removeLabels),
    assignee_ids: Array.isArray(input.assigneeIds) ? input.assigneeIds : undefined,
    confidential: optionalBoolean(input.confidential),
    discussion_locked: optionalBoolean(input.discussionLocked),
    due_date: asOptionalString(input.dueDate),
    state_event: asOptionalString(input.stateEvent),
  });
  ensureUpdateFields(body, "update_project_issue");
  return gitlabRequestJson(
    `/projects/${readProjectId(input)}/issues/${readRequiredPositiveInteger(input.issueIid, "issueIid")}`,
    context,
    "execute",
    { method: "PUT", body },
  );
}

function createGitlabProject(input: GitlabActionInput, context: GitlabActionContext): Promise<unknown> {
  return gitlabRequestJson("/projects", context, "execute", {
    method: "POST",
    body: compactObject({
      name: asOptionalString(input.name),
      path: asOptionalString(input.path),
      namespace_id: optionalIntegerLike(input.namespaceId, "namespaceId"),
      description: asOptionalString(input.description),
      visibility: asOptionalString(input.visibility),
      initialize_with_readme: optionalBoolean(input.initializeWithReadme),
      default_branch: asOptionalString(input.defaultBranch),
    }),
  });
}

function updateGitlabProject(input: GitlabActionInput, context: GitlabActionContext): Promise<unknown> {
  const archived = optionalBoolean(input.archived);
  const body = compactObject({
    name: asOptionalString(input.name),
    path: asOptionalString(input.path),
    description: asClearableString(input.description),
    visibility: asOptionalString(input.visibility),
    default_branch: asOptionalString(input.defaultBranch),
    issues_access_level: asOptionalString(input.issuesAccessLevel),
    merge_requests_access_level: asOptionalString(input.mergeRequestsAccessLevel),
  });
  if (archived !== undefined) {
    if (Object.keys(body).length > 0) {
      throw new ProviderRequestError(400, "archived cannot be combined with other project updates");
    }
    const operation = archived ? "archive" : "unarchive";
    return gitlabRequestJson(`/projects/${readProjectId(input)}/${operation}`, context, "execute", { method: "POST" });
  }
  ensureUpdateFields(body, "update_project");
  return gitlabRequestJson(`/projects/${readProjectId(input)}`, context, "execute", { method: "PUT", body });
}

async function listGitlabProjectMergeRequests(
  input: GitlabActionInput,
  context: GitlabActionContext,
): Promise<{ mergeRequests: unknown[]; total: number | null; nextPage: number | null }> {
  const response = await gitlabRequest(`/projects/${readProjectId(input)}/merge_requests`, context, {
    query: compactObject({
      state: asOptionalString(input.state),
      search: asOptionalString(input.search),
      source_branch: asOptionalString(input.sourceBranch),
      target_branch: asOptionalString(input.targetBranch),
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
    throw new ProviderRequestError(502, "gitlab merge requests response is not an array", payload);
  }
  return { mergeRequests: payload, ...readPagination(response.headers) };
}

function createGitlabMergeRequest(input: GitlabActionInput, context: GitlabActionContext): Promise<unknown> {
  return gitlabRequestJson(`/projects/${readProjectId(input)}/merge_requests`, context, "execute", {
    method: "POST",
    body: compactObject({
      source_branch: asOptionalString(input.sourceBranch),
      target_branch: asOptionalString(input.targetBranch),
      title: asOptionalString(input.title),
      description: asOptionalString(input.description),
      target_project_id: optionalIntegerLike(input.targetProjectId, "targetProjectId"),
      assignee_ids: Array.isArray(input.assigneeIds) ? input.assigneeIds : undefined,
      reviewer_ids: Array.isArray(input.reviewerIds) ? input.reviewerIds : undefined,
      labels: asOptionalString(input.labels),
      remove_source_branch: optionalBoolean(input.removeSourceBranch),
      squash: optionalBoolean(input.squash),
    }),
  });
}

function updateGitlabMergeRequest(input: GitlabActionInput, context: GitlabActionContext): Promise<unknown> {
  const body = compactObject({
    title: asOptionalString(input.title),
    description: asClearableString(input.description),
    target_branch: asOptionalString(input.targetBranch),
    state_event: asOptionalString(input.stateEvent),
    labels: asClearableString(input.labels),
    assignee_ids: Array.isArray(input.assigneeIds) ? input.assigneeIds : undefined,
    reviewer_ids: Array.isArray(input.reviewerIds) ? input.reviewerIds : undefined,
    milestone_id: optionalIntegerLike(input.milestoneId, "milestoneId"),
    remove_source_branch: optionalBoolean(input.removeSourceBranch),
    squash: optionalBoolean(input.squash),
    allow_collaboration: optionalBoolean(input.allowCollaboration),
  });
  ensureUpdateFields(body, "update_merge_request");
  return gitlabRequestJson(
    `/projects/${readProjectId(input)}/merge_requests/${readRequiredPositiveInteger(input.mergeRequestIid, "mergeRequestIid")}`,
    context,
    "execute",
    { method: "PUT", body },
  );
}

function mergeGitlabMergeRequest(input: GitlabActionInput, context: GitlabActionContext): Promise<unknown> {
  return gitlabRequestJson(
    `/projects/${readProjectId(input)}/merge_requests/${readRequiredPositiveInteger(input.mergeRequestIid, "mergeRequestIid")}/merge`,
    context,
    "execute",
    {
      method: "PUT",
      body: compactObject({
        auto_merge: optionalBoolean(input.autoMerge),
        sha: asOptionalString(input.sha),
        should_remove_source_branch: optionalBoolean(input.shouldRemoveSourceBranch),
        squash: optionalBoolean(input.squash),
        merge_commit_message: asOptionalString(input.mergeCommitMessage),
        squash_commit_message: asOptionalString(input.squashCommitMessage),
      }),
    },
  );
}

async function deleteGitlabResource(path: string, context: GitlabActionContext): Promise<{ deleted: boolean }> {
  await gitlabRequestJson(path, context, "execute", { method: "DELETE" });
  return { deleted: true };
}

function ensureUpdateFields(body: Record<string, unknown>, actionName: string): void {
  if (Object.keys(body).length === 0) {
    throw new ProviderRequestError(400, `${actionName} requires at least one field to update`);
  }
}

function asClearableString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
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

  const headers = gitlabHeaders(context.accessToken, context.tokenType, Boolean(options.body));

  try {
    return await context.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `gitlab request failed: ${error.message}` : "gitlab request failed",
    );
  }
}

function gitlabHeaders(accessToken: string, tokenType: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    authorization: `${tokenType} ${accessToken}`,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function requireGitlabCredential(
  context: ExecutionContext,
): Promise<Exclude<ResolvedCredential, { authType: "no_auth" | "custom_credential" }>> {
  const credential = await context.getCredential(service);
  if (credential?.authType === "api_key" || credential?.authType === "oauth2") {
    return credential;
  }
  throw new ProviderRequestError(401, "Configure gitlab OAuth or access token credentials first.");
}

function resolveGitlabBearerCredential(
  credential: Exclude<ResolvedCredential, { authType: "no_auth" | "custom_credential" }>,
): { accessToken: string; tokenType: string } {
  return credential.authType === "oauth2"
    ? { accessToken: credential.accessToken, tokenType: credential.tokenType }
    : { accessToken: credential.apiKey, tokenType: "Bearer" };
}

function resolveGitlabApiBaseUrl(
  credential: Exclude<ResolvedCredential, { authType: "no_auth" | "custom_credential" }>,
): string {
  if (credential.authType === "oauth2") {
    const oauthClientExtra = optionalRecord(credential.metadata.oauthClientExtra);
    return normalizeGitlabApiBaseUrl(oauthClientExtra?.instanceUrl);
  }
  const validatedApiBaseUrl = asOptionalString(credential.metadata.apiBaseUrl);
  if (validatedApiBaseUrl) {
    return normalizeGitlabApiBaseUrl(validatedApiBaseUrl);
  }
  return normalizeGitlabApiBaseUrl(credential.values.baseUrl);
}

function readGitlabScopes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((scope): scope is string => typeof scope === "string" && scope.length > 0);
  }
  return asOptionalString(value)?.split(/\s+/u).filter(Boolean) ?? [];
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
  const record = optionalRecord(payload);
  if (!record) return undefined;
  const message = record.message ?? record.error ?? record.error_description;
  if (typeof message === "string") {
    return message;
  }
  if (Array.isArray(message)) {
    return message.map(String).join(", ");
  }
  const messageRecord = optionalRecord(message);
  if (messageRecord) {
    return Object.entries(messageRecord)
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
  if (
    /^(?:\.|%2e){1,2}$/iu.test(projectId) ||
    projectId.includes("/") ||
    projectId.includes("\\") ||
    projectId.includes("?") ||
    projectId.includes("#")
  ) {
    throw new ProviderRequestError(400, "projectId must be a numeric ID or URL-encoded project path");
  }
  return projectId;
}

function readRequiredPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = asOptionalPositiveInteger(value, fieldName);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function trimOptionalString(value: unknown): string | undefined {
  return asOptionalString(value);
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
