import type { PollContext, PollDefinition, PollEvent } from "../../triggers/common/poll.ts";
import type { ConnectorProxyResult } from "../../triggers/common/proxy.ts";
import type { JsonValue } from "../../triggers/common/types.ts";

import {
  eventsPollOutputs,
  maximumPollEventsPerPage,
  PermanentPollError,
  PollConnectionError,
  TransientPollError,
} from "../../triggers/common/poll.ts";
import { snapshot } from "./trigger-on-record-changed.definition.ts";

interface Config {
  readonly baseId: string;
  readonly fields: readonly string[];
  readonly formula: string;
  readonly maxRecordsPerPoll: number;
  readonly tableIdOrName: string;
  readonly triggerField: string;
  readonly view: string;
}

interface Position {
  readonly boundaryIds: readonly string[];
  readonly cursor: string;
  readonly cursorExclusive?: boolean;
}

interface Checkpoint extends Position {
  readonly offset?: string;
  readonly pending?: Position;
}

interface RecordValue {
  readonly createdTime?: string;
  readonly fields?: Readonly<Record<string, JsonValue>>;
  readonly id: string;
}

interface ListRun {
  readonly offset?: string;
  readonly offsetWentStale: boolean;
  readonly records: readonly RecordValue[];
}

const staleIterator = "LIST_RECORDS_ITERATOR_NOT_AVAILABLE";

export const airtableRecordChanged: PollDefinition = {
  buildOutputs: eventsPollOutputs,
  snapshot,
  async poll(context) {
    const config = resolveConfig(context.config);
    if (context.checkpoint === null)
      return { checkpoint: (await seed(context, config)) as unknown as JsonValue, events: [] };
    const checkpoint = readCheckpoint(context.checkpoint);
    const run = await changed(context, config, checkpoint);
    const parsed: { readonly record: RecordValue; readonly value: string }[] = [];
    let filtered = 0;
    for (const item of run.records) {
      const value = instant(item.fields?.[config.triggerField]);
      if (value == null) filtered += 1;
      else parsed.push({ record: item, value });
    }
    const events = parsed.flatMap(({ record: item, value }) =>
      value == checkpoint.cursor && checkpoint.boundaryIds.includes(item.id) ? [] : [event(config, item, value)],
    );
    const next = nextCheckpoint(checkpoint, run, parsed);
    return {
      checkpoint: next.checkpoint as unknown as JsonValue,
      events,
      filtered,
      ...(next.hasMore ? { hasMore: true } : {}),
    };
  },
};

function resolveConfig(value: Readonly<Record<string, JsonValue>>): Config {
  return {
    baseId: value.baseId as string,
    fields: value.fields as readonly string[],
    formula: (value.formula as string).trim(),
    maxRecordsPerPoll: value.maxRecordsPerPoll as number,
    tableIdOrName: value.tableIdOrName as string,
    triggerField: value.triggerField as string,
    view: (value.view as string).trim(),
  };
}

function readCheckpoint(value: JsonValue): Checkpoint {
  const checkpoint = asRecord(value);
  const cursor = instant(checkpoint?.cursor);
  const boundary = checkpoint?.boundaryIds;
  if (cursor == null || !Array.isArray(boundary) || boundary.some((id) => typeof id != "string")) {
    throw new PermanentPollError("Airtable checkpoint is invalid; recreate the Trigger.");
  }
  const pending = position(checkpoint?.pending);
  return {
    boundaryIds: boundary as string[],
    cursor,
    ...(checkpoint?.cursorExclusive === true ? { cursorExclusive: true } : {}),
    ...(typeof checkpoint?.offset == "string" ? { offset: checkpoint.offset } : {}),
    ...(pending == null ? {} : { pending }),
  };
}

function position(value: unknown): Position | null {
  const input = asRecord(value);
  const cursor = instant(input?.cursor);
  const boundary = input?.boundaryIds;
  if (cursor == null || !Array.isArray(boundary) || boundary.some((id) => typeof id != "string")) return null;
  return {
    boundaryIds: boundary as string[],
    cursor,
    ...(input?.cursorExclusive === true ? { cursorExclusive: true } : {}),
  };
}

async function seed(context: PollContext, config: Config): Promise<Checkpoint> {
  const result = await list(context, config, seedBody(config));
  success(result, "seed list");
  const page = listPage(result.data);
  if (page.records.length == 0) return { boundaryIds: [], cursor: context.now.toISOString() };
  const cursor = instant(page.records[0]?.fields?.[config.triggerField]);
  if (cursor == null) throw new PermanentPollError("The Airtable trigger field is not a time field.");
  const boundaryIds = page.records
    .filter((item) => instant(item.fields?.[config.triggerField]) === cursor)
    .map(({ id }) => id);
  return boundaryIds.length == page.records.length && page.offset
    ? { boundaryIds: [], cursor, cursorExclusive: true }
    : { boundaryIds, cursor };
}

async function changed(context: PollContext, config: Config, checkpoint: Checkpoint): Promise<ListRun> {
  const result = await list(context, config, pollBody(config, checkpoint, checkpoint.offset));
  if (checkpoint.offset != null && result.status == 422 && errorType(result.data) == staleIterator) {
    return { offsetWentStale: true, records: [] };
  }
  success(result, "record list");
  const parsed = listPage(result.data);
  return { offset: parsed.offset, offsetWentStale: false, records: parsed.records };
}

function nextCheckpoint(
  checkpoint: Checkpoint,
  run: ListRun,
  parsed: readonly { readonly record: RecordValue; readonly value: string }[],
): { readonly checkpoint: Checkpoint; readonly hasMore: boolean } {
  const start: Position = {
    boundaryIds: checkpoint.boundaryIds,
    cursor: checkpoint.cursor,
    ...(checkpoint.cursorExclusive === true ? { cursorExclusive: true } : {}),
  };
  if (run.offsetWentStale) return { checkpoint: start, hasMore: false };
  const reached = merge(checkpoint.pending, tick(parsed));
  if (run.offset != null) {
    return {
      checkpoint: {
        ...start,
        offset: run.offset,
        ...(reached == null ? {} : { pending: reached }),
      },
      hasMore: true,
    };
  }
  return { checkpoint: reached == null ? start : mergePosition(start, reached), hasMore: false };
}

function tick(parsed: readonly { readonly record: RecordValue; readonly value: string }[]): Position | undefined {
  if (parsed.length == 0) return undefined;
  const cursor = parsed.reduce((latest, entry) => (entry.value > latest ? entry.value : latest), parsed[0]!.value);
  return cap(
    cursor,
    parsed.filter(({ value }) => value == cursor).map(({ record: item }) => item.id),
  );
}

function merge(left: Position | undefined, right: Position | undefined): Position | undefined {
  if (left == null) return right;
  if (right == null) return left;
  return mergePosition(left, right);
}

function mergePosition(left: Position, right: Position): Position {
  if (right.cursor > left.cursor) return right;
  if (left.cursor > right.cursor) return left;
  if (left.cursorExclusive === true || right.cursorExclusive === true)
    return { boundaryIds: [], cursor: left.cursor, cursorExclusive: true };
  return cap(left.cursor, [...new Set([...left.boundaryIds, ...right.boundaryIds])]);
}

function cap(cursor: string, ids: readonly string[]): Position {
  return ids.length > 200 ? { boundaryIds: [], cursor, cursorExclusive: true } : { boundaryIds: ids, cursor };
}

function event(config: Config, value: RecordValue, timestamp: string): PollEvent {
  return {
    dedupeKey: `${value.id}:${timestamp}`,
    payload: {
      baseId: config.baseId,
      createdTime: value.createdTime ?? "",
      fields: value.fields ?? {},
      recordId: value.id,
      tableIdOrName: config.tableIdOrName,
      triggerField: config.triggerField,
      triggerFieldValue: timestamp,
    },
  };
}

function seedBody(config: Config): Record<string, unknown> {
  return {
    fields: [config.triggerField],
    filterByFormula: formula([blank(config.triggerField), ...(config.formula.length == 0 ? [] : [config.formula])]),
    pageSize: 100,
    sort: [{ direction: "desc", field: config.triggerField }],
    ...(config.view.length == 0 ? {} : { view: config.view }),
  };
}

function pollBody(config: Config, checkpoint: Checkpoint, offset: string | undefined): Record<string, unknown> {
  const parsed = `DATETIME_PARSE("${checkpoint.cursor}", "YYYY-MM-DDTHH:mm:ss.SSSZ")`;
  const cursor =
    checkpoint.cursorExclusive === true
      ? `IS_AFTER({${config.triggerField}}, ${parsed})`
      : `NOT(IS_BEFORE({${config.triggerField}}, ${parsed}))`;
  const fields = config.fields.includes(config.triggerField) ? config.fields : [...config.fields, config.triggerField];
  return {
    filterByFormula: formula([
      blank(config.triggerField),
      cursor,
      ...(config.formula.length == 0 ? [] : [config.formula]),
    ]),
    pageSize: Math.min(config.maxRecordsPerPoll, maximumPollEventsPerPage),
    sort: [{ direction: "asc", field: config.triggerField }],
    ...(config.fields.length == 0 ? {} : { fields }),
    ...(config.view.length == 0 ? {} : { view: config.view }),
    ...(offset == null ? {} : { offset }),
  };
}

function blank(field: string): string {
  return `NOT({${field}} = BLANK())`;
}

function formula(conditions: readonly string[]): string {
  return `AND(${conditions.join(", ")})`;
}

async function list(
  context: PollContext,
  config: Config,
  body: Record<string, unknown>,
): Promise<ConnectorProxyResult> {
  const endpoint = `/v0/${config.baseId}/${encodeURIComponent(config.tableIdOrName)}/listRecords`;
  try {
    return await context.connector.execute({ body, endpoint, method: "POST" }, context.signal);
  } catch (cause) {
    throw new TransientPollError(`Airtable proxy request to ${endpoint} failed.`, { cause });
  }
}

function success(result: ConnectorProxyResult, operation: string): void {
  if (result.status >= 200 && result.status < 300) return;
  if (result.status == 401 || result.status == 403)
    throw new PollConnectionError(`Airtable ${operation} rejected the Connection.`);
  if (result.status == 404) throw new PermanentPollError("The Airtable base or table was not found.");
  if (result.status == 422 && errorType(result.data) !== staleIterator) {
    throw new PermanentPollError("Airtable rejected the trigger field, formula, or view.");
  }
  throw new TransientPollError(`Airtable ${operation} failed with status ${result.status}.`);
}

function listPage(data: unknown): {
  readonly offset?: string;
  readonly records: readonly RecordValue[];
} {
  const value = asRecord(data);
  return {
    records: Array.isArray(value?.records) ? (value.records as readonly RecordValue[]) : [],
    ...(typeof value?.offset == "string" ? { offset: value.offset } : {}),
  };
}

function errorType(data: unknown): string {
  const error = asRecord(data)?.error;
  if (typeof error == "string") return error;
  const type = asRecord(error)?.type;
  return typeof type == "string" ? type : "";
}

function instant(value: unknown): string | null {
  if (typeof value != "string" || value.length == 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value == "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
