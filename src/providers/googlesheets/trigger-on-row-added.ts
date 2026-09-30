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
import { snapshot } from "./trigger-on-row-added.definition.ts";

interface Config {
  readonly colEnd: string;
  readonly colStart: string;
  readonly dateTimeRender: "FORMATTED_STRING" | "SERIAL_NUMBER";
  readonly firstDataRow: number;
  readonly headerRow: number;
  readonly maxRowsPerPoll: number;
  readonly sheet: string;
  readonly spreadsheetId: string;
  readonly valueRender: "FORMATTED_VALUE" | "FORMULA" | "UNFORMATTED_VALUE";
}

interface Checkpoint extends Readonly<Record<string, JsonValue>> {
  readonly lastRowNumber: number;
  readonly sheetId: number;
  readonly spreadsheetId: string;
}

interface Properties {
  readonly gridProperties?: { readonly rowCount?: number };
  readonly sheetId?: number;
  readonly sheetType?: string;
  readonly title?: string;
}

interface Sheet {
  readonly rowCount: number;
  readonly sheetId: number;
  readonly title: string;
}

const permissionMarkers = [
  "permission_denied",
  "accessnotconfigured",
  "insufficientfilepermissions",
  "appnotauthorizedtofile",
  "the caller does not have permission",
  "has not been used in project",
];
const quotaMarkers = ["ratelimitexceeded", "dailylimitexceeded"];

export const googleSheetsRowAdded: PollDefinition = {
  buildOutputs: eventsPollOutputs,
  snapshot,
  async poll(context) {
    const config = resolveConfig(context.config);
    if (context.checkpoint === null) {
      const sheet = await resolveSheet(context, config);
      return { checkpoint: await anchor(context, config, sheet), events: [] };
    }
    const checkpoint = readCheckpoint(context.checkpoint);
    const sheet = await resolveSheet(context, config);
    if (checkpoint.spreadsheetId !== config.spreadsheetId || checkpoint.sheetId !== sheet.sheetId) {
      return { checkpoint: await anchor(context, config, sheet), events: [] };
    }
    if (checkpoint.lastRowNumber > sheet.rowCount)
      return { checkpoint: await anchor(context, config, sheet), events: [] };

    const headers = await header(context, config, sheet);
    const start = Math.min(Math.max(config.firstDataRow, checkpoint.lastRowNumber + 1), sheet.rowCount);
    const end = Math.min(start + Math.min(config.maxRowsPerPoll, maximumPollEventsPerPage) - 1, sheet.rowCount);
    const rows = await values(context, config, sheet, start, end, "row window fetch");
    let last = start + rows.length - 1;
    if (rows.length < end - start + 1) {
      // API 会省略窗口尾部的空行，确认实际表尾后才能推进游标。
      const tail = await lastNonEmptyRow(context, config, sheet);
      if (tail < checkpoint.lastRowNumber) return { checkpoint: { ...checkpoint, lastRowNumber: tail }, events: [] };
      last = Math.min(end, tail);
    }
    if (last <= checkpoint.lastRowNumber) return { checkpoint, events: [] };

    const events: PollEvent[] = [];
    let filtered = 0;
    for (const [index, cells] of rows.entries()) {
      const rowNumber = start + index;
      if (rowNumber <= checkpoint.lastRowNumber) continue;
      if (rowNumber == config.headerRow || empty(cells)) {
        filtered += 1;
        continue;
      }
      events.push(await event(config, sheet, rowNumber, cells, headers));
    }
    const hasMore = last == end && end < sheet.rowCount;
    return {
      checkpoint: {
        lastRowNumber: last,
        sheetId: sheet.sheetId,
        spreadsheetId: config.spreadsheetId,
      },
      events,
      filtered,
      ...(hasMore ? { hasMore: true } : {}),
    };
  },
};

function resolveConfig(value: Readonly<Record<string, JsonValue>>): Config {
  const range = (value.columnRange as string).trim();
  const separator = range.indexOf(":");
  const colStart = separator < 0 ? range : range.slice(0, separator);
  const colEnd = separator < 0 ? range : range.slice(separator + 1);
  const spreadsheet = (value.spreadsheetId as string).trim();
  return {
    colEnd,
    colStart,
    dateTimeRender: value.dateTimeRender as Config["dateTimeRender"],
    firstDataRow: value.firstDataRow as number,
    headerRow: value.headerRow as number,
    maxRowsPerPoll: value.maxRowsPerPoll as number,
    sheet: value.sheet as string,
    spreadsheetId: /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(spreadsheet)?.[1] ?? spreadsheet,
    valueRender: value.valueRender as Config["valueRender"],
  };
}

function readCheckpoint(value: JsonValue): Checkpoint {
  const checkpoint = record(value);
  if (
    typeof checkpoint?.spreadsheetId != "string" ||
    !Number.isInteger(checkpoint.sheetId) ||
    !Number.isInteger(checkpoint.lastRowNumber)
  ) {
    throw new PermanentPollError("Google Sheets checkpoint is invalid; recreate the Trigger.");
  }
  return {
    lastRowNumber: checkpoint.lastRowNumber as number,
    sheetId: checkpoint.sheetId as number,
    spreadsheetId: checkpoint.spreadsheetId,
  };
}

async function resolveSheet(context: PollContext, config: Config): Promise<Sheet> {
  const result = await get(context, `/spreadsheets/${encodeURIComponent(config.spreadsheetId)}`, {
    fields: "sheets.properties(sheetId,title,sheetType,gridProperties)",
  });
  if (result.status == 404) throw new PermanentPollError("The Google Sheets spreadsheet was not found.");
  success(result, "spreadsheet metadata fetch");
  const raw = record(result.data)?.sheets;
  const properties = Array.isArray(raw)
    ? raw.map((value) => record(record(value)?.properties) as Properties | undefined)
    : [];
  const candidates = properties.filter((value): value is Properties => value != null);
  const byId = /^\d+$/.test(config.sheet)
    ? candidates.find(({ sheetId }) => sheetId === Number(config.sheet))
    : undefined;
  const match = byId ?? candidates.find(({ title }) => title === config.sheet);
  if (match == null) throw new PermanentPollError(`Google Sheets tab "${config.sheet}" does not exist.`);
  if (match.sheetType != null && match.sheetType !== "GRID")
    throw new PermanentPollError("The Google Sheets tab is not a grid sheet.");
  const rowCount = match.gridProperties?.rowCount;
  if (match.sheetId == null || match.title == null || rowCount == null) {
    throw new TransientPollError("Google Sheets tab metadata is incomplete.");
  }
  return { rowCount, sheetId: match.sheetId, title: match.title };
}

async function anchor(context: PollContext, config: Config, sheet: Sheet): Promise<Checkpoint> {
  return {
    lastRowNumber: await lastNonEmptyRow(context, config, sheet),
    sheetId: sheet.sheetId,
    spreadsheetId: config.spreadsheetId,
  };
}

async function lastNonEmptyRow(context: PollContext, config: Config, sheet: Sheet): Promise<number> {
  if (sheet.rowCount < config.firstDataRow) return config.firstDataRow - 1;
  const rows = await values(context, config, sheet, config.firstDataRow, sheet.rowCount, "full-range scan");
  return rows.length == 0 ? config.firstDataRow - 1 : config.firstDataRow + rows.length - 1;
}

async function header(context: PollContext, config: Config, sheet: Sheet): Promise<readonly JsonValue[]> {
  const result = await get(context, valuesEndpoint(config, sheet, config.headerRow, config.headerRow), {
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE",
  });
  success(result, "header row fetch");
  return readValues(result.data)[0] ?? [];
}

async function values(
  context: PollContext,
  config: Config,
  sheet: Sheet,
  start: number,
  end: number,
  operation: string,
): Promise<readonly (readonly JsonValue[])[]> {
  const result = await get(context, valuesEndpoint(config, sheet, start, end), {
    dateTimeRenderOption: config.dateTimeRender,
    majorDimension: "ROWS",
    valueRenderOption: config.valueRender,
  });
  success(result, operation);
  return readValues(result.data);
}

function readValues(data: unknown): readonly (readonly JsonValue[])[] {
  const rows = record(data)?.values;
  return Array.isArray(rows) ? (rows as readonly (readonly JsonValue[])[]) : [];
}

function empty(cells: readonly JsonValue[]): boolean {
  return cells.every((cell) => cell === "" || cell == null);
}

async function event(
  config: Config,
  sheet: Sheet,
  rowNumber: number,
  cells: readonly JsonValue[],
  headers: readonly JsonValue[],
): Promise<PollEvent> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(cells)));
  const hash = [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const row: Record<string, JsonValue> = {};
  const start = columnNumber(config.colStart);
  for (const [index, cell] of cells.entries()) {
    const heading = headers[index];
    row[typeof heading == "string" && heading.length > 0 ? heading : columnLetters(start + index)] = cell;
  }
  return {
    dedupeKey: `${sheet.sheetId}:${rowNumber}:${hash}`,
    payload: {
      row,
      rowNumber,
      sheetId: sheet.sheetId,
      sheetTitle: sheet.title,
      spreadsheetId: config.spreadsheetId,
      values: cells,
    },
  };
}

function valuesEndpoint(config: Config, sheet: Sheet, start: number, end: number): string {
  const title = encodeURIComponent(`'${sheet.title.replaceAll("'", "''")}'`);
  return `/spreadsheets/${encodeURIComponent(config.spreadsheetId)}/values/${title}!${config.colStart}${start}:${config.colEnd}${end}`;
}

async function get(
  context: PollContext,
  endpoint: string,
  query: Readonly<Record<string, string>>,
): Promise<ConnectorProxyResult> {
  try {
    return await context.connector.execute({ endpoint, method: "GET", query }, context.signal);
  } catch (cause) {
    throw new TransientPollError(`Google Sheets proxy request to ${endpoint} failed.`, { cause });
  }
}

function success(result: ConnectorProxyResult, operation: string): void {
  if (result.status >= 200 && result.status < 300) return;
  if (result.status == 401) throw new PollConnectionError(`Google Sheets ${operation} rejected the Connection.`);
  const haystack = JSON.stringify(result.data ?? null).toLowerCase();
  if (result.status == 403) {
    if (quotaMarkers.some((marker) => haystack.includes(marker)))
      throw new TransientPollError(`Google Sheets ${operation} was rate limited.`);
    if (permissionMarkers.some((marker) => haystack.includes(marker))) {
      throw new PollConnectionError(`Google Sheets ${operation} rejected the Connection.`);
    }
  }
  if (result.status == 400 && haystack.includes("unable to parse range")) {
    throw new PermanentPollError("Google Sheets rejected the configured range.");
  }
  if (result.status == 413) throw new PermanentPollError("Google Sheets response is too large; narrow columnRange.");
  throw new TransientPollError(`Google Sheets ${operation} failed with status ${result.status}.`);
}

function columnNumber(letters: string): number {
  let value = 0;
  for (const letter of letters.toUpperCase()) value = value * 26 + letter.charCodeAt(0) - 64;
  return value;
}

function columnLetters(value: number): string {
  let letters = "";
  for (let rest = value; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    letters = String.fromCharCode(65 + ((rest - 1) % 26)) + letters;
  }
  return letters;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value == "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
