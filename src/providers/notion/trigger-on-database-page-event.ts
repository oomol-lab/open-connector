import type { PollContext, PollDefinition, PollEvent, PollResult } from "../../triggers/common/poll.ts";
import type { ConnectorProxyRequest, ConnectorProxyResult } from "../../triggers/common/proxy.ts";
import type { JsonValue } from "../../triggers/common/types.ts";

import {
  eventsPollOutputs,
  PermanentPollError,
  PollConnectionError,
  TransientPollError,
} from "../../triggers/common/poll.ts";
import { snapshot } from "./trigger-on-database-page-event.definition.ts";

type EventKind = "page_added" | "page_updated";
type CursorField = "created_time" | "last_edited_time";

interface Config {
  readonly dataSourceId: string;
  readonly databaseId: string;
  readonly events: readonly EventKind[];
  readonly includeProperties: boolean;
  readonly maxItemsPerPoll: number;
}

interface Checkpoint {
  readonly cursorField: CursorField;
  readonly dataSourceId: string;
  readonly since: string;
  readonly sinceExclusive?: boolean;
  readonly sinceOnly?: boolean;
  readonly startCursor?: string;
  readonly target: string;
}

interface PageValue {
  readonly created_by?: { readonly id?: string };
  readonly created_time?: string;
  readonly id: string;
  readonly last_edited_by?: { readonly id?: string };
  readonly last_edited_time?: string;
  readonly properties?: Readonly<Record<string, JsonValue>>;
  readonly url?: string;
}

interface QueryPage {
  readonly has_more?: boolean;
  readonly next_cursor?: string | null;
  readonly request_status?: { readonly type?: string };
  readonly results?: readonly PageValue[];
}

export const notionDatabasePageEvent: PollDefinition = {
  buildOutputs: eventsPollOutputs,
  snapshot,
  async poll(context) {
    const config = resolveConfig(context.config);
    if (context.checkpoint === null) return seed(context, config);
    const stored = readCheckpoint(context.checkpoint);
    if (stored.target !== target(config)) return seed(context, config);
    return drain(context, config, alignField(stored, cursorField(config.events)));
  },
};

function resolveConfig(value: Readonly<Record<string, JsonValue>>): Config {
  return {
    dataSourceId: value.dataSourceId as string,
    databaseId: value.databaseId as string,
    events: [...new Set<EventKind>(value.events as readonly EventKind[])],
    includeProperties: value.includeProperties as boolean,
    maxItemsPerPoll: value.maxItemsPerPoll as number,
  };
}

async function seed(context: PollContext, config: Config): Promise<PollResult> {
  const dataSourceId = await resolveDataSource(context, config);
  const field = cursorField(config.events);
  const result = await request(context, {
    body: { page_size: 1, sorts: [{ direction: "ascending", timestamp: field }] },
    endpoint: `/data_sources/${encodeURIComponent(dataSourceId)}/query`,
    method: "POST",
  });
  success(result, "seed probe query");
  return {
    checkpoint: {
      cursorField: field,
      dataSourceId,
      since: new Date(Math.ceil(context.now.getTime() / 60_000) * 60_000).toISOString(),
      target: target(config),
    },
    events: [],
  };
}

async function resolveDataSource(context: PollContext, config: Config): Promise<string> {
  const result = await request(context, {
    endpoint: `/databases/${encodeURIComponent(config.databaseId)}`,
    method: "GET",
  });
  success(result, "database resolve");
  const raw = record(result.data)?.data_sources;
  const candidates = Array.isArray(raw)
    ? raw.flatMap((value) => {
        const id = record(value)?.id;
        return typeof id == "string" && id.length > 0 ? [id] : [];
      })
    : [];
  if (config.dataSourceId.length > 0) {
    const wanted = normalizeId(config.dataSourceId);
    const match = candidates.find((id) => normalizeId(id) == wanted);
    if (match == null)
      throw new PermanentPollError("The Notion data source does not belong to the configured database.");
    return match;
  }
  if (candidates.length == 1) return candidates[0]!;
  if (candidates.length == 0) throw new PermanentPollError("The Notion database has no data sources.");
  throw new PermanentPollError("The Notion database has multiple data sources; configure dataSourceId.");
}

function readCheckpoint(value: JsonValue): Checkpoint {
  const checkpoint = record(value);
  const field = checkpoint?.cursorField;
  if (
    typeof checkpoint?.dataSourceId != "string" ||
    checkpoint.dataSourceId.length == 0 ||
    (field !== "created_time" && field !== "last_edited_time") ||
    typeof checkpoint.since != "string" ||
    checkpoint.since.length == 0
  ) {
    throw new PermanentPollError("Notion checkpoint is invalid; recreate the Trigger.");
  }
  return {
    cursorField: field,
    dataSourceId: checkpoint.dataSourceId,
    since: checkpoint.since,
    target: typeof checkpoint.target == "string" ? checkpoint.target : "",
    ...(typeof checkpoint.startCursor == "string" && checkpoint.startCursor.length > 0
      ? { startCursor: checkpoint.startCursor }
      : {}),
    ...(checkpoint.sinceExclusive === true ? { sinceExclusive: true } : {}),
    ...(checkpoint.sinceOnly === true ? { sinceOnly: true } : {}),
  };
}

function cursorField(events: readonly EventKind[]): CursorField {
  return events.length == 1 && events[0] == "page_added" ? "created_time" : "last_edited_time";
}

function alignField(checkpoint: Checkpoint, field: CursorField): Checkpoint {
  return checkpoint.cursorField == field
    ? checkpoint
    : {
        cursorField: field,
        dataSourceId: checkpoint.dataSourceId,
        since: checkpoint.since,
        target: checkpoint.target,
      };
}

async function drain(context: PollContext, config: Config, checkpoint: Checkpoint): Promise<PollResult> {
  const events: PollEvent[] = [];
  let filtered = 0;
  let consumed = 0;
  let newest: string | null = null;
  let startCursor = checkpoint.startCursor;
  let ending: "complete" | "restarted" | "truncated" | { readonly nextCursor: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await request(context, {
      body: queryBody(checkpoint, config.maxItemsPerPoll - consumed, startCursor),
      endpoint: `/data_sources/${encodeURIComponent(checkpoint.dataSourceId)}/query`,
      method: "POST",
    });
    if (result.status == 400 && startCursor != null) {
      ending = "restarted";
      break;
    }
    success(result, "data source query");
    const page = (record(result.data) ?? {}) as QueryPage;
    for (const row of page.results ?? []) {
      consumed += 1;
      const timestamp = checkpoint.cursorField == "created_time" ? row.created_time : row.last_edited_time;
      if (timestamp != null && timestamp.length > 0) newest = later(newest, timestamp);
      const kind = classify(row);
      if (!config.events.includes(kind)) filtered += 1;
      else events.push(event(row, kind, config, checkpoint));
    }
    if (page.request_status?.type == "incomplete") {
      ending = "truncated";
      break;
    }
    if (page.has_more !== true || typeof page.next_cursor != "string" || page.next_cursor.length == 0) {
      ending = "complete";
      break;
    }
    startCursor = page.next_cursor;
    if (consumed >= config.maxItemsPerPoll) {
      ending = { nextCursor: page.next_cursor };
      break;
    }
  }
  if (ending == null) ending = { nextCursor: startCursor! };
  const base = {
    cursorField: checkpoint.cursorField,
    dataSourceId: checkpoint.dataSourceId,
    target: checkpoint.target,
  };
  const next: Checkpoint =
    typeof ending == "object"
      ? {
          ...base,
          since: checkpoint.since,
          startCursor: ending.nextCursor,
          ...modifiers(checkpoint),
        }
      : { ...base, ...advance(checkpoint, ending, newest, context.now) };
  return {
    checkpoint: next as unknown as JsonValue,
    events,
    filtered,
    ...(ending == "complete" ? {} : { hasMore: true }),
  };
}

function advance(
  checkpoint: Checkpoint,
  ending: "complete" | "restarted" | "truncated",
  newest: string | null,
  now: Date,
): Pick<Checkpoint, "since" | "sinceExclusive" | "sinceOnly"> {
  const pinned = { since: checkpoint.since, ...modifiers(checkpoint) };
  const closed = Date.parse(checkpoint.since) + 60_000 <= now.getTime();
  const escaped = closed ? { since: checkpoint.since, sinceExclusive: true as const } : pinned;
  if (newest != null && after(newest, checkpoint.since)) return { since: newest };
  if (ending == "restarted") return pinned;
  if (ending == "complete") return checkpoint.sinceOnly === true || newest != null ? escaped : pinned;
  if (newest == null) return pinned;
  return checkpoint.sinceOnly === true ? escaped : { since: checkpoint.since, sinceOnly: true };
}

function modifiers(checkpoint: Checkpoint): Pick<Checkpoint, "sinceExclusive" | "sinceOnly"> {
  return {
    ...(checkpoint.sinceExclusive === true ? { sinceExclusive: true } : {}),
    ...(checkpoint.sinceOnly === true ? { sinceOnly: true } : {}),
  };
}

function queryBody(checkpoint: Checkpoint, budget: number, startCursor: string | undefined): Record<string, unknown> {
  const field = checkpoint.cursorField;
  const filter =
    checkpoint.sinceOnly === true
      ? {
          and: [
            { [field]: { on_or_after: checkpoint.since }, timestamp: field },
            { [field]: { on_or_before: checkpoint.since }, timestamp: field },
          ],
        }
      : {
          [field]: {
            [checkpoint.sinceExclusive === true ? "after" : "on_or_after"]: checkpoint.since,
          },
          timestamp: field,
        };
  return {
    filter,
    page_size: Math.min(100, budget),
    sorts: [{ direction: "ascending", timestamp: field }],
    ...(startCursor == null ? {} : { start_cursor: startCursor }),
  };
}

function classify(page: PageValue): EventKind {
  return instant(page.created_time) === instant(page.last_edited_time) ? "page_added" : "page_updated";
}

function event(page: PageValue, kind: EventKind, config: Config, checkpoint: Checkpoint): PollEvent {
  return {
    dedupeKey:
      kind == "page_added"
        ? `added:${page.id}`
        : `updated:${page.id}:${instant(page.last_edited_time) ?? page.last_edited_time ?? ""}`,
    payload: {
      createdBy: { id: page.created_by?.id ?? "" },
      createdTime: page.created_time ?? "",
      dataSourceId: checkpoint.dataSourceId,
      databaseId: canonicalId(config.databaseId),
      event: kind,
      lastEditedBy: { id: page.last_edited_by?.id ?? "" },
      lastEditedTime: page.last_edited_time ?? "",
      pageId: page.id,
      ...(config.includeProperties ? { properties: page.properties ?? {} } : {}),
      title: title(page.properties ?? {}),
      url: page.url ?? "",
    },
  };
}

function title(properties: Readonly<Record<string, JsonValue>>): string {
  for (const value of Object.values(properties)) {
    const property = record(value);
    if (property?.type !== "title" || !Array.isArray(property.title)) continue;
    return property.title
      .map((part) => (typeof record(part)?.plain_text == "string" ? record(part)!.plain_text : ""))
      .join("");
  }
  return "";
}

async function request(context: PollContext, value: ConnectorProxyRequest): Promise<ConnectorProxyResult> {
  try {
    return await context.connector.execute(value, context.signal);
  } catch (cause) {
    throw new TransientPollError(`Notion proxy request to ${value.endpoint} failed.`, { cause });
  }
}

function success(result: ConnectorProxyResult, operation: string): void {
  if (result.status >= 200 && result.status < 300) return;
  if (result.status == 401 || result.status == 403)
    throw new PollConnectionError(`Notion ${operation} rejected the Connection.`);
  if (result.status == 404)
    throw new PermanentPollError("The Notion target was not found or is not shared with the Connection.");
  if (result.status == 400) throw new PermanentPollError(`Notion ${operation} rejected the configuration.`);
  throw new TransientPollError(`Notion ${operation} failed with status ${result.status}.`);
}

function target(config: Config): string {
  return `${config.databaseId}|${config.dataSourceId}`;
}

function normalizeId(value: string): string {
  return value.replaceAll("-", "").toLowerCase();
}

function canonicalId(value: string): string {
  const hex = normalizeId(value);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function later(current: string | null, candidate: string): string | null {
  const timestamp = Date.parse(candidate);
  return Number.isNaN(timestamp) || (current != null && timestamp < Date.parse(current)) ? current : candidate;
}

function after(left: string, right: string): boolean {
  return !Number.isNaN(Date.parse(left)) && !Number.isNaN(Date.parse(right)) && Date.parse(left) > Date.parse(right);
}

function instant(value: string | undefined): string | null {
  if (value == null || value.length == 0) return null;
  const milliseconds = Date.parse(value);
  return Number.isNaN(milliseconds) ? null : new Date(milliseconds).toISOString();
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value == "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
