import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const hoopApiBaseUrl = "https://use.hoop.dev/api";
export const hoopValidationPath = "/userinfo";

type HoopRequestPhase = "validate" | "execute";
type HoopActionContext = ApiKeyProviderContext;
type HoopActionHandler = (input: Record<string, unknown>, context: HoopActionContext) => Promise<unknown>;

interface HoopRequestInput {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  phase: HoopRequestPhase;
  signal?: AbortSignal;
  query?: Record<string, string | number | undefined>;
}

export const hoopActionHandlers: ProviderActionHandlers<"hoop", HoopActionHandler> = {
  async get_current_user(_input, context) {
    return {
      user: normalizeUserInfo(
        await requestHoopJson({
          path: hoopValidationPath,
          apiKey: context.apiKey,
          fetcher: context.fetcher,
          signal: context.signal,
          phase: "execute",
        }),
      ),
    };
  },
  async list_connections(input, context) {
    const payload = await requestHoopJson({
      path: "/connections",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      query: compactObject({
        agent_id: optionalString(input.agentId),
        tags: optionalString(input.tags),
        tag_selector: optionalString(input.tagSelector),
        search: optionalString(input.search),
        type: optionalString(input.type),
        subtype: optionalString(input.subtype),
        managed_by: optionalString(input.managedBy),
        resource_name: optionalString(input.resourceName),
        attribute: optionalString(input.attribute),
        connection_ids: optionalString(input.connectionIds),
        page_size: optionalInteger(input.pageSize),
        page: optionalInteger(input.page),
      }),
    });
    const connections = readCollection(payload, "connections").map((item) => normalizeConnection(item));
    return {
      connections,
      raw: payload,
    };
  },
  async list_sessions(input, context) {
    const payload = await requestHoopJson({
      path: "/sessions",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      query: compactObject({
        user: optionalString(input.user),
        connection: optionalString(input.connectionName),
        type: optionalString(input.type),
        "review.approver": optionalString(input.reviewApprover),
        "review.status": optionalString(input.reviewStatus),
        correlation_id: optionalString(input.correlationId),
        jira_issue_key: optionalString(input.jiraIssueKey),
        start_date: optionalString(input.startDate),
        end_date: optionalString(input.endDate),
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
      }),
    });
    const sessions = readCollection(payload, "sessions").map((item) => normalizeSession(item));
    return {
      sessions,
      raw: payload,
    };
  },
};

export async function validateHoopCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await requestHoopJson({
    path: hoopValidationPath,
    apiKey: input.apiKey,
    fetcher: options.fetcher,
    signal: options.signal,
    phase: "validate",
  });
  const user = normalizeUserInfo(payload);

  return {
    profile: {
      accountId: user.subject,
      displayName: user.name ?? user.email ?? "Hoop API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: hoopApiBaseUrl,
      validationEndpoint: hoopValidationPath,
      subject: user.subject,
      email: user.email,
      groups: user.groups,
    }),
  };
}

async function requestHoopJson(input: HoopRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal);
  let response: Response;
  try {
    response = await input.fetcher(buildHoopUrl(input.path, input.query), {
      method: "GET",
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Hoop request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Hoop request failed: ${error.message}` : "Hoop request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readHoopPayload(response);
  if (!response.ok) {
    throw createHoopError(response, payload, input.phase);
  }
  return payload;
}

async function readHoopPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (text.length === 0) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function buildHoopUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(`${hoopApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function createHoopError(response: Response, payload: unknown, phase: HoopRequestPhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Hoop request failed with status ${response.status}`;
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? response.status : 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }
  return optionalString(object.message) ?? optionalString(object.error) ?? optionalString(object.detail);
}

interface HoopUserInfo {
  subject: string;
  email?: string;
  name?: string;
  groups?: string[];
  raw: Record<string, unknown>;
}

function normalizeUserInfo(payload: unknown): HoopUserInfo {
  const data = requireObject(payload, "userinfo");
  const subject = optionalString(data.subject) ?? optionalString(data.sub);
  if (!subject) {
    throw new ProviderRequestError(502, "Invalid Hoop userinfo response", data);
  }

  const user: HoopUserInfo = {
    subject,
    raw: data,
  };
  const email = optionalString(data.email);
  if (email) {
    user.email = email;
  }
  const name = optionalString(data.name);
  if (name) {
    user.name = name;
  }
  const groups = readStringArray(data.groups);
  if (groups) {
    user.groups = groups;
  }
  return user;
}

function normalizeConnection(payload: unknown): Record<string, unknown> {
  const data = requireObject(payload, "connection");
  return compactObject({
    name: optionalString(data.name),
    type: optionalString(data.type),
    subtype: optionalString(data.subtype),
    status: optionalString(data.status),
    agentId: optionalString(data.agent_id) ?? optionalString(data.agentId),
    resourceName: optionalString(data.resource_name) ?? optionalString(data.resourceName),
    raw: data,
  });
}

function normalizeSession(payload: unknown): Record<string, unknown> {
  const data = requireObject(payload, "session");
  return compactObject({
    id: optionalString(data.id),
    connectionName:
      optionalString(data.connection) ?? optionalString(data.connection_name) ?? optionalString(data.connectionName),
    status: optionalString(data.status),
    user: optionalString(data.user),
    raw: data,
  });
}

function readCollection(payload: unknown, fieldName: string): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  const object = optionalRecord(payload);
  if (object && Array.isArray(object.data)) {
    return object.data;
  }
  if (object && Array.isArray(object[fieldName])) {
    return object[fieldName];
  }
  throw new ProviderRequestError(502, `Invalid Hoop ${fieldName} response`, payload);
}

function requireObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `Invalid Hoop ${fieldName} response`, value);
  }
  return object;
}

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.map((item) => optionalString(item)).filter((item): item is string => item !== undefined)
    : undefined;
}
