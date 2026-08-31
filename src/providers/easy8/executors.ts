import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "easy8";
interface Context {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
export function normalizeBaseUrl(value: unknown): string {
  const text = requiredString(value, "baseUrl", providerInputError);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw providerInputError("baseUrl must be a valid http(s) URL");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.pathname !== "/")
    throw providerInputError("baseUrl must be the Easy8 instance root URL without a path");
  assertPublicHttpUrl(url.toString(), {
    fieldName: "baseUrl",
    createError: providerInputError,
    allowPrivateNetwork: isPrivateNetworkAccessAllowed(),
  });
  if (url.username || url.password) throw providerInputError("baseUrl must not include credentials");
  url.search = "";
  url.hash = "";
  const normalized = url.toString();
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}
async function request(
  context: Context,
  path: string,
  options: { method?: "POST" | "PUT" | "DELETE"; query?: Record<string, unknown>; body?: unknown } = {},
): Promise<unknown> {
  const url = new URL(path, `${context.baseUrl}/`);
  for (const [key, value] of Object.entries(options.query ?? {}))
    if (value !== undefined) url.searchParams.set(key, String(value));
  const response = await context.fetcher(url, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      "x-redmine-api-key": context.apiKey,
      "user-agent": providerUserAgent,
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  if (!response.ok) {
    const record = optionalRecord(payload);
    const errors = Array.isArray(record?.errors)
      ? record.errors.filter((item) => typeof item === "string").join(", ")
      : undefined;
    throw new ProviderRequestError(
      response.status,
      errors ||
        optionalString(record?.error) ||
        optionalString(record?.message) ||
        `Easy8 request failed with status ${response.status}`,
      payload,
    );
  }
  return payload;
}
function field(payload: unknown, key: string): Record<string, unknown> {
  const result = optionalRecord(optionalRecord(payload)?.[key]);
  if (!result) throw new ProviderRequestError(502, `Easy8 response is missing ${key}`, payload);
  return result;
}
function list(payload: unknown, key: "projects" | "issues"): Record<string, unknown> {
  const record = optionalRecord(payload) ?? {};
  const items = record[key];
  if (!Array.isArray(items) || items.some((item) => !optionalRecord(item)))
    throw new ProviderRequestError(502, `Easy8 response is missing ${key}`, payload);
  return {
    [key]: items,
    totalCount: optionalInteger(record.total_count) ?? items.length,
    offset: optionalInteger(record.offset) ?? 0,
    limit: optionalInteger(record.limit) ?? items.length,
  };
}
function listQuery(input: Record<string, unknown>): Record<string, unknown> {
  const query = optionalString(input.query);
  return compactObject({
    easy_query_q: query,
    set_filter: query ? true : undefined,
    limit: optionalInteger(input.limit),
    offset: optionalInteger(input.offset),
  });
}
function projectBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    author_id: optionalInteger(input.authorId),
    description: optionalString(input.description),
    parent_id: optionalInteger(input.parentId),
    manager_id: optionalInteger(input.managerId),
    owner_id: optionalInteger(input.ownerId),
    is_planned: typeof input.planned === "boolean" ? input.planned : undefined,
    easy_start_date: optionalString(input.startDate),
    easy_due_date: optionalString(input.dueDate),
    easy_currency_code: optionalString(input.currencyCode),
    tag_list: input.tags,
  });
}
function issueBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    subject: optionalString(input.subject),
    project_id: optionalInteger(input.projectId),
    tracker_id: optionalInteger(input.trackerId),
    status_id: optionalInteger(input.statusId),
    priority_id: optionalInteger(input.priorityId),
    author_id: optionalInteger(input.authorId),
    assigned_to_id: optionalInteger(input.assigneeId),
    description: optionalString(input.description),
    estimated_hours: optionalString(input.estimatedHours),
    done_ratio: optionalInteger(input.doneRatio),
    start_date: optionalString(input.startDate),
    due_date: optionalString(input.dueDate),
    is_private: typeof input.private === "boolean" ? input.private : undefined,
    parent_issue_id: optionalInteger(input.parentIssueId),
    notes: optionalString(input.notes),
    tag_list: input.tags,
  });
}
function id(input: Record<string, unknown>, key: string): number {
  const value = optionalInteger(input[key]);
  if (!value || value < 1) throw providerInputError(`${key} must be a positive integer`);
  return value;
}
function requireUpdate(body: Record<string, unknown>, action: string): void {
  if (!Object.keys(body).length) throw providerInputError(`${action} requires a field to update`);
}
const handlers = {
  async list_projects(input: Record<string, unknown>, context: Context) {
    return list(await request(context, "/projects.json", { query: listQuery(input) }), "projects");
  },
  async get_project(input: Record<string, unknown>, context: Context) {
    return { project: field(await request(context, `/projects/${id(input, "projectId")}.json`), "project") };
  },
  async create_project(input: Record<string, unknown>, context: Context) {
    return {
      project: field(
        await request(context, "/projects.json", { method: "POST", body: { project: projectBody(input) } }),
        "project",
      ),
    };
  },
  async update_project(input: Record<string, unknown>, context: Context) {
    const body = projectBody(input);
    requireUpdate(body, "update_project");
    return {
      project: field(
        await request(context, `/projects/${id(input, "projectId")}.json`, { method: "PUT", body: { project: body } }),
        "project",
      ),
    };
  },
  async list_issues(input: Record<string, unknown>, context: Context) {
    return list(await request(context, "/issues.json", { query: listQuery(input) }), "issues");
  },
  async get_issue(input: Record<string, unknown>, context: Context) {
    return { issue: field(await request(context, `/issues/${id(input, "issueId")}.json`), "issue") };
  },
  async create_issue(input: Record<string, unknown>, context: Context) {
    return {
      issue: field(
        await request(context, "/issues.json", { method: "POST", body: { issue: issueBody(input) } }),
        "issue",
      ),
    };
  },
  async update_issue(input: Record<string, unknown>, context: Context) {
    const body = issueBody(input);
    requireUpdate(body, "update_issue");
    return {
      issue: field(
        await request(context, `/issues/${id(input, "issueId")}.json`, { method: "PUT", body: { issue: body } }),
        "issue",
      ),
    };
  },
  async delete_issue(input: Record<string, unknown>, context: Context) {
    await request(context, `/issues/${id(input, "issueId")}.json`, { method: "DELETE" });
    return { deleted: true };
  },
};
export const executors: ProviderExecutors = defineProviderExecutors<Context>({
  service,
  handlers,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: normalizeBaseUrl(credential.metadata.baseUrl ?? credential.values.baseUrl),
      fetcher,
      signal: context.signal,
    };
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return normalizeBaseUrl(credential.metadata.baseUrl ?? credential.values.baseUrl);
  },
  auth: { type: "api_key_header", name: "X-Redmine-API-Key" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const baseUrl = normalizeBaseUrl(input.values.baseUrl);
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    await request({ apiKey: input.apiKey, baseUrl, fetcher: guardedFetcher, signal }, "/projects.json", {
      query: { limit: 1 },
    });
    const host = new URL(baseUrl).host;
    return {
      profile: { accountId: `easy8:${host}`, displayName: `Easy8 ${host}` },
      grantedScopes: [],
      metadata: { baseUrl, apiBaseUrl: baseUrl, validationEndpoint: "/projects.json" },
    };
  },
};
