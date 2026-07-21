import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { JiraActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger as asOptionalInteger,
  optionalRecord as asOptionalObject,
  optionalString as asOptionalString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  ProviderRequestError,
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
} from "../provider-runtime.ts";

type JiraAccessibleResource = {
  id?: unknown;
  name?: unknown;
  url?: unknown;
  scopes?: unknown;
  avatarUrl?: unknown;
};

type JiraCurrentUserPayload = {
  accountId?: unknown;
  accountType?: unknown;
  // Jira Server/Data Center /myself returns key/name instead of a Cloud accountId.
  key?: unknown;
  name?: unknown;
  displayName?: unknown;
  emailAddress?: unknown;
  active?: unknown;
  self?: unknown;
  timeZone?: unknown;
};

type JiraActionContext = {
  accessToken: string;
  fetcher: typeof fetch;
  providerMetadata?: Record<string, unknown>;
  deployment: "cloud" | "server";
};

type JiraActionHandler = (input: Record<string, unknown>, context: JiraActionContext) => Promise<unknown>;

type JiraRequestInput = {
  accessToken: string;
  fetcher: typeof fetch;
  providerMetadata?: Record<string, unknown>;
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
};

const jiraApiOrigin = "https://api.atlassian.com";
const jiraAccessibleResourcesUrl = "https://api.atlassian.com/oauth/token/accessible-resources";
const jiraCurrentUserPath = "/myself";

const defaultIssueFieldIds = [
  "summary",
  "description",
  "status",
  "issuetype",
  "project",
  "assignee",
  "reporter",
  "priority",
  "labels",
  "created",
  "updated",
  "duedate",
];

export const jiraActionHandlers: Record<JiraActionName, JiraActionHandler> = {
  list_projects(input, context) {
    return listProjects(input, context);
  },
  get_project(input, context) {
    return getProject(input, context);
  },
  search_issues(input, context) {
    return searchIssues(input, context);
  },
  get_issue(input, context) {
    return getIssue(input, context);
  },
  create_issue(input, context) {
    return createIssue(input, context);
  },
  list_issue_comments(input, context) {
    return listIssueComments(input, context);
  },
  add_comment(input, context) {
    return addComment(input, context);
  },
};

async function fetchJiraCurrentAccount(
  accessToken: string,
  fetcher: typeof fetch,
): Promise<{
  profile: {
    accountId: string;
    displayName: string;
  };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const accessibleResourcesResponse = await fetcher(jiraAccessibleResourcesUrl, {
    headers: buildAuthorizationHeaders(accessToken),
  });
  const accessibleResourcesPayload = await readJsonValue(accessibleResourcesResponse);
  if (!accessibleResourcesResponse.ok) {
    throw mapJiraResponseError(accessibleResourcesResponse.status, accessibleResourcesPayload, "auth", false);
  }

  const resources = readAccessibleResources(accessibleResourcesPayload);
  const primaryResource = pickPrimaryResource(resources);
  if (!primaryResource) {
    throw new ProviderRequestError(400, "jira authorization does not include an accessible Jira Cloud site");
  }

  const cloudId = requireNonEmptyString(primaryResource.id, "jira cloudId");
  const siteUrl = requireNonEmptyString(primaryResource.url, "jira site URL");
  const siteName = asOptionalString(primaryResource.name) ?? siteUrl;
  const siteAvatarUrl = asOptionalString(primaryResource.avatarUrl);
  const resourceScopes = readScopeArray(primaryResource.scopes);

  const currentUser = await jiraJsonRequest<JiraCurrentUserPayload>({
    accessToken,
    fetcher,
    providerMetadata: { cloudId },
    path: jiraCurrentUserPath,
  });

  const accountId = requireNonEmptyString(currentUser.accountId, "jira accountId");
  const displayName = asOptionalString(currentUser.displayName);
  const emailAddress = asOptionalString(currentUser.emailAddress);
  const accountLabel = displayName ?? emailAddress ?? accountId;

  return {
    profile: {
      accountId: `jira:${cloudId}:${accountId}`,
      displayName: `${accountLabel} (${siteName})`,
    },
    grantedScopes: mapJiraGrantedScopes(resourceScopes),
    metadata: compactObject({
      cloudId,
      siteUrl,
      siteName,
      siteAvatarUrl,
      resourceScopes,
      resourceCount: resources.length,
      apiBaseUrl: buildJiraApiBaseUrl(cloudId),
      validationEndpoint: jiraCurrentUserPath,
      accountId,
      displayName,
      emailAddress,
      accountType: asOptionalString(currentUser.accountType),
      active: optionalBoolean(currentUser.active),
      timeZone: asOptionalString(currentUser.timeZone),
    }),
  };
}

async function fetchJiraServerCurrentAccount(
  accessToken: string,
  apiBaseUrl: string,
  fetcher: typeof fetch,
): Promise<{
  profile: {
    accountId: string;
    displayName: string;
  };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const currentUser = await jiraJsonRequest<JiraCurrentUserPayload>({
    accessToken,
    fetcher,
    providerMetadata: { apiBaseUrl },
    path: jiraCurrentUserPath,
  });
  const accountKey =
    asOptionalString(currentUser.accountId) ?? asOptionalString(currentUser.key) ?? asOptionalString(currentUser.name);
  if (!accountKey) {
    throw new ProviderRequestError(502, "jira current user response is missing an account identifier");
  }

  const displayName =
    asOptionalString(currentUser.displayName) ?? asOptionalString(currentUser.emailAddress) ?? accountKey;
  return {
    profile: {
      accountId: `jira:${new URL(apiBaseUrl).host}:${accountKey}`,
      displayName,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl,
      validationEndpoint: jiraCurrentUserPath,
      accountId: accountKey,
      displayName: asOptionalString(currentUser.displayName),
      emailAddress: asOptionalString(currentUser.emailAddress),
      timeZone: asOptionalString(currentUser.timeZone),
    }),
  };
}

function mapJiraGrantedScopes(providerScopes: string[]): string[] {
  const scopes: string[] = [];

  if (providerScopes.includes("write:jira-work")) {
    scopes.push("read:jira-work", "read:jira-user", "write:jira-work");
    return scopes;
  }

  if (providerScopes.includes("read:jira-work")) {
    scopes.push("read:jira-work", "read:jira-user");
  }

  return scopes;
}

export const executors: ProviderExecutors = defineProviderExecutors<JiraActionContext>({
  service: "jira",
  handlers: jiraActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<JiraActionContext> {
    const credential = await context.getCredential("jira");
    if (credential?.authType === "oauth2") {
      return {
        accessToken: credential.accessToken,
        fetcher,
        providerMetadata: credential.metadata,
        deployment: "cloud",
      };
    }
    if (credential?.authType === "custom_credential") {
      return {
        accessToken: requirePersonalAccessToken(credential.values),
        fetcher,
        providerMetadata: {
          ...credential.metadata,
          apiBaseUrl: resolveJiraServerApiBaseUrl(credential.values, credential.metadata),
        },
        deployment: "server",
      };
    }
    throw new ProviderRequestError(401, "Configure Jira OAuth or Data Center personal access token credentials first.");
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "jira",
  baseUrl: async (context) => {
    const credential = await context.getCredential("jira");
    if (credential?.authType === "oauth2") {
      return resolveJiraApiBaseUrl(credential.metadata);
    }
    if (credential?.authType === "custom_credential") {
      return resolveJiraServerApiBaseUrl(credential.values, credential.metadata);
    }
    throw new ProviderRequestError(401, "Configure Jira OAuth or Data Center personal access token credentials first.");
  },
  auth: { type: "none" },
  async customizeRequest({ context, headers }) {
    const credential = await context.getCredential("jira");
    if (credential?.authType === "oauth2") {
      headers.set("authorization", `${credential.tokenType} ${credential.accessToken}`);
      return;
    }
    if (credential?.authType === "custom_credential") {
      headers.set("authorization", `Bearer ${requirePersonalAccessToken(credential.values)}`);
      return;
    }
    throw new ProviderRequestError(401, "Configure Jira OAuth or Data Center personal access token credentials first.");
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }) {
    return fetchJiraCurrentAccount(input.accessToken, fetcher);
  },
  async customCredential(input, { fetcher }) {
    const apiBaseUrl = normalizeJiraServerApiBaseUrl(input.values.baseUrl);
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return fetchJiraServerCurrentAccount(requirePersonalAccessToken(input.values), apiBaseUrl, guardedFetcher);
  },
};

async function listProjects(input: Record<string, unknown>, context: JiraActionContext) {
  const limit = asOptionalInteger(input.limit) ?? 50;
  const startAt = parseNumericCursor(input.cursor);
  const expand = joinOptionalList(readStringArray(input.expand));

  if (context.deployment === "server") {
    // Jira Data Center has no paginated /project/search, so we fetch the full /project list and
    // page in memory. Each page re-fetches rather than caching: the stateless runtime exposes no
    // per-context cache, and a credential-keyed module cache would trade this for staleness and
    // unbounded per-instance memory — not worth it for typical DC project counts.
    const payload = await jiraJsonValueRequest({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      providerMetadata: context.providerMetadata,
      path: "/project",
      query: compactQuery({ expand }),
    });
    const projects = readRecordArray(payload).map((project) => normalizeProject(project));
    const page = projects.slice(startAt, startAt + limit);
    return {
      projects: page,
      pagination: {
        nextCursor: startAt + page.length < projects.length ? String(startAt + page.length) : null,
      },
    };
  }

  const payload = await jiraJsonRequest<Record<string, unknown>>({
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    providerMetadata: context.providerMetadata,
    path: "/project/search",
    query: compactQuery({
      maxResults: String(limit),
      startAt: String(startAt),
      expand,
    }),
  });

  const values = readRecordArray(payload.values).map((project) => normalizeProject(project));
  const total = asOptionalInteger(payload.total);

  return {
    projects: values,
    pagination: {
      nextCursor: resolveNumericNextCursor(startAt, values.length, total, optionalBoolean(payload.isLast)),
    },
  };
}

async function getProject(input: Record<string, unknown>, context: JiraActionContext) {
  const projectIdOrKey = requireString(input.projectIdOrKey, "projectIdOrKey");
  const expand = joinOptionalList(readStringArray(input.expand));

  const payload = await jiraJsonRequest<Record<string, unknown>>({
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    providerMetadata: context.providerMetadata,
    path: `/project/${encodeURIComponent(projectIdOrKey)}`,
    query: compactQuery({ expand }),
    notFoundAsInvalidInput: true,
  });

  return {
    project: normalizeProject(payload),
  };
}

async function searchIssues(input: Record<string, unknown>, context: JiraActionContext) {
  const isServer = context.deployment === "server";
  const payload = await jiraJsonRequest<Record<string, unknown>>({
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    providerMetadata: context.providerMetadata,
    path: isServer ? "/search" : "/search/jql",
    method: "POST",
    body: compactObject({
      jql: requireString(input.jql, "jql"),
      maxResults: asOptionalInteger(input.limit) ?? 50,
      fields: mergeUniqueFieldIds(defaultIssueFieldIds, readStringArray(input.includeFields)),
      // Jira Server/DC POST /rest/api/2/search binds a SearchRequestBean whose `expand` is a
      // List<String>; the Cloud enhanced POST /rest/api/3/search/jql takes it as a comma string.
      ...(isServer
        ? { startAt: parseNumericCursor(input.cursor), expand: optionalStringList(readStringArray(input.expand)) }
        : { nextPageToken: asOptionalString(input.cursor), expand: joinOptionalList(readStringArray(input.expand)) }),
    }),
  });

  return {
    issues: readRecordArray(payload.issues).map((issue) => normalizeIssue(issue)),
    pagination: {
      nextCursor: isServer
        ? resolveNumericNextCursor(
            parseNumericCursor(input.cursor),
            readRecordArray(payload.issues).length,
            asOptionalInteger(payload.total),
          )
        : (asOptionalString(payload.nextPageToken) ?? null),
    },
  };
}

async function getIssue(input: Record<string, unknown>, context: JiraActionContext) {
  const issueIdOrKey = requireString(input.issueIdOrKey, "issueIdOrKey");

  const payload = await jiraJsonRequest<Record<string, unknown>>({
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    providerMetadata: context.providerMetadata,
    path: `/issue/${encodeURIComponent(issueIdOrKey)}`,
    query: compactQuery({
      fields: joinOptionalList(mergeUniqueFieldIds(defaultIssueFieldIds, readStringArray(input.includeFields))),
      expand: joinOptionalList(readStringArray(input.expand)),
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    issue: normalizeIssue(payload),
  };
}

async function createIssue(input: Record<string, unknown>, context: JiraActionContext) {
  const createPayload = await jiraJsonRequest<Record<string, unknown>>({
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    providerMetadata: context.providerMetadata,
    path: "/issue",
    method: "POST",
    body: {
      fields: buildCreateIssueFields(input, context.deployment),
    },
  });

  const createdIssueIdOrKey =
    asOptionalString(createPayload.key) ??
    asOptionalString(createPayload.id) ??
    requireNonEmptyString(createPayload.self, "jira created issue self");

  const issueLookupPath = isAbsoluteUrl(createdIssueIdOrKey)
    ? createdIssueIdOrKey
    : `/issue/${encodeURIComponent(createdIssueIdOrKey)}`;

  const issuePayload = await jiraJsonRequest<Record<string, unknown>>({
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    providerMetadata: context.providerMetadata,
    path: issueLookupPath,
    query: {
      fields: joinOptionalList(defaultIssueFieldIds),
    },
  });

  return {
    issue: normalizeIssue(issuePayload),
  };
}

async function listIssueComments(input: Record<string, unknown>, context: JiraActionContext) {
  const issueIdOrKey = requireString(input.issueIdOrKey, "issueIdOrKey");
  const limit = asOptionalInteger(input.limit) ?? 50;
  const startAt = parseNumericCursor(input.cursor);

  const payload = await jiraJsonRequest<Record<string, unknown>>({
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    providerMetadata: context.providerMetadata,
    path: `/issue/${encodeURIComponent(issueIdOrKey)}/comment`,
    query: compactQuery({
      maxResults: String(limit),
      startAt: String(startAt),
      expand: joinOptionalList(readStringArray(input.expand)),
    }),
    notFoundAsInvalidInput: true,
  });

  const comments = readRecordArray(payload.comments).map((comment) => normalizeComment(comment));
  const total = asOptionalInteger(payload.total);

  return {
    comments,
    pagination: {
      nextCursor: resolveNumericNextCursor(startAt, comments.length, total),
    },
  };
}

async function addComment(input: Record<string, unknown>, context: JiraActionContext) {
  const issueIdOrKey = requireString(input.issueIdOrKey, "issueIdOrKey");
  const rawBody = input.body;
  const textBody = asOptionalString(input.bodyText);

  const payload = await jiraJsonRequest<Record<string, unknown>>({
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    providerMetadata: context.providerMetadata,
    path: `/issue/${encodeURIComponent(issueIdOrKey)}/comment`,
    method: "POST",
    body: {
      body: buildCommentBody(rawBody, textBody, context.deployment),
    },
    notFoundAsInvalidInput: true,
  });

  return {
    comment: normalizeComment(payload),
  };
}

function buildCommentBody(rawBody: unknown, textBody: string | undefined, deployment: JiraActionContext["deployment"]) {
  if (deployment === "server") {
    const text = rawBody !== undefined ? adfToPlainText(normalizeLooseRecord(rawBody, "body")) : (textBody ?? "");
    if (!text) {
      throw new ProviderRequestError(400, "comment body or bodyText is required");
    }
    return text;
  }
  return rawBody !== undefined ? normalizeLooseRecord(rawBody, "body") : textToAdfDocument(textBody ?? "");
}

async function jiraJsonRequest<T>(input: JiraRequestInput) {
  return readJsonObject<T>(await jiraJsonValueRequest(input), "jira response payload");
}

async function jiraJsonValueRequest(input: JiraRequestInput): Promise<unknown> {
  const response = await jiraRequest(input);
  return readJsonValue(response);
}

async function jiraRequest(input: JiraRequestInput) {
  const url = buildJiraUrl(input.providerMetadata, input.path, input.query);
  const method = input.method ?? (input.body ? "POST" : "GET");
  const headers: Record<string, string> = {
    ...buildAuthorizationHeaders(input.accessToken),
  };

  if (input.body) {
    headers["content-type"] = "application/json";
  }

  const response = await input.fetcher(url, {
    method,
    headers,
    ...(input.body ? { body: JSON.stringify(input.body) } : {}),
  });

  if (!response.ok) {
    const payload = await readJsonValue(response);
    throw mapJiraResponseError(response.status, payload, "execute", Boolean(input.notFoundAsInvalidInput));
  }

  return response;
}

function buildAuthorizationHeaders(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
}

function buildJiraUrl(
  providerMetadata: Record<string, unknown> | undefined,
  pathOrUrl: string,
  query?: Record<string, string | undefined>,
) {
  const apiBaseUrl = resolveJiraApiBaseUrl(providerMetadata);
  const target = isAbsoluteUrl(pathOrUrl) ? new URL(pathOrUrl) : new URL(trimLeadingSlash(pathOrUrl), `${apiBaseUrl}/`);
  const apiBase = new URL(apiBaseUrl);

  if (target.origin !== apiBase.origin || !target.pathname.startsWith(`${apiBase.pathname}/`)) {
    throw new ProviderRequestError(400, `jira requests must target ${apiBaseUrl}`);
  }

  for (const [key, value] of Object.entries(query ?? {})) {
    if (!value) {
      continue;
    }
    target.searchParams.set(key, value);
  }

  return target.toString();
}

function resolveJiraApiBaseUrl(providerMetadata: Record<string, unknown> | undefined) {
  const apiBaseUrl = asOptionalString(providerMetadata?.apiBaseUrl);
  if (apiBaseUrl) {
    return apiBaseUrl;
  }
  const cloudId = asOptionalString(providerMetadata?.cloudId);
  if (!cloudId) {
    throw new ProviderRequestError(502, "jira provider metadata is missing cloudId");
  }
  return buildJiraApiBaseUrl(cloudId);
}

function buildJiraApiBaseUrl(cloudId: string) {
  return `${jiraApiOrigin}/ex/jira/${encodeURIComponent(cloudId)}/rest/api/3`;
}

/**
 * Normalize a user-supplied Jira Data Center / Server instance URL into its REST API v2 base.
 *
 * Enforces the provider's egress contract: the URL must be a public http(s) target
 * ({@link assertPublicHttpUrl}; private networks only when `allowPrivateNetwork` is set, and
 * loopback/reserved/cloud-metadata stay blocked), must not embed credentials, and has its query
 * and fragment stripped. A trailing `/rest/api/{2,3,latest}` is normalized to the `/rest/api/2`
 * suffix this provider speaks, so a pasted API URL is not double-appended.
 */
export function normalizeJiraServerApiBaseUrl(
  value: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const instanceUrl = asOptionalString(value);
  if (!instanceUrl) {
    throw new ProviderRequestError(400, "baseUrl is required");
  }
  const url = assertPublicHttpUrl(instanceUrl, {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
    allowPrivateNetwork,
  });
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "baseUrl must not include credentials");
  }

  url.hash = "";
  url.search = "";
  // Strip a trailing REST API segment the user may have pasted (…/rest/api/2|3|latest) so we do
  // not double-append and 404 every request, then pin to the v2 API this provider speaks.
  const path = url.pathname.replace(/\/+$/u, "").replace(/\/rest\/api\/(?:2|3|latest)$/u, "");
  url.pathname = `${path}/rest/api/2`;
  return url.toString().replace(/\/$/u, "");
}

function resolveJiraServerApiBaseUrl(values: Record<string, string>, metadata: Record<string, unknown>): string {
  return asOptionalString(metadata.apiBaseUrl) ?? normalizeJiraServerApiBaseUrl(values.baseUrl);
}

function requirePersonalAccessToken(values: Record<string, string>): string {
  const token = asOptionalString(values.personalAccessToken);
  if (!token) {
    throw new ProviderRequestError(400, "personalAccessToken is required");
  }
  return token;
}

function readAccessibleResources(payload: unknown) {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "jira accessible-resources response must be an array");
  }

  return payload.map((item) => {
    const record = asOptionalObject(item);
    if (!record) {
      throw new ProviderRequestError(502, "jira accessible resource must be an object");
    }
    return record as JiraAccessibleResource;
  });
}

function pickPrimaryResource(resources: JiraAccessibleResource[]) {
  const candidates: JiraAccessibleResource[] = [];

  for (const resource of resources) {
    const scopes = readScopeArray(resource.scopes);
    if (!scopes.includes("read:jira-work") && !scopes.includes("write:jira-work")) {
      continue;
    }
    if (!asOptionalString(resource.id) || !asOptionalString(resource.url)) {
      continue;
    }
    candidates.push(resource);
  }

  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length > 1) {
    const matchedSites = candidates
      .map(
        (candidate) => `${asOptionalString(candidate.id) ?? "unknown"}:${asOptionalString(candidate.url) ?? "unknown"}`,
      )
      .join(", ");
    throw new ProviderRequestError(
      400,
      `jira authorization matches multiple Jira sites; explicit site selection is required (${matchedSites})`,
    );
  }

  return candidates[0] ?? null;
}

function buildCreateIssueFields(input: Record<string, unknown>, deployment: JiraActionContext["deployment"]) {
  const extraFields = asOptionalObject(input.extraFields) ?? {};
  const explicitFields = compactObject({
    project: buildProjectReference(input),
    issuetype: buildIssueTypeReference(input),
    summary: requireString(input.summary, "summary"),
    description:
      input.description !== undefined
        ? formatJiraDocument(normalizeLooseRecord(input.description, "description"), deployment)
        : buildOptionalTextDocument(input.descriptionText, deployment),
    labels: readStringArray(input.labels),
    assignee: buildOptionalAccountReference(input.assigneeAccountId, deployment),
    priority: buildOptionalIdReference(input.priorityId),
    duedate: asOptionalString(input.dueDate),
    parent: buildOptionalKeyReference(input.parentIssueKey),
  });

  return {
    ...extraFields,
    ...explicitFields,
  };
}

function buildProjectReference(input: Record<string, unknown>) {
  const projectId = asOptionalString(input.projectId);
  if (projectId) {
    return { id: projectId };
  }

  const projectKey = asOptionalString(input.projectKey);
  if (projectKey) {
    return { key: projectKey };
  }

  throw new ProviderRequestError(400, "projectKey or projectId is required");
}

function buildIssueTypeReference(input: Record<string, unknown>) {
  const issueTypeId = asOptionalString(input.issueTypeId);
  if (issueTypeId) {
    return { id: issueTypeId };
  }

  const issueTypeName = asOptionalString(input.issueTypeName);
  if (issueTypeName) {
    return { name: issueTypeName };
  }

  throw new ProviderRequestError(400, "issueTypeId or issueTypeName is required");
}

function buildOptionalAccountReference(value: unknown, deployment: JiraActionContext["deployment"]) {
  const accountId = asOptionalString(value);
  if (!accountId) {
    return undefined;
  }
  return deployment === "server" ? { name: accountId } : { accountId };
}

function buildOptionalIdReference(value: unknown) {
  const id = asOptionalString(value);
  return id ? { id } : undefined;
}

function buildOptionalKeyReference(value: unknown) {
  const key = asOptionalString(value);
  return key ? { key } : undefined;
}

function buildOptionalTextDocument(value: unknown, deployment: JiraActionContext["deployment"]) {
  const text = asOptionalString(value);
  if (!text) {
    return undefined;
  }
  return deployment === "server" ? text : textToAdfDocument(text);
}

function formatJiraDocument(value: Record<string, unknown>, deployment: JiraActionContext["deployment"]) {
  return deployment === "server" ? adfToPlainText(value) : value;
}

function normalizeProject(record: Record<string, unknown>) {
  return compactObject({
    id: asOptionalString(record.id),
    key: asOptionalString(record.key),
    name: asOptionalString(record.name),
    self: asOptionalString(record.self),
    description: asOptionalString(record.description),
    projectTypeKey: asOptionalString(record.projectTypeKey),
    simplified: optionalBoolean(record.simplified),
    style: asOptionalString(record.style),
    url: asOptionalString(record.url),
    lead: normalizeOptionalUser(record.lead),
    projectCategory: normalizeOptionalNamedReference(record.projectCategory),
    avatarUrls: asOptionalObject(record.avatarUrls),
    raw: record,
  });
}

function normalizeIssue(record: Record<string, unknown>) {
  const fields = asOptionalObject(record.fields) ?? {};

  return compactObject({
    id: asOptionalString(record.id),
    key: asOptionalString(record.key),
    self: asOptionalString(record.self),
    summary: asOptionalString(fields.summary),
    description: fields.description,
    status: normalizeOptionalNamedReference(fields.status),
    issueType: normalizeOptionalNamedReference(fields.issuetype),
    project: normalizeOptionalProject(fields.project),
    assignee: normalizeOptionalUser(fields.assignee),
    reporter: normalizeOptionalUser(fields.reporter),
    priority: normalizeOptionalNamedReference(fields.priority),
    labels: readStringArray(fields.labels),
    created: asOptionalString(fields.created),
    updated: asOptionalString(fields.updated),
    dueDate: asOptionalString(fields.duedate),
    fields,
    raw: record,
  });
}

function normalizeComment(record: Record<string, unknown>) {
  return compactObject({
    id: asOptionalString(record.id),
    self: asOptionalString(record.self),
    body: record.body,
    author: normalizeOptionalUser(record.author),
    updateAuthor: normalizeOptionalUser(record.updateAuthor),
    created: asOptionalString(record.created),
    updated: asOptionalString(record.updated),
    jsdPublic: optionalBoolean(record.jsdPublic),
    raw: record,
  });
}

function normalizeOptionalProject(value: unknown) {
  const record = asOptionalObject(value);
  return record ? normalizeProject(record) : undefined;
}

function normalizeOptionalUser(value: unknown) {
  const record = asOptionalObject(value);
  if (!record) {
    return undefined;
  }

  return compactObject({
    accountId: asOptionalString(record.accountId),
    accountType: asOptionalString(record.accountType),
    // Jira Server/Data Center identifies users by name/key rather than a Cloud accountId.
    name: asOptionalString(record.name),
    key: asOptionalString(record.key),
    displayName: asOptionalString(record.displayName),
    emailAddress: asOptionalString(record.emailAddress),
    active: optionalBoolean(record.active),
    self: asOptionalString(record.self),
    timeZone: asOptionalString(record.timeZone),
  });
}

function normalizeOptionalNamedReference(value: unknown) {
  const record = asOptionalObject(value);
  if (!record) {
    return undefined;
  }

  return compactObject({
    id: asOptionalString(record.id),
    name: asOptionalString(record.name),
    key: asOptionalString(record.key),
    self: asOptionalString(record.self),
    description: asOptionalString(record.description),
  });
}

function normalizeLooseRecord(value: unknown, fieldName: string) {
  const record = asOptionalObject(value);
  if (!record) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
  return record;
}

function textToAdfDocument(text: string) {
  const lines = text.split("\n");
  const content = lines
    .filter((line) => line.length > 0)
    .map((line) => ({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: line,
        },
      ],
    }));

  return {
    type: "doc",
    version: 1,
    content:
      content.length > 0
        ? content
        : [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text,
                },
              ],
            },
          ],
  };
}

function adfToPlainText(value: Record<string, unknown>): string {
  const parts: string[] = [];
  appendAdfText(value, parts);
  return parts
    .join("")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function appendAdfText(value: unknown, parts: string[]): void {
  const record = asOptionalObject(value);
  if (!record) {
    return;
  }

  const type = asOptionalString(record.type);
  if (type === "text") {
    const text = asOptionalString(record.text);
    if (text) {
      parts.push(text);
    }
  } else if (type === "hardBreak") {
    parts.push("\n");
  } else if (type === "mention" || type === "emoji" || type === "date" || type === "status") {
    // These inline nodes carry their visible text in attrs.text rather than a text child.
    const attrs = asOptionalObject(record.attrs);
    const text = asOptionalString(attrs?.text);
    if (text) {
      parts.push(text);
    }
  } else if (type === "inlineCard") {
    const attrs = asOptionalObject(record.attrs);
    const url = asOptionalString(attrs?.url);
    if (url) {
      parts.push(url);
    }
  }

  const content = Array.isArray(record.content) ? record.content : [];
  for (const child of content) {
    appendAdfText(child, parts);
  }
  if (content.length > 0 && ["paragraph", "heading", "listItem"].includes(type ?? "")) {
    parts.push("\n");
  }
}

function readScopeArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => asOptionalString(item)).filter((scope): scope is string => Boolean(scope));
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => asOptionalString(item)).filter((item): item is string => Boolean(item));
}

function readRecordArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => asOptionalObject(item)).filter((item): item is Record<string, unknown> => Boolean(item));
}

function readJsonObject<T>(value: unknown, context: string) {
  const record = asOptionalObject(value);
  if (!record) {
    throw new ProviderRequestError(502, `${context} must be a JSON object`);
  }
  return record as T;
}

async function readJsonValue(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      message: text,
    };
  }
}

function mapJiraResponseError(
  status: number,
  payload: unknown,
  phase: "auth" | "execute",
  notFoundAsInvalidInput: boolean,
) {
  const message = readJiraErrorMessage(payload);

  if (status === 400) {
    return new ProviderRequestError(400, message);
  }
  if (status === 401) {
    return new ProviderRequestError(phase === "auth" ? 400 : 401, message);
  }
  if (status === 403) {
    if (looksLikeScopeError(message)) {
      return new ProviderRequestError(403, message);
    }
    return new ProviderRequestError(502, message, 403);
  }
  if (status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  return new ProviderRequestError(502, message, status >= 500 ? 500 : status);
}

function readJiraErrorMessage(payload: unknown) {
  const record = asOptionalObject(payload);
  if (!record) {
    return "jira request failed";
  }

  const errorMessages = Array.isArray(record.errorMessages)
    ? record.errorMessages.map((item) => asOptionalString(item)).filter((item): item is string => Boolean(item))
    : [];
  if (errorMessages.length > 0) {
    return errorMessages.join("; ");
  }

  const fieldErrors = asOptionalObject(record.errors);
  if (fieldErrors) {
    const messages: string[] = [];
    for (const [key, value] of Object.entries(fieldErrors)) {
      const message = asOptionalString(value);
      if (message) {
        messages.push(`${key}: ${message}`);
      }
    }
    if (messages.length > 0) {
      return messages.join("; ");
    }
  }

  return asOptionalString(record.message) ?? "jira request failed";
}

function looksLikeScopeError(message: string) {
  const lower = message.toLowerCase();
  return lower.includes("scope") || lower.includes("permission");
}

function mergeUniqueFieldIds(baseFields: string[], extraFields: string[]) {
  const merged = [...baseFields];

  for (const field of extraFields) {
    if (!merged.includes(field)) {
      merged.push(field);
    }
  }

  return merged;
}

function joinOptionalList(values: string[]) {
  return values.length > 0 ? values.join(",") : undefined;
}

function optionalStringList(values: string[]) {
  return values.length > 0 ? values : undefined;
}

function parseNumericCursor(value: unknown) {
  const cursor = asOptionalString(value);
  if (!cursor) {
    return 0;
  }

  const parsed = Number(cursor);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ProviderRequestError(400, "cursor must be a non-negative integer string");
  }

  return parsed;
}

function resolveNumericNextCursor(startAt: number, itemCount: number, total?: number, isLast?: boolean) {
  if (itemCount === 0) {
    return null;
  }
  if (isLast) {
    return null;
  }
  if (typeof total === "number" && startAt + itemCount >= total) {
    return null;
  }
  return String(startAt + itemCount);
}

function compactQuery(query: Record<string, string | undefined>) {
  return compactObject(query);
}

function requireString(value: unknown, fieldName: string) {
  const stringValue = asOptionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return stringValue;
}

function requireNonEmptyString(value: unknown, fieldName: string) {
  const stringValue = asOptionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(502, `missing ${fieldName}`);
  }
  return stringValue;
}

function isAbsoluteUrl(value: string) {
  return value.startsWith("https://") || value.startsWith("http://");
}

function trimLeadingSlash(value: string) {
  let index = 0;
  while (index < value.length && value[index] === "/") {
    index += 1;
  }
  return value.slice(index);
}
