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
import {
  ProviderRequestError,
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  requireOAuthCredential,
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
    const credential = await requireOAuthCredential(context, "jira");
    return {
      accessToken: credential.accessToken,
      fetcher,
      providerMetadata: credential.metadata,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "jira",
  baseUrl: async (context) => {
    const credential = await requireOAuthCredential(context, "jira");
    return resolveJiraApiBaseUrl(credential.metadata);
  },
  auth: {
    type: "oauth_bearer",
  },
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }) {
    return fetchJiraCurrentAccount(input.accessToken, fetcher);
  },
};

async function listProjects(input: Record<string, unknown>, context: JiraActionContext) {
  const limit = asOptionalInteger(input.limit) ?? 50;
  const startAt = parseNumericCursor(input.cursor);
  const expand = joinOptionalList(readStringArray(input.expand));

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
      nextCursor: resolveNumericNextCursor(startAt, values.length, total),
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
  const payload = await jiraJsonRequest<Record<string, unknown>>({
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    providerMetadata: context.providerMetadata,
    path: "/search/jql",
    method: "POST",
    body: compactObject({
      jql: requireString(input.jql, "jql"),
      maxResults: asOptionalInteger(input.limit) ?? 50,
      nextPageToken: asOptionalString(input.cursor),
      fields: mergeUniqueFieldIds(defaultIssueFieldIds, readStringArray(input.includeFields)),
      expand: joinOptionalList(readStringArray(input.expand)),
    }),
  });

  return {
    issues: readRecordArray(payload.issues).map((issue) => normalizeIssue(issue)),
    pagination: {
      nextCursor: asOptionalString(payload.nextPageToken) ?? null,
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
      fields: buildCreateIssueFields(input),
    },
  });

  const createdIssueIdOrKey =
    asOptionalString(createPayload.key) ??
    asOptionalString(createPayload.id) ??
    requireNonEmptyString(createPayload.self, "jira created issue self");

  const issueLookupPath = createdIssueIdOrKey.startsWith("https://")
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
      body: rawBody !== undefined ? normalizeLooseRecord(rawBody, "body") : textToAdfDocument(textBody ?? ""),
    },
    notFoundAsInvalidInput: true,
  });

  return {
    comment: normalizeComment(payload),
  };
}

async function jiraJsonRequest<T>(input: JiraRequestInput) {
  const response = await jiraRequest(input);
  return readJsonObject<T>(await readJsonValue(response), "jira response payload");
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
  const target = isAbsoluteUrl(pathOrUrl)
    ? new URL(pathOrUrl)
    : new URL(trimLeadingSlash(pathOrUrl), `${resolveJiraApiBaseUrl(providerMetadata)}/`);

  if (target.origin !== jiraApiOrigin) {
    throw new ProviderRequestError(400, `jira requests must target ${jiraApiOrigin}`);
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
  const cloudId = asOptionalString(providerMetadata?.cloudId);
  if (!cloudId) {
    throw new ProviderRequestError(502, "jira provider metadata is missing cloudId");
  }
  return buildJiraApiBaseUrl(cloudId);
}

function buildJiraApiBaseUrl(cloudId: string) {
  return `${jiraApiOrigin}/ex/jira/${encodeURIComponent(cloudId)}/rest/api/3`;
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

function buildCreateIssueFields(input: Record<string, unknown>) {
  const extraFields = asOptionalObject(input.extraFields) ?? {};
  const explicitFields = compactObject({
    project: buildProjectReference(input),
    issuetype: buildIssueTypeReference(input),
    summary: requireString(input.summary, "summary"),
    description:
      input.description !== undefined
        ? normalizeLooseRecord(input.description, "description")
        : buildOptionalTextDocument(input.descriptionText),
    labels: readStringArray(input.labels),
    assignee: buildOptionalAccountReference(input.assigneeAccountId),
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

function buildOptionalAccountReference(value: unknown) {
  const accountId = asOptionalString(value);
  return accountId ? { accountId } : undefined;
}

function buildOptionalIdReference(value: unknown) {
  const id = asOptionalString(value);
  return id ? { id } : undefined;
}

function buildOptionalKeyReference(value: unknown) {
  const key = asOptionalString(value);
  return key ? { key } : undefined;
}

function buildOptionalTextDocument(value: unknown) {
  const text = asOptionalString(value);
  return text ? textToAdfDocument(text) : undefined;
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

function resolveNumericNextCursor(startAt: number, itemCount: number, total?: number) {
  if (itemCount === 0) {
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
