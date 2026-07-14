import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { CursorActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import { providerFetch, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

type CursorActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const cursorApiBaseUrl = "https://api.cursor.com";

export const cursorActionHandlers: Record<CursorActionName, CursorActionHandler> = {
  async list_team_members(_input, context) {
    const payload = await requestCursor({ method: "GET", path: "/teams/members" }, context, "execute");
    return {
      teamMembers: readArray(payload.teamMembers, "teamMembers"),
      raw: payload,
    };
  },
  async list_audit_logs(input, context) {
    const payload = await requestCursor(
      {
        method: "GET",
        path: "/teams/audit-logs",
        query: queryParams({
          startTime: optionalString(input.startTime),
          endTime: optionalString(input.endTime),
          eventTypes: joinOptionalStrings(input.eventTypes),
          search: optionalString(input.search),
          page: readOptionalNumber(input.page),
          pageSize: readOptionalNumber(input.pageSize),
          users: joinOptionalStrings(input.users),
        }),
      },
      context,
      "execute",
    );
    return {
      events: readArray(payload.events, "events"),
      pagination: readObject(payload.pagination, "pagination"),
      params: optionalRecord(payload.params),
      raw: payload,
    };
  },
  async get_daily_usage_data(input, context) {
    const payload = await requestCursor(
      {
        method: "POST",
        path: "/teams/daily-usage-data",
        body: compactObject({
          startDate: input.startDate,
          endDate: input.endDate,
          page: input.page,
          pageSize: input.pageSize,
        }),
      },
      context,
      "execute",
    );
    return {
      data: readArray(payload.data, "data"),
      period: readObject(payload.period, "period"),
      pagination: optionalRecord(payload.pagination),
      raw: payload,
    };
  },
  async get_team_spend(input, context) {
    const payload = await requestCursor(
      {
        method: "POST",
        path: "/teams/spend",
        body: compactObject({
          searchTerm: optionalString(input.searchTerm),
          sortBy: optionalString(input.sortBy),
          sortDirection: optionalString(input.sortDirection),
          page: input.page,
          pageSize: input.pageSize,
        }),
      },
      context,
      "execute",
    );
    return {
      teamMemberSpend: readArray(payload.teamMemberSpend, "teamMemberSpend"),
      subscriptionCycleStart: readNumber(payload.subscriptionCycleStart, "subscriptionCycleStart"),
      totalMembers: readNumber(payload.totalMembers, "totalMembers"),
      totalPages: readNumber(payload.totalPages, "totalPages"),
      raw: payload,
    };
  },
};

export async function validateCursorCredential(
  apiKey: string,
  fetcher: typeof fetch = providerFetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await requestCursor(
    { method: "GET", path: "/teams/members" },
    { apiKey, fetcher, signal },
    "validate",
  );
  const members = readArray(payload.teamMembers, "teamMembers");
  const firstMember = optionalRecord(members[0]);
  const firstMemberEmail = optionalString(firstMember?.email);
  return {
    profile: {
      accountId: "cursor:team",
      displayName: firstMemberEmail ? `Cursor Team (${firstMemberEmail})` : "Cursor Team",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: cursorApiBaseUrl,
      validationEndpoint: "/teams/members",
      teamMemberCount: members.length,
      firstMemberEmail,
    }),
  };
}

interface CursorRequest {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
}

async function requestCursor(
  request: CursorRequest,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: "validate" | "execute",
): Promise<Record<string, unknown>> {
  const url = new URL(request.path, cursorApiBaseUrl);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    url.searchParams.set(key, value);
  }
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Basic ${Buffer.from(`${context.apiKey}:`).toString("base64")}`,
    "user-agent": providerUserAgent,
  };
  if (request.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: request.method,
      headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Cursor request failed: ${error.message}` : "Cursor request failed",
    );
  }

  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = parseJsonObject(text, response.status);
  } catch (error) {
    if (response.ok) {
      throw error;
    }
  }

  if (!response.ok) {
    throw new ProviderRequestError(
      response.status === 401 || response.status === 403 ? (phase === "validate" ? 400 : 401) : response.status || 502,
      readCursorErrorMessage(payload, response.status),
      payload,
    );
  }

  return payload;
}

function parseJsonObject(text: string, status: number): Record<string, unknown> {
  if (!text) {
    return {};
  }
  try {
    const value = JSON.parse(text) as unknown;
    return readObject(value, `response (${status})`);
  } catch {
    throw new ProviderRequestError(502, `Cursor returned non-JSON response (${status})`);
  }
}

function readCursorErrorMessage(payload: Record<string, unknown>, status: number): string {
  return (
    optionalString(payload.message) ??
    optionalString(payload.error) ??
    optionalString(payload.code) ??
    `Cursor API request failed with status ${status}`
  );
}

function readArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Cursor response field ${fieldName} is not an array`);
  }
  return value;
}

function readNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number") {
    throw new ProviderRequestError(502, `Cursor response field ${fieldName} is not a number`);
  }
  return value;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Cursor response field ${fieldName} is not an object`);
  }
  return record;
}

function joinOptionalStrings(value: unknown): string | undefined {
  return Array.isArray(value) ? value.map(String).join(",") : undefined;
}
