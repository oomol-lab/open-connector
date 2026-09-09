import type { CredentialValidationResult } from "../../core/types.ts";
import type {
  ApiKeyProviderContext,
  ProviderActionHandlers,
  ProviderFetch,
  ProviderRuntimeHandler,
} from "../provider-runtime.ts";

import {
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalScalarString,
  optionalString,
  requiredNumber,
} from "../../core/cast.ts";
import { encodePathSegment, queryParams } from "../../core/request.ts";
import { arrayPayload } from "../http-json-runtime.ts";
import {
  basicAuthorizationHeader,
  providerInputError,
  providerResponseError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  setSearchParams,
} from "../provider-runtime.ts";

export const cursorApiBaseUrl = "https://api.cursor.com";

export const cursorActionHandlers: ProviderActionHandlers<"cursor", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  create_agent(input, context) {
    return requestCursor("/v1/agents", context, { method: "POST", body: input });
  },
  list_agents(input, context) {
    return requestCursor("/v1/agents", context, {
      query: queryParams({
        limit: optionalNumber(input.limit),
        cursor: optionalString(input.cursor),
        prUrl: optionalString(input.prUrl),
        includeArchived: optionalBoolean(input.includeArchived),
      }),
    });
  },
  get_agent(input, context) {
    return requestCursor(agentPath(input), context);
  },
  create_run(input, context) {
    return requestCursor(`${agentPath(input)}/runs`, context, {
      method: "POST",
      body: { prompt: input.prompt, mode: input.mode, mcpServers: input.mcpServers },
    });
  },
  list_runs(input, context) {
    return requestCursor(`${agentPath(input)}/runs`, context, {
      query: queryParams({ limit: optionalNumber(input.limit), cursor: optionalString(input.cursor) }),
    });
  },
  get_run(input, context) {
    return requestCursor(runPath(input), context);
  },
  cancel_run(input, context) {
    return requestCursor(`${runPath(input)}/cancel`, context, { method: "POST" });
  },
  archive_agent(input, context) {
    return requestCursor(`${agentPath(input)}/archive`, context, { method: "POST" });
  },
  unarchive_agent(input, context) {
    return requestCursor(`${agentPath(input)}/unarchive`, context, { method: "POST" });
  },
  delete_agent(input, context) {
    return requestCursor(agentPath(input), context, { method: "DELETE" });
  },
  list_models(_input, context) {
    return requestCursor("/v1/models", context);
  },
  async list_team_members(_input, context) {
    const payload = await requestCursor("/teams/members", context);
    return { teamMembers: arrayPayload(payload.teamMembers, "Cursor teamMembers"), raw: payload };
  },
  async list_audit_logs(input, context) {
    const payload = await requestCursor("/teams/audit-logs", context, {
      query: queryParams({
        startTime: optionalString(input.startTime),
        endTime: optionalString(input.endTime),
        eventTypes: joinOptionalStrings(input.eventTypes),
        search: optionalString(input.search),
        page: optionalNumber(input.page),
        pageSize: optionalNumber(input.pageSize),
        users: joinOptionalStrings(input.users),
      }),
    });
    return {
      events: arrayPayload(payload.events, "Cursor events"),
      pagination: requiredResponseRecord(payload.pagination, "Cursor pagination"),
      params: optionalRecord(payload.params),
      raw: payload,
    };
  },
  async get_daily_usage_data(input, context) {
    const payload = await requestCursor("/teams/daily-usage-data", context, { method: "POST", body: input });
    return {
      data: arrayPayload(payload.data, "Cursor daily usage"),
      period: requiredResponseRecord(payload.period, "Cursor period"),
      pagination: optionalRecord(payload.pagination),
      raw: payload,
    };
  },
  async get_team_spend(input, context) {
    const payload = await requestCursor("/teams/spend", context, { method: "POST", body: input });
    return {
      teamMemberSpend: arrayPayload(payload.teamMemberSpend, "Cursor teamMemberSpend"),
      subscriptionCycleStart: requiredNumber(
        payload.subscriptionCycleStart,
        "subscriptionCycleStart",
        providerResponseError,
      ),
      totalMembers: requiredNumber(payload.totalMembers, "totalMembers", providerResponseError),
      totalPages: requiredNumber(payload.totalPages, "totalPages", providerResponseError),
      raw: payload,
    };
  },
};

/** Validate user and service account keys first, with compatibility for admin-only keys. */
export async function validateCursorCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context: ApiKeyProviderContext = { apiKey, fetcher, signal };
  try {
    const payload = await requestCursor("/v1/me", context);
    return {
      profile: {
        accountId: optionalScalarString(payload.userId),
        displayName: optionalString(payload.userEmail) ?? optionalString(payload.apiKeyName),
      },
    };
  } catch (error) {
    if (!(error instanceof ProviderRequestError) || (error.status !== 401 && error.status !== 403)) throw error;
  }

  // Older admin keys may only have access to the Admin API.
  try {
    const payload = await requestCursor("/teams/members", context);
    arrayPayload(payload.teamMembers, "Cursor teamMembers");
    return { profile: { accountId: "cursor:team", grantedScopes: ["admin:*"] } };
  } catch (error) {
    if (error instanceof ProviderRequestError && (error.status === 401 || error.status === 403)) {
      throw providerInputError(error.message);
    }
    throw error;
  }
}

interface CursorRequestOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}

function requestCursor(
  path: string,
  context: ApiKeyProviderContext,
  options: CursorRequestOptions = {},
): Promise<Record<string, unknown>> {
  const url = new URL(path, cursorApiBaseUrl);
  setSearchParams(url, options.query ?? {});
  return runProviderRequest({ signal: context.signal, label: "Cursor" }, async (signal) => {
    const headers = new Headers({
      accept: "application/json",
      authorization: basicAuthorizationHeader(`${context.apiKey}:`),
      "user-agent": providerUserAgent,
    });
    if (options.body !== undefined) headers.set("content-type", "application/json");
    const response = await context.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      signal,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "Cursor returned invalid JSON",
      invalidJsonFallback: response.ok ? undefined : () => null,
    });
    if (!response.ok) {
      const record = optionalRecord(payload);
      const error = optionalRecord(record?.error);
      throw new ProviderRequestError(
        response.status,
        optionalString(error?.message) ??
          optionalString(record?.message) ??
          optionalString(record?.error) ??
          optionalString(record?.code) ??
          `Cursor request failed with HTTP ${response.status}`,
        payload,
      );
    }
    return requiredResponseRecord(payload, "Cursor");
  });
}

function agentPath(input: Record<string, unknown>): string {
  const id = requiredInputString(input.agentId, "agentId");
  if (id === "." || id === "..") throw providerInputError("agentId cannot be a URL dot segment.");
  return `/v1/agents/${encodePathSegment(id)}`;
}

function runPath(input: Record<string, unknown>): string {
  const id = requiredInputString(input.runId, "runId");
  if (id === "." || id === "..") throw providerInputError("runId cannot be a URL dot segment.");
  return `${agentPath(input)}/runs/${encodePathSegment(id)}`;
}

function joinOptionalStrings(value: unknown): string | undefined {
  return Array.isArray(value) ? value.map(String).join(",") : undefined;
}
