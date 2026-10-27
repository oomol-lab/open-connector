import type { PollContext, PollDefinition, PollEvent, PollResult } from "../../triggers/common/poll.ts";
import type { ConnectorProxyResult } from "../../triggers/common/proxy.ts";
import type { JsonValue } from "../../triggers/common/types.ts";

import {
  eventsPollOutputs,
  maximumPollEventsPerPage,
  PermanentPollError,
  PollConnectionError,
  TransientPollError,
} from "../../triggers/common/poll.ts";
import { snapshot } from "./trigger-on-event-changed.definition.ts";

type Change = "cancelled" | "created" | "updated";

interface Config {
  readonly calendarId: string;
  readonly changes: ReadonlySet<Change>;
  readonly matchTerm: string;
  readonly maxEventsPerPoll: number;
}

interface IncrementalCheckpoint {
  readonly calendarId?: string;
  readonly pageToken?: string;
  readonly syncToken: string;
}

interface SeedCheckpoint {
  readonly calendarId?: string;
  readonly pageToken?: string;
  readonly seedTimeMin: string;
}

interface Event {
  readonly attendees?: readonly { readonly email?: string }[];
  readonly created?: string;
  readonly creator?: { readonly email?: string };
  readonly description?: string;
  readonly end?: Readonly<Record<string, JsonValue>>;
  readonly etag?: string;
  readonly eventType?: string;
  readonly htmlLink?: string;
  readonly id?: string;
  readonly location?: string;
  readonly organizer?: { readonly email?: string };
  readonly recurringEventId?: string;
  readonly start?: Readonly<Record<string, JsonValue>> & { readonly date?: string };
  readonly status?: string;
  readonly summary?: string;
  readonly updated?: string;
}

interface Page {
  readonly items?: readonly Event[];
  readonly nextPageToken?: string;
  readonly nextSyncToken?: string;
}

const quotaReasons = new Set(["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded", "usageLimits"]);

export const googleCalendarEventChanged: PollDefinition = {
  buildOutputs: eventsPollOutputs,
  snapshot,
  async poll(context) {
    const config = resolveConfig(context.config);
    if (context.checkpoint === null) return seed(context, config, context.now.toISOString());
    const checkpoint = readCheckpoint(context.checkpoint);
    if (checkpoint.calendarId !== config.calendarId) return seed(context, config, context.now.toISOString());
    if ("seedTimeMin" in checkpoint) return seed(context, config, checkpoint.seedTimeMin, checkpoint.pageToken);
    return incremental(context, config, checkpoint);
  },
};

function resolveConfig(value: Readonly<Record<string, JsonValue>>): Config {
  return {
    calendarId: value.calendarId as string,
    changes: new Set(value.changes as readonly Change[]),
    matchTerm: (value.matchTerm as string).trim(),
    maxEventsPerPoll: value.maxEventsPerPoll as number,
  };
}

function readCheckpoint(value: JsonValue): IncrementalCheckpoint | SeedCheckpoint {
  const checkpoint = record(value);
  const pageToken = typeof checkpoint?.pageToken == "string" ? checkpoint.pageToken : undefined;
  const calendarId = typeof checkpoint?.calendarId == "string" ? checkpoint.calendarId : undefined;
  if (typeof checkpoint?.syncToken == "string" && checkpoint.syncToken.length > 0) {
    return {
      calendarId,
      ...(pageToken == null ? {} : { pageToken }),
      syncToken: checkpoint.syncToken,
    };
  }
  if (typeof checkpoint?.seedTimeMin == "string" && checkpoint.seedTimeMin.length > 0) {
    return {
      calendarId,
      ...(pageToken == null ? {} : { pageToken }),
      seedTimeMin: checkpoint.seedTimeMin,
    };
  }
  throw new PermanentPollError("Google Calendar checkpoint is invalid; recreate the Trigger.");
}

async function seed(
  context: PollContext,
  config: Config,
  timeMin: string,
  startPageToken?: string,
): Promise<PollResult> {
  let pageToken = startPageToken;
  for (let page = 0; page < 2; page += 1) {
    const result = await list(context, config.calendarId, {
      maxResults: 2_500,
      pageToken,
      showDeleted: "true",
      singleEvents: "false",
      timeMin,
    });
    if (pageToken != null && stalePage(result))
      return { checkpoint: { calendarId: config.calendarId, seedTimeMin: timeMin }, events: [] };
    success(context, result, "seed full sync");
    const parsed = (record(result.data) ?? {}) as Page;
    if (parsed.nextSyncToken)
      return {
        checkpoint: { calendarId: config.calendarId, syncToken: parsed.nextSyncToken },
        events: [],
      };
    if (!parsed.nextPageToken) throw new TransientPollError("Google Calendar seed response has no continuation token.");
    pageToken = parsed.nextPageToken;
  }
  return {
    checkpoint: {
      calendarId: config.calendarId,
      ...(pageToken == null ? {} : { pageToken }),
      seedTimeMin: timeMin,
    },
    events: [],
    hasMore: true,
  };
}

async function incremental(
  context: PollContext,
  config: Config,
  checkpoint: IncrementalCheckpoint,
): Promise<PollResult> {
  const events: PollEvent[] = [];
  let filtered = 0;
  const result = await list(context, config.calendarId, {
    maxResults: Math.min(config.maxEventsPerPoll, maximumPollEventsPerPage),
    pageToken: checkpoint.pageToken,
    showDeleted: "true",
    singleEvents: "false",
    syncToken: checkpoint.syncToken,
  });
  if (checkpoint.pageToken != null && stalePage(result)) {
    return {
      checkpoint: { calendarId: config.calendarId, syncToken: checkpoint.syncToken },
      events,
      filtered,
    };
  }
  success(context, result, "incremental sync");
  const parsed = (record(result.data) ?? {}) as Page;
  for (const item of parsed.items ?? []) {
    if (item.id == null || item.id.length == 0) continue;
    const change = classify(item);
    if (!config.changes.has(change) || !matches(item, config.matchTerm)) {
      filtered += 1;
      continue;
    }
    events.push(event(item, item.id, change, config.calendarId));
  }
  if (parsed.nextSyncToken) {
    return {
      checkpoint: { calendarId: config.calendarId, syncToken: parsed.nextSyncToken },
      events,
      filtered,
    };
  }
  if (!parsed.nextPageToken) throw new TransientPollError("Google Calendar sync response has no continuation token.");
  return {
    checkpoint: {
      calendarId: config.calendarId,
      pageToken: parsed.nextPageToken,
      syncToken: checkpoint.syncToken,
    },
    events,
    filtered,
    hasMore: true,
  };
}

function classify(value: Event): Change {
  if (value.status == "cancelled") return "cancelled";
  const created = epochSecond(value.created);
  const updated = epochSecond(value.updated);
  return created != null && created == updated ? "created" : "updated";
}

function matches(value: Event, term: string): boolean {
  if (term.length == 0) return true;
  const needle = term.toLowerCase();
  return [value.summary, value.description, value.location, ...(value.attendees ?? []).map(({ email }) => email)].some(
    (candidate) => typeof candidate == "string" && candidate.toLowerCase().includes(needle),
  );
}

function event(item: Event, eventId: string, change: Change, calendarId: string): PollEvent {
  return {
    dedupeKey: `${eventId}:${item.updated ?? item.etag ?? ""}`,
    payload: {
      attendeeEmails: (item.attendees ?? []).flatMap(({ email }) =>
        email == null || email.length == 0 ? [] : [email],
      ),
      calendarId,
      changeType: change,
      created: iso(item.created),
      creatorEmail: item.creator?.email ?? null,
      description: item.description ?? null,
      end: item.end ?? null,
      eventId,
      eventType: item.eventType ?? null,
      htmlLink: item.htmlLink ?? null,
      isAllDay: item.start?.date != null,
      location: item.location ?? null,
      organizerEmail: item.organizer?.email ?? null,
      recurringEventId: item.recurringEventId ?? null,
      start: item.start ?? null,
      status: item.status ?? "",
      summary: item.summary ?? null,
      updated: iso(item.updated),
    },
  };
}

async function list(
  context: PollContext,
  calendarId: string,
  query: Readonly<Record<string, number | string | undefined>>,
): Promise<ConnectorProxyResult> {
  const endpoint = `/calendars/${encodeURIComponent(calendarId)}/events`;
  try {
    return await context.connector.execute(
      {
        endpoint,
        method: "GET",
        query: Object.fromEntries(
          Object.entries(query).filter((entry): entry is [string, number | string] => entry[1] != null),
        ),
      },
      context.signal,
    );
  } catch (cause) {
    throw new TransientPollError(`Google Calendar proxy request to ${endpoint} failed.`, { cause });
  }
}

function success(context: PollContext, result: ConnectorProxyResult, operation: string): void {
  if (result.status >= 200 && result.status < 300) return;
  if (result.status == 410 || (result.status == 400 && fullSyncRequired(result.data))) {
    throw new PermanentPollError("Google Calendar sync token expired; recreate the Trigger.");
  }
  if (result.status == 400 || (result.status == 404 && context.checkpoint === null)) {
    throw new PermanentPollError(`Google Calendar ${operation} rejected the configuration.`);
  }
  if (result.status == 401) throw new PollConnectionError(`Google Calendar ${operation} rejected the Connection.`);
  if (result.status == 403) {
    if (reasons(result.data).some((reason) => quotaReasons.has(reason))) {
      throw new TransientPollError(`Google Calendar ${operation} was rate limited.`);
    }
    throw new PollConnectionError(`Google Calendar ${operation} rejected the Connection.`);
  }
  throw new TransientPollError(`Google Calendar ${operation} failed with status ${result.status}.`);
}

function stalePage(result: ConnectorProxyResult): boolean {
  return result.status == 400 && !fullSyncRequired(result.data);
}

function reasons(data: unknown): readonly string[] {
  const errors = record(record(data)?.error)?.errors;
  if (!Array.isArray(errors)) return [];
  return errors.flatMap((value) => {
    const reason = record(value)?.reason;
    return typeof reason == "string" ? [reason] : [];
  });
}

function fullSyncRequired(data: unknown): boolean {
  if (reasons(data).includes("fullSyncRequired")) return true;
  const message = record(record(data)?.error)?.message;
  return typeof message == "string" && message.includes("fullSyncRequired");
}

function iso(value: string | undefined): string | null {
  if (value == null || value.length == 0) return null;
  const milliseconds = Date.parse(value);
  return Number.isNaN(milliseconds) ? null : new Date(milliseconds).toISOString();
}

function epochSecond(value: string | undefined): number | null {
  if (value == null || value.length == 0) return null;
  const milliseconds = Date.parse(value);
  return Number.isNaN(milliseconds) ? null : Math.floor(milliseconds / 1_000);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value == "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
