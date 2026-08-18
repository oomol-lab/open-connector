import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";
import type { GooglecalendarActionName } from "./actions.ts";

import {
  compactObject,
  optionalString,
  pickOptionalBoolean,
  pickOptionalInteger,
  pickOptionalString,
  requiredRecord,
} from "../../core/cast.ts";
import { defineOAuthProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";
import { googlecalendarEventActionHandlers } from "./runtime-events.ts";
import {
  googlecalendarApiBaseUrl,
  googlecalendarJsonRequest,
  googlecalendarRequest,
  resolveCalendarId,
  resolveRuleId,
  resolveSettingId,
} from "./runtime-shared.ts";

type GooglecalendarRuntimeDeps = OAuthProviderContext;

type GooglecalendarActionHandler = (
  input: Record<string, unknown>,
  deps: GooglecalendarRuntimeDeps,
) => Promise<unknown>;

type FreeBusyError = {
  domain?: string;
  reason?: string;
};

type FreeBusyGroup = {
  calendars?: unknown;
  errors?: unknown;
};

type FreeBusyCalendar = {
  busy?: unknown;
  errors?: unknown;
};

type FreeBusyResponse = {
  kind?: string;
  timeMin?: string;
  timeMax?: string;
  calendars?: Record<string, FreeBusyCalendar>;
  groups?: Record<string, FreeBusyGroup>;
};

type BusyWindow = {
  start: string;
  end: string;
  startMs: number;
  endMs: number;
};

function asObject(value: unknown): Record<string, unknown> {
  return requiredRecord(value, "object input", (message) => new ProviderRequestError(400, message));
}

const calendarWritableKeys = ["summary", "description", "location", "timeZone"] as const;
const calendarListEntryWritableKeys = [
  "summaryOverride",
  "backgroundColor",
  "foregroundColor",
  "selected",
  "hidden",
  "defaultReminders",
  "notificationSettings",
] as const;
const aclRuleWritableKeys = ["scope", "role"] as const;

export const googlecalendarActionHandlers: Record<GooglecalendarActionName, GooglecalendarActionHandler> = {
  list_calendars(input, deps) {
    return listCalendars(input, deps);
  },
  get_calendar_list_entry(input, deps) {
    return getCalendarListEntry(input, deps);
  },
  add_calendar_to_list(input, deps) {
    return addCalendarToList(input, deps);
  },
  update_calendar_list_entry(input, deps) {
    return updateCalendarListEntry(input, deps);
  },
  patch_calendar_list_entry(input, deps) {
    return patchCalendarListEntry(input, deps);
  },
  remove_calendar_from_list(input, deps) {
    return removeCalendarFromList(input, deps);
  },
  get_calendar(input, deps) {
    return getCalendar(input, deps);
  },
  create_calendar(input, deps) {
    return createCalendar(input, deps);
  },
  update_calendar(input, deps) {
    return updateCalendar(input, deps);
  },
  patch_calendar(input, deps) {
    return patchCalendar(input, deps);
  },
  delete_calendar(input, deps) {
    return deleteCalendar(input, deps);
  },
  clear_calendar(input, deps) {
    return clearCalendar(input, deps);
  },
  list_events: googlecalendarEventActionHandlers.list_events,
  list_events_all_calendars: googlecalendarEventActionHandlers.list_events_all_calendars,
  get_event: googlecalendarEventActionHandlers.get_event,
  create_event: googlecalendarEventActionHandlers.create_event,
  update_event: googlecalendarEventActionHandlers.update_event,
  patch_event: googlecalendarEventActionHandlers.patch_event,
  delete_event: googlecalendarEventActionHandlers.delete_event,
  import_event: googlecalendarEventActionHandlers.import_event,
  move_event: googlecalendarEventActionHandlers.move_event,
  list_event_instances: googlecalendarEventActionHandlers.list_event_instances,
  quick_add_event: googlecalendarEventActionHandlers.quick_add_event,
  sync_events: googlecalendarEventActionHandlers.sync_events,
  free_busy_query(input, deps) {
    return freeBusyQuery(input, deps);
  },
  find_free_slots(input, deps) {
    return findFreeSlots(input, deps);
  },
  get_colors(input, deps) {
    return getColors(input, deps);
  },
  list_settings(input, deps) {
    return listSettings(input, deps);
  },
  get_setting(input, deps) {
    return getSetting(input, deps);
  },
  list_acl(input, deps) {
    return listAcl(input, deps);
  },
  get_acl_rule(input, deps) {
    return getAclRule(input, deps);
  },
  create_acl_rule(input, deps) {
    return createAclRule(input, deps);
  },
  update_acl_rule(input, deps) {
    return updateAclRule(input, deps);
  },
  patch_acl_rule(input, deps) {
    return patchAclRule(input, deps);
  },
  delete_acl_rule(input, deps) {
    return deleteAclRule(input, deps);
  },
  find_event: googlecalendarEventActionHandlers.find_event,
  add_attendee: googlecalendarEventActionHandlers.add_attendee,
  remove_attendee: googlecalendarEventActionHandlers.remove_attendee,
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors(
  "googlecalendar",
  googlecalendarActionHandlers,
);

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const profile: {
      email?: string;
      name?: string;
      sub?: string;
    } = await googlecalendarJsonRequest<{
      email?: string;
      name?: string;
      sub?: string;
    }>("https://www.googleapis.com/oauth2/v3/userinfo", {
      accessToken: input.accessToken,
      fetcher,
      signal,
    }).catch(
      async (): Promise<{
        email?: string;
        name?: string;
        sub?: string;
      }> => {
        await googlecalendarJsonRequest<Record<string, unknown>>(`${googlecalendarApiBaseUrl}/users/me/calendarList`, {
          accessToken: input.accessToken,
          fetcher,
          signal,
        });
        return {};
      },
    );

    return {
      profile: {
        accountId: profile.email ?? profile.sub ?? "googlecalendar:oauth2",
        displayName: profile.name ?? profile.email ?? "Google Calendar User",
      },
      metadata: {
        currentAccount: profile,
      },
    };
  },
};

async function listCalendars(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarRuntimeDeps) {
  const query = compactObject({
    maxResults: stringifyInteger(pickOptionalInteger(input, "maxResults")),
    pageToken: pickOptionalString(input, "pageToken"),
    syncToken: pickOptionalString(input, "syncToken"),
    showHidden: stringifyBoolean(pickOptionalBoolean(input, "showHidden")),
    showDeleted: stringifyBoolean(pickOptionalBoolean(input, "showDeleted")),
    minAccessRole: optionalString(input.minAccessRole),
  });

  return googlecalendarJsonRequest(`${googlecalendarApiBaseUrl}/users/me/calendarList`, {
    accessToken,
    fetcher,
    query,
    syncTokenAware: query.syncToken !== undefined,
  });
}

async function getCalendarListEntry(
  input: Record<string, unknown>,
  { accessToken, fetcher }: GooglecalendarRuntimeDeps,
) {
  return googlecalendarJsonRequest(calendarListEntryUrl(resolveCalendarId(input)), {
    accessToken,
    fetcher,
  });
}

async function addCalendarToList(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarRuntimeDeps) {
  return googlecalendarJsonRequest(`${googlecalendarApiBaseUrl}/users/me/calendarList`, {
    accessToken,
    fetcher,
    body: {
      id: resolveCalendarId(input),
    },
  });
}

async function updateCalendarListEntry(
  input: Record<string, unknown>,
  { accessToken, fetcher }: GooglecalendarRuntimeDeps,
) {
  const calendarId = resolveCalendarId(input);
  const entry = pickWritableFields(asObject(input.entry), calendarListEntryWritableKeys);
  const url = calendarListEntryUrl(calendarId);
  const current = await googlecalendarJsonRequest<Record<string, unknown>>(url, {
    accessToken,
    fetcher,
  });

  return googlecalendarJsonRequest(url, {
    accessToken,
    fetcher,
    method: "PUT",
    body: {
      ...pickWritableFields(current, calendarListEntryWritableKeys),
      ...entry,
    },
  });
}

async function patchCalendarListEntry(
  input: Record<string, unknown>,
  { accessToken, fetcher }: GooglecalendarRuntimeDeps,
) {
  return googlecalendarJsonRequest(calendarListEntryUrl(resolveCalendarId(input)), {
    accessToken,
    fetcher,
    method: "PATCH",
    body: pickWritableFields(asObject(input.entry), calendarListEntryWritableKeys),
  });
}

async function removeCalendarFromList(input: Record<string, unknown>, deps: GooglecalendarRuntimeDeps) {
  return deleteWithSuccess(calendarListEntryUrl(resolveCalendarId(input)), deps);
}

async function getCalendar(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarRuntimeDeps) {
  return googlecalendarJsonRequest(calendarUrl(resolveCalendarId(input)), {
    accessToken,
    fetcher,
  });
}

async function createCalendar(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarRuntimeDeps) {
  return googlecalendarJsonRequest(`${googlecalendarApiBaseUrl}/calendars`, {
    accessToken,
    fetcher,
    body: pickWritableFields(input, calendarWritableKeys),
  });
}

async function updateCalendar(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarRuntimeDeps) {
  const calendarId = resolveCalendarId(input);
  const calendar = pickWritableFields(asObject(input.calendar), calendarWritableKeys);
  const url = calendarUrl(calendarId);
  const current = await googlecalendarJsonRequest<Record<string, unknown>>(url, {
    accessToken,
    fetcher,
  });

  return googlecalendarJsonRequest(url, {
    accessToken,
    fetcher,
    method: "PUT",
    body: {
      ...pickWritableFields(current, calendarWritableKeys),
      ...calendar,
    },
  });
}

async function patchCalendar(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarRuntimeDeps) {
  return googlecalendarJsonRequest(calendarUrl(resolveCalendarId(input)), {
    accessToken,
    fetcher,
    method: "PATCH",
    body: pickWritableFields(asObject(input.calendar), calendarWritableKeys),
  });
}

async function deleteCalendar(input: Record<string, unknown>, deps: GooglecalendarRuntimeDeps) {
  return deleteWithSuccess(calendarUrl(resolveCalendarId(input)), deps);
}

async function clearCalendar(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarRuntimeDeps) {
  await googlecalendarRequest(`${calendarUrl(resolveCalendarId(input))}/clear`, {
    accessToken,
    fetcher,
    method: "POST",
  });
  return { success: true };
}

async function freeBusyQuery(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarRuntimeDeps) {
  return queryFreeBusy(input, { accessToken, fetcher });
}

async function findFreeSlots(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarRuntimeDeps) {
  const requestBody = buildFreeBusyRequestBody(input);
  const response = await queryFreeBusy(input, { accessToken, fetcher });
  const calendars = asRecord<FreeBusyCalendar>(response.calendars);
  const groups = asRecord<FreeBusyGroup>(response.groups);
  const groupIssues = collectDerivedGroupIssues(groups, requestBody.groupExpansionMax, requestBody.items);
  const explicitGroupIds = new Set(Object.keys(groups));
  const explicitCalendarIds = new Set(requestBody.items.map(({ id }) => id).filter((id) => !explicitGroupIds.has(id)));
  const calendarIds = new Set<string>([...Object.keys(calendars), ...explicitCalendarIds, ...Object.keys(groupIssues)]);

  return {
    kind: response.kind ?? "calendar#freeBusy",
    timeMin: response.timeMin ?? requestBody.timeMin,
    timeMax: response.timeMax ?? requestBody.timeMax,
    calendars: Object.fromEntries(
      [...calendarIds].map((calendarId) => {
        const calendarValue = calendars[calendarId];
        const calendar = asRecord<FreeBusyCalendar>(calendarValue);
        const busy = normalizeBusyWindows(calendar.busy, requestBody.timeMin, requestBody.timeMax);
        const errors = [
          ...normalizeCalendarErrors(calendar.errors),
          ...(calendarValue === undefined && explicitCalendarIds.has(calendarId)
            ? [{ code: "provider_error", message: "calendar missing from freeBusy response" }]
            : []),
          ...(explicitCalendarIds.has(calendarId) ? [] : (groupIssues[calendarId] ?? [])),
        ];
        const isReliable = errors.length === 0;

        return [
          calendarId,
          compactObject({
            busy: busy.map(({ start, end }) => ({ start, end })),
            free: isReliable ? findFreeWindows(busy, requestBody.timeMin, requestBody.timeMax) : [],
            isReliable,
            errors: errors.length > 0 ? errors : undefined,
          }),
        ];
      }),
    ),
  };
}

async function getColors(_input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarRuntimeDeps) {
  return googlecalendarJsonRequest(`${googlecalendarApiBaseUrl}/colors`, {
    accessToken,
    fetcher,
  });
}

async function listSettings(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarRuntimeDeps) {
  const query = compactObject({
    maxResults: stringifyInteger(pickOptionalInteger(input, "maxResults")),
    pageToken: pickOptionalString(input, "pageToken"),
    syncToken: pickOptionalString(input, "syncToken"),
  });

  return googlecalendarJsonRequest(`${googlecalendarApiBaseUrl}/users/me/settings`, {
    accessToken,
    fetcher,
    query,
    syncTokenAware: query.syncToken !== undefined,
  });
}

async function getSetting(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarRuntimeDeps) {
  return googlecalendarJsonRequest(settingUrl(resolveSettingId(input)), {
    accessToken,
    fetcher,
  });
}

async function listAcl(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarRuntimeDeps) {
  const query = compactObject({
    maxResults: stringifyInteger(pickOptionalInteger(input, "maxResults") ?? 100),
    pageToken: pickOptionalString(input, "pageToken"),
    syncToken: pickOptionalString(input, "syncToken"),
    showDeleted: stringifyBoolean(pickOptionalBoolean(input, "showDeleted")),
  });

  return googlecalendarJsonRequest(`${calendarUrl(resolveCalendarId(input))}/acl`, {
    accessToken,
    fetcher,
    query,
    syncTokenAware: query.syncToken !== undefined,
  });
}

async function getAclRule(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarRuntimeDeps) {
  return googlecalendarJsonRequest(aclRuleUrl(resolveCalendarId(input), resolveRuleId(input)), {
    accessToken,
    fetcher,
  });
}

async function createAclRule(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarRuntimeDeps) {
  return googlecalendarJsonRequest(`${calendarUrl(resolveCalendarId(input))}/acl`, {
    accessToken,
    fetcher,
    body: pickWritableFields(asObject(input.rule), aclRuleWritableKeys),
  });
}

async function updateAclRule(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarRuntimeDeps) {
  const calendarId = resolveCalendarId(input);
  const ruleId = resolveRuleId(input);
  const rule = pickWritableFields(asObject(input.rule), aclRuleWritableKeys);
  const url = aclRuleUrl(calendarId, ruleId);
  const current = await googlecalendarJsonRequest<Record<string, unknown>>(url, {
    accessToken,
    fetcher,
  });

  return googlecalendarJsonRequest(url, {
    accessToken,
    fetcher,
    method: "PUT",
    body: {
      ...pickWritableFields(current, aclRuleWritableKeys),
      ...rule,
    },
  });
}

async function patchAclRule(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarRuntimeDeps) {
  return googlecalendarJsonRequest(aclRuleUrl(resolveCalendarId(input), resolveRuleId(input)), {
    accessToken,
    fetcher,
    method: "PATCH",
    body: pickWritableFields(asObject(input.rule), aclRuleWritableKeys),
  });
}

async function deleteAclRule(input: Record<string, unknown>, deps: GooglecalendarRuntimeDeps) {
  return deleteWithSuccess(aclRuleUrl(resolveCalendarId(input), resolveRuleId(input)), deps);
}

async function queryFreeBusy(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarRuntimeDeps) {
  return googlecalendarJsonRequest<FreeBusyResponse>(`${googlecalendarApiBaseUrl}/freeBusy`, {
    accessToken,
    fetcher,
    body: buildFreeBusyRequestBody(input),
  });
}

function buildFreeBusyRequestBody(input: Record<string, unknown>) {
  return {
    items: normalizeFreeBusyItems(input.items),
    timeMin: requireInputString(input, "timeMin", "timeMin"),
    timeMax: requireInputString(input, "timeMax", "timeMax"),
    timeZone: pickOptionalString(input, "timeZone") ?? "UTC",
    groupExpansionMax: pickOptionalInteger(input, "groupExpansionMax") ?? 100,
    calendarExpansionMax: pickOptionalInteger(input, "calendarExpansionMax") ?? 50,
  };
}

function normalizeFreeBusyItems(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, "items must contain at least one entry");
  }

  return value.map((item) => {
    if (typeof item === "string" && item.length > 0) {
      return { id: item };
    }

    return {
      id: requireInputString(asObject(item), "id", "id"),
    };
  });
}

function normalizeBusyWindows(value: unknown, windowStart: string, windowEnd: string): BusyWindow[] {
  if (!Array.isArray(value)) {
    return [] as BusyWindow[];
  }

  const rangeStart = Date.parse(windowStart);
  const rangeEnd = Date.parse(windowEnd);
  const windows = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const start = optionalString((item as Record<string, unknown>).start);
      const end = optionalString((item as Record<string, unknown>).end);
      if (!start || !end) {
        return null;
      }

      const startMs = Math.max(Date.parse(start), rangeStart);
      const endMs = Math.min(Date.parse(end), rangeEnd);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
        return null;
      }

      return {
        start: startMs === Date.parse(start) ? start : windowStart,
        end: endMs === Date.parse(end) ? end : windowEnd,
        startMs,
        endMs,
      };
    })
    .filter((item): item is BusyWindow => item !== null)
    .sort((left, right) => left.startMs - right.startMs);

  if (windows.length === 0) {
    return windows;
  }

  const merged: BusyWindow[] = [windows[0]!];
  for (const window of windows.slice(1)) {
    const current = merged[merged.length - 1]!;
    if (window.startMs <= current.endMs) {
      current.endMs = Math.max(current.endMs, window.endMs);
      if (window.endMs >= current.endMs) {
        current.end = window.end;
      }
      continue;
    }
    merged.push(window);
  }

  return merged;
}

function findFreeWindows(busy: BusyWindow[], timeMin: string, timeMax: string) {
  const rangeStart = Date.parse(timeMin);
  const rangeEnd = Date.parse(timeMax);
  let cursorMs = rangeStart;
  let cursor = timeMin;
  const free: Array<{ start: string; end: string }> = [];

  for (const window of busy) {
    if (cursorMs < window.startMs) {
      free.push({
        start: cursor,
        end: window.start,
      });
    }

    if (window.endMs > cursorMs) {
      cursorMs = window.endMs;
      cursor = window.end;
    }
  }

  if (cursorMs < rangeEnd) {
    free.push({
      start: cursor,
      end: timeMax,
    });
  }

  return free.filter(({ start, end }) => Date.parse(end) > Date.parse(start));
}

function collectDerivedGroupIssues(
  groups: Record<string, FreeBusyGroup | undefined>,
  groupExpansionMax: number,
  items: Array<{ id: string }>,
) {
  const explicitInputIds = new Set(items.map(({ id }) => id));
  const issues: Record<string, Array<{ code: string; message: string }>> = {};

  for (const group of Object.values(groups)) {
    if (!group || typeof group !== "object") {
      continue;
    }

    const groupCalendars = Array.isArray(group.calendars)
      ? group.calendars.filter((calendarId): calendarId is string => typeof calendarId === "string")
      : [];
    const groupErrors = normalizeGroupErrors(group.errors);
    const isExpansionLimited = groupCalendars.length >= groupExpansionMax;

    if (groupErrors.length === 0 && !isExpansionLimited) {
      continue;
    }

    for (const calendarId of groupCalendars) {
      if (explicitInputIds.has(calendarId)) {
        continue;
      }

      const calendarIssues = issues[calendarId] ?? [];
      calendarIssues.push(...groupErrors);
      if (isExpansionLimited) {
        calendarIssues.push({
          code: "provider_error",
          message: "calendar reliability is degraded by group expansion limits",
        });
      }
      issues[calendarId] = calendarIssues;
    }
  }

  return issues;
}

function normalizeCalendarErrors(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const reason = optionalString((item as Record<string, unknown>).reason);
      if (!reason) {
        return null;
      }

      return {
        code: reason,
        message: `calendar returned error: ${reason}`,
      };
    })
    .filter((item): item is { code: string; message: string } => item !== null);
}

function normalizeGroupErrors(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const reason = optionalString((item as FreeBusyError).reason);
      if (!reason) {
        return null;
      }

      return {
        code: "provider_error",
        message: `calendar reliability is degraded by group error: ${reason}`,
      };
    })
    .filter((item): item is { code: string; message: string } => item !== null);
}

async function deleteWithSuccess(url: string, { accessToken, fetcher }: GooglecalendarRuntimeDeps) {
  await googlecalendarRequest(url, {
    accessToken,
    fetcher,
    method: "DELETE",
  });
  return { success: true };
}

function pickWritableFields<const T extends readonly string[]>(input: Record<string, unknown>, keys: T) {
  return Object.fromEntries(keys.flatMap((key) => (input[key] === undefined ? [] : [[key, input[key]]])));
}

function requireInputString(input: Record<string, unknown>, field: string, ...keys: string[]) {
  const value = pickOptionalString(input, ...keys);
  if (!value) {
    throw new ProviderRequestError(400, `${field} is required`);
  }
  return value;
}

function stringifyBoolean(value: boolean | undefined) {
  return value === undefined ? undefined : String(value);
}

function stringifyInteger(value: number | undefined) {
  return value === undefined ? undefined : String(value);
}

function calendarListEntryUrl(calendarId: string) {
  return `${googlecalendarApiBaseUrl}/users/me/calendarList/${encodeURIComponent(calendarId)}`;
}

function calendarUrl(calendarId: string) {
  return `${googlecalendarApiBaseUrl}/calendars/${encodeURIComponent(calendarId)}`;
}

function settingUrl(settingId: string) {
  return `${googlecalendarApiBaseUrl}/users/me/settings/${encodeURIComponent(settingId)}`;
}

function aclRuleUrl(calendarId: string, ruleId: string) {
  return `${calendarUrl(calendarId)}/acl/${encodeURIComponent(ruleId)}`;
}

function asRecord<T>(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, T | undefined>;
  }

  return value as Record<string, T | undefined>;
}
