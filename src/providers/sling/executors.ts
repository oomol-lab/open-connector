import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "sling";
const slingApiBaseUrl = "https://api.getsling.com/v1";

type SlingPhase = "validate" | "execute";
type SlingQueryValue = string | number | boolean | readonly (string | number)[];
type SlingActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const slingActionHandlers: ProviderActionHandlers<"sling", SlingActionHandler> = {
  get_current_session(_input, context) {
    return requestWrapped("session", "/account/session", {}, context);
  },
  list_users(input, context) {
    return requestWrapped("users", "/users", buildListUsersQuery(input), context);
  },
  get_user(input, context) {
    return requestWrapped("user", `/users/${encodeURIComponent(String(input.userId))}`, {}, context);
  },
  list_groups(input, context) {
    return requestWrapped("groups", "/groups", buildListGroupsQuery(input), context);
  },
  get_group(input, context) {
    return requestWrapped("group", `/groups/${encodeURIComponent(String(input.groupId))}`, {}, context);
  },
  list_calendar_events(input, context) {
    return requestWrapped(
      "events",
      `/calendar/${encodeURIComponent(String(input.orgId))}/users/${encodeURIComponent(String(input.userId))}`,
      buildCalendarEventsQuery(input),
      context,
    );
  },
  get_shift(input, context) {
    return requestWrapped(
      "shift",
      `/shifts/${encodeURIComponent(String(input.shiftId))}`,
      compactObject({ includeTimesheets: optionalString(input.includeTimesheets) }),
      context,
    );
  },
  get_detailed_shift(input, context) {
    return requestWrapped("shift", `/shifts/${encodeURIComponent(String(input.shiftId))}/detailed`, {}, context);
  },
  list_shift_coworkers(input, context) {
    return requestWrapped("coworkers", `/shifts/${encodeURIComponent(String(input.shiftId))}/coworkers`, {}, context);
  },
  get_current_shift(_input, context) {
    return requestWrapped("shift", "/shifts/current", {}, context);
  },
  get_next_shift(input, context) {
    return requestWrapped(
      "shift",
      "/shifts/next",
      compactObject({ referenceDate: optionalString(input.referenceDate) }),
      context,
    );
  },
  list_working_users(input, context) {
    return requestWrapped("users", "/calendar/working", compactObject({ date: optionalString(input.date) }), context);
  },
  list_tasks(input, context) {
    return requestWrapped("tasks", "/tasks", buildListTasksQuery(input), context);
  },
  get_task(input, context) {
    return requestWrapped("task", `/tasks/${encodeURIComponent(String(input.taskId))}`, {}, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, slingActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const session = await requestSlingJson({
      path: "/account/session",
      apiKey: input.apiKey,
      query: {},
      fetcher,
      phase: "validate",
      signal,
    });
    const sessionRecord = requiredProviderRecord(session, "Sling session");
    const user = optionalRecord(sessionRecord.user);
    const org = optionalRecord(sessionRecord.org);
    const accountId = typeof user?.id === "number" || typeof user?.id === "string" ? String(user.id) : "api_key";
    const fullName = [optionalString(user?.name), optionalString(user?.lastname)].filter(Boolean).join(" ");
    const email = optionalString(user?.email);
    const orgName = optionalString(org?.name);

    return {
      profile: {
        accountId,
        displayName: fullName || email || orgName || "Sling Account",
        grantedScopes: [],
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: slingApiBaseUrl,
        orgId: typeof sessionRecord.orgId === "number" ? sessionRecord.orgId : undefined,
        orgName,
        userEmail: email,
      }),
    };
  },
};

async function requestWrapped(
  key: string,
  path: string,
  query: Record<string, SlingQueryValue | undefined>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  return {
    [key]: await requestSlingJson({
      path,
      apiKey: context.apiKey,
      query,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    }),
  };
}

async function requestSlingJson(input: {
  path: string;
  apiKey: string;
  query: Record<string, SlingQueryValue | undefined>;
  fetcher: typeof fetch;
  phase: SlingPhase;
  signal?: AbortSignal;
}): Promise<unknown> {
  return runProviderRequest({ signal: input.signal, label: "Sling" }, async (signal) => {
    const response = await input.fetcher(buildSlingUrl(input.path, input.query), {
      method: "GET",
      headers: {
        Authorization: input.apiKey,
        Accept: "application/json",
        "User-Agent": providerUserAgent,
      },
      signal,
    });
    const payload = await readSlingPayload(response, { allowPlainText: !response.ok });
    if (!response.ok) throw createSlingError(response.status, payload, input.phase);
    return payload ?? {};
  });
}

function buildSlingUrl(path: string, query: Record<string, SlingQueryValue | undefined>): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${slingApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return url;
}

async function readSlingPayload(response: Response, options: { allowPlainText?: boolean } = {}): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (options.allowPlainText) return text.trim();
    throw new ProviderRequestError(502, "Sling returned invalid JSON");
  }
}

function createSlingError(status: number, payload: unknown, phase: SlingPhase): ProviderRequestError {
  const message = extractSlingErrorMessage(payload) ?? `Sling request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && status >= 400 && status < 500) return new ProviderRequestError(400, message, payload);
  if (phase === "execute" && status === 401) return new ProviderRequestError(401, message, payload);
  if (phase === "execute" && status >= 400 && status < 500) return new ProviderRequestError(status, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : status || 500, message, payload);
}

function extractSlingErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.detail);
}

function buildListUsersQuery(input: Record<string, unknown>): Record<string, SlingQueryValue | undefined> {
  return compactObject({
    query: optionalString(input.query),
    ids: readIntegerArray(input.ids),
    includeDeleted: optionalBoolean(input.includeDeleted),
  });
}

function buildListGroupsQuery(input: Record<string, unknown>): Record<string, SlingQueryValue | undefined> {
  return compactObject({
    ids: readIntegerArray(input.ids),
    type: optionalString(input.type),
  });
}

function buildCalendarEventsQuery(input: Record<string, unknown>): Record<string, SlingQueryValue | undefined> {
  return compactObject({
    dates: optionalString(input.dates),
    locationIds: readIntegerArray(input.locationIds),
    positionIds: readIntegerArray(input.positionIds),
    tagIds: readIntegerArray(input.tagIds),
    excludeTagIds: readIntegerArray(input.excludeTagIds),
    userIds: readIntegerArray(input.userIds),
    groupIds: readIntegerArray(input.groupIds),
    excludeGroupIds: readIntegerArray(input.excludeGroupIds),
    dayPartIds: readIntegerArray(input.dayPartIds),
    excludeDayPartIds: readIntegerArray(input.excludeDayPartIds),
    eventTypes: readStringArray(input.eventTypes),
    groupBy: optionalString(input.groupBy),
    pageSize: readOptionalNumber(input.pageSize),
    page: readOptionalNumber(input.page),
    skipUnscheduled: optionalBoolean(input.skipUnscheduled),
    showPlanningEvents: optionalBoolean(input.showPlanningEvents),
  });
}

function buildListTasksQuery(input: Record<string, unknown>): Record<string, SlingQueryValue | undefined> {
  return compactObject({
    filter: optionalString(input.filter),
    since: readOptionalNumber(input.since),
    before: readOptionalNumber(input.before),
    pagesize: readOptionalNumber(input.pageSize),
  });
}

function readIntegerArray(value: unknown): number[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is number => Number.isInteger(item)) : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function requiredProviderRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `${label} must be an object`);
  return record;
}
