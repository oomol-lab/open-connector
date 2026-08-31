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
        agent_id: readOptionalTrimmedString(input.agentId),
        tags: readOptionalTrimmedString(input.tags),
        tag_selector: readOptionalTrimmedString(input.tagSelector),
        search: readOptionalTrimmedString(input.search),
        type: readOptionalTrimmedString(input.type),
        subtype: readOptionalTrimmedString(input.subtype),
        managed_by: readOptionalTrimmedString(input.managedBy),
        resource_name: readOptionalTrimmedString(input.resourceName),
        attribute: readOptionalTrimmedString(input.attribute),
        connection_ids: readOptionalTrimmedString(input.connectionIds),
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
        user: readOptionalTrimmedString(input.user),
        connection: readOptionalTrimmedString(input.connectionName),
        type: readOptionalTrimmedString(input.type),
        "review.approver": readOptionalTrimmedString(input.reviewApprover),
        "review.status": readOptionalTrimmedString(input.reviewStatus),
        correlation_id: readOptionalTrimmedString(input.correlationId),
        jira_issue_key: readOptionalTrimmedString(input.jiraIssueKey),
        start_date: readOptionalTrimmedString(input.startDate),
        end_date: readOptionalTrimmedString(input.endDate),
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
  return (
    readOptionalTrimmedString(object.message) ??
    readOptionalTrimmedString(object.error) ??
    readOptionalTrimmedString(object.detail)
  );
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
  const subject = readOptionalTrimmedString(data.subject) ?? readOptionalTrimmedString(data.sub);
  if (!subject) {
    throw new ProviderRequestError(502, "Invalid Hoop userinfo response", data);
  }

  const user: HoopUserInfo = {
    subject,
    raw: data,
  };
  const email = readOptionalTrimmedString(data.email);
  if (email) {
    user.email = email;
  }
  const name = readOptionalTrimmedString(data.name);
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
    name: readOptionalTrimmedString(data.name),
    type: readOptionalTrimmedString(data.type),
    subtype: readOptionalTrimmedString(data.subtype),
    status: readOptionalTrimmedString(data.status),
    agentId: readOptionalTrimmedString(data.agent_id) ?? readOptionalTrimmedString(data.agentId),
    resourceName: readOptionalTrimmedString(data.resource_name) ?? readOptionalTrimmedString(data.resourceName),
    raw: data,
  });
}

function normalizeSession(payload: unknown): Record<string, unknown> {
  const data = requireObject(payload, "session");
  return compactObject({
    id: readOptionalTrimmedString(data.id),
    connectionName:
      readOptionalTrimmedString(data.connection) ??
      readOptionalTrimmedString(data.connection_name) ??
      readOptionalTrimmedString(data.connectionName),
    status: readOptionalTrimmedString(data.status),
    user: readOptionalTrimmedString(data.user),
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

function readOptionalTrimmedString(value: unknown): string | undefined {
  return optionalString(value);
}
