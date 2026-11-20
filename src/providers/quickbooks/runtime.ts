import type { ProviderFetch } from "../provider-runtime.ts";
import type { QuickbooksEntity, QuickbooksEnvironment } from "./constants.ts";

import { looseArray, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  ProviderRequestError,
  parseProviderJsonBodyText,
  providerInputError,
  providerUserAgent,
  readProviderTextBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  setSearchParams,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { quickbooksDefaultMaxResults, quickbooksMaxResults, quickbooksMinorVersion } from "./constants.ts";

const staleObjectCode = "5010";
const staleObjectPattern = /stale object/i;
const throttleWaitHint =
  "QuickBooks allows about 500 requests per minute per company; wait about 60 seconds and retry.";

/** What a handler needs to call one company's QuickBooks API. */
export interface QuickbooksContext {
  accessToken: string;
  tokenType: string;
  realmId: string;
  baseUrl: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export interface QuickbooksRequest {
  /** Path below `/v3/company/{realmId}/`. */
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, string | undefined>;
  /** Objects are sent as JSON; a string is sent as is (used by `send_invoice`'s empty body). */
  body?: unknown;
  contentType?: string;
  /** Multipart upload body; the runtime lets `fetch` set the multipart content type. */
  formData?: FormData;
  /** Return the response as `{ text }` instead of parsing JSON, for endpoints that answer with plain text. */
  responseText?: boolean;
}

/** One page of a query: the rows plus `totalCount` when the statement was a count. */
export interface QuickbooksQueryPage {
  rows: unknown[];
  totalCount: number | null;
}

/**
 * Call the QuickBooks Accounting API for one company and return the parsed
 * JSON body. A `Fault` body, or any non-2xx status, becomes a
 * `ProviderRequestError` carrying the upstream message and `intuit_tid`.
 */
export async function quickbooksRequest(
  context: QuickbooksContext,
  request: QuickbooksRequest,
): Promise<Record<string, unknown>> {
  const url = new URL(`${context.baseUrl}/v3/company/${encodePathSegment(context.realmId)}/${request.path}`);
  setSearchParams(url, { ...request.query, minorversion: quickbooksMinorVersion });
  const headers: Record<string, string> = {
    "accept": request.responseText ? "*/*" : "application/json",
    "authorization": `${context.tokenType} ${context.accessToken}`,
    "user-agent": providerUserAgent,
  };
  let body: string | FormData | undefined = request.formData;
  if (request.body !== undefined) {
    body = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    headers["content-type"] = request.contentType ?? "application/json";
  }

  return runProviderRequest({ signal: context.signal, label: "QuickBooks" }, async (signal) => {
    const response = await context.fetcher(url, { method: request.method ?? "GET", headers, body, signal });
    const text = await readProviderTextBody(response, "QuickBooks response");
    if (request.responseText && response.ok) {
      return { text: text.trim() };
    }
    const payload = optionalRecord(
      parseProviderJsonBodyText(text, {
        emptyBody: {},
        invalidJsonMessage: "QuickBooks returned an invalid JSON response",
        // An error page is not JSON; the status line still tells the caller what happened.
        invalidJsonFallback: response.ok ? undefined : () => ({}),
      }),
    );
    const intuitTid = response.headers.get("intuit_tid") ?? undefined;
    const fault = optionalRecord(payload?.Fault);
    if (!response.ok || fault) {
      throw quickbooksError(response, fault, intuitTid);
    }
    return requiredResponseRecord(payload, "QuickBooks response");
  });
}

function quickbooksError(
  response: Response,
  fault: Record<string, unknown> | undefined,
  intuitTid: string | undefined,
): ProviderRequestError {
  const errors = looseArray(fault?.Error).map((entry) => optionalRecord(entry) ?? {});
  const described = errors
    .map((error) => {
      const text = [optionalString(error.Message), optionalString(error.Detail)].filter(Boolean).join(": ");
      const code = optionalString(error.code);
      return code ? `${text} (code ${code})` : text;
    })
    .filter(Boolean)
    .join("; ");
  const stale = errors.some(
    (error) =>
      optionalString(error.code) === staleObjectCode ||
      staleObjectPattern.test(`${optionalString(error.Message) ?? ""} ${optionalString(error.Detail) ?? ""}`),
  );
  const tid = intuitTid ? ` [intuit_tid ${intuitTid}]` : "";
  const details = { intuitTid, fault };
  // A 200 carrying a Fault is still a failure; treat it as the caller's bad request.
  const status = response.ok ? 400 : response.status;

  if (stale) {
    return new ProviderRequestError(
      400,
      `The SyncToken is stale because the entity changed after it was read. Re-fetch the entity and retry with its current SyncToken. ${described}${tid}`,
      details,
    );
  }
  if (status === 429) {
    return new ProviderRequestError(
      429,
      `QuickBooks rate limit exceeded. ${throttleWaitHint}${tid}`,
      withRetryAfterSeconds(response, details),
    );
  }
  const message = `${described || `QuickBooks request failed (HTTP ${status})`}${tid}`;
  if (status >= 500) {
    return new ProviderRequestError(502, message, details);
  }
  return new ProviderRequestError(status, message, details, "provider_error");
}

/** GET the connected company's CompanyInfo record. */
export async function getCompanyInfo(context: QuickbooksContext): Promise<Record<string, unknown>> {
  const payload = await quickbooksRequest(context, {
    path: `companyinfo/${encodePathSegment(context.realmId)}`,
  });
  return requiredResponseRecord(payload.CompanyInfo, "QuickBooks CompanyInfo");
}

/** Run a query statement and return its rows. */
export async function runQuery(context: QuickbooksContext, statement: string): Promise<QuickbooksQueryPage> {
  const payload = await quickbooksRequest(context, { path: "query", query: { query: statement } });
  const response = optionalRecord(payload.QueryResponse) ?? {};
  const totalCount = optionalInteger(response.totalCount);
  // The rows sit under the entity name; the other keys are paging metadata.
  const rows = Object.values(response).find(Array.isArray);
  return { rows: rows ?? [], totalCount: totalCount ?? null };
}

/** The paging envelope shared by every list-shaped output. */
export function pageResult(rows: unknown[], paging: QuickbooksPaging): Record<string, unknown> {
  const hasMore = rows.length >= paging.maxResults;
  return {
    items: rows,
    start_position: paging.startPosition,
    max_results: paging.maxResults,
    next_start_position: hasMore ? paging.startPosition + rows.length : null,
    has_more: hasMore,
  };
}

/** List an entity with the given filters and ordering. */
export async function listEntities(
  context: QuickbooksContext,
  select: QuickbooksSelect,
): Promise<Record<string, unknown>> {
  const page = await runQuery(context, buildSelectStatement(select));
  return pageResult(page.rows, select);
}

/** GET one entity and return its record. */
export async function readEntity(
  context: QuickbooksContext,
  entity: QuickbooksEntity,
  id: string,
): Promise<Record<string, unknown>> {
  const payload = await quickbooksRequest(context, { path: `${entity.path}/${encodePathSegment(id)}` });
  return requiredResponseRecord(payload[entity.name], `QuickBooks ${entity.name}`);
}

/** POST a new entity and return the created record. */
export async function createEntity(
  context: QuickbooksContext,
  entity: QuickbooksEntity,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const payload = await quickbooksRequest(context, { path: entity.path, method: "POST", body });
  return requiredResponseRecord(payload[entity.name], `QuickBooks ${entity.name}`);
}

/**
 * The caller's SyncToken, or the entity's current one when the caller gave none.
 * Fetching it first means an update never silently targets a stale version, but
 * it also overwrites edits made since the caller last read the entity.
 */
async function resolveSyncToken(
  context: QuickbooksContext,
  entity: QuickbooksEntity,
  input: Record<string, unknown>,
  id: string,
): Promise<string> {
  const provided = optionalString(input.sync_token);
  if (provided) {
    return provided;
  }
  const current = await readEntity(context, entity, id);
  const token = optionalString(current.SyncToken);
  if (!token) {
    throw new ProviderRequestError(502, `QuickBooks ${entity.name} response is missing SyncToken`);
  }
  return token;
}

/** Update an entity; `fields` are the QuickBooks body fields to change. */
export async function updateEntity(
  context: QuickbooksContext,
  entity: QuickbooksEntity,
  input: Record<string, unknown>,
  fields: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const id = requiredInputString(input.id, "id");
  const syncToken = await resolveSyncToken(context, entity, input, id);
  const sparse = optionalBoolean(input.sparse) ?? true;
  return createEntity(context, entity, { ...fields, Id: id, SyncToken: syncToken, sparse });
}

/** Void or delete an entity with `POST /{entity}?operation=...`. */
export async function operateOnEntity(
  context: QuickbooksContext,
  entity: QuickbooksEntity,
  operation: "void" | "delete",
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const id = requiredInputString(input.id, "id");
  const syncToken = await resolveSyncToken(context, entity, input, id);
  // QuickBooks voids a Payment as a sparse update with `include=void`; other entities use `operation=void`.
  const voidsPayment = operation === "void" && entity.name === "Payment";
  const payload = await quickbooksRequest(context, {
    path: entity.path,
    method: "POST",
    query: voidsPayment ? { operation: "update", include: "void" } : { operation },
    body: voidsPayment ? { Id: id, SyncToken: syncToken, sparse: true } : { Id: id, SyncToken: syncToken },
  });
  return requiredResponseRecord(payload[entity.name], `QuickBooks ${entity.name}`);
}

const reportParameterNamePattern = /^[A-Za-z_]+$/;

/** Extra report query parameters, passed through by name. Values are sent as strings. */
function reportParameters(value: unknown): Record<string, string | undefined> {
  const parameters: Record<string, string | undefined> = {};
  for (const [name, entry] of Object.entries(optionalRecord(value) ?? {})) {
    if (!reportParameterNamePattern.test(name)) {
      throw providerInputError(`parameters.${name} is not a valid report parameter name`);
    }
    parameters[name] = entry === undefined ? undefined : String(entry);
  }
  return parameters;
}

/** Read a report such as `ProfitAndLoss` with the shared date-range options. */
export async function readReport(
  context: QuickbooksContext,
  reportName: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const startDate = optionalString(input.start_date);
  const endDate = optionalString(input.end_date);
  if (startDate && endDate && startDate > endDate) {
    throw providerInputError("start_date must not be after end_date");
  }
  return quickbooksRequest(context, {
    path: `reports/${reportName}`,
    query: {
      start_date: startDate,
      end_date: endDate,
      accounting_method: optionalString(input.accounting_method),
      summarize_column_by: optionalString(input.summarize_column_by),
      ...reportParameters(input.parameters),
    },
  });
}

/**
 * Read the `environment` credential or client-config value. A blank value means
 * production; anything other than `production` or `sandbox` is rejected so a
 * typo can never silently send live credentials to the wrong host.
 */
export function resolveQuickbooksEnvironment(
  value: unknown,
  createError: (message: string) => Error = providerInputError,
): QuickbooksEnvironment {
  const environment = optionalString(value)?.toLowerCase() ?? "production";
  if (environment === "production" || environment === "sandbox") {
    return environment;
  }
  throw createError("environment must be production or sandbox");
}

const columnPattern = /^[A-Za-z][A-Za-z0-9.]*$/;
const selectPattern = /^\s*select\s/i;
const pagingClausePattern = /\b(?:startposition|maxresults)\b/i;

export interface QuickbooksPaging {
  startPosition: number;
  maxResults: number;
}

export interface QuickbooksSelect extends QuickbooksPaging {
  entity: string;
  conditions: string[];
  orderBy?: string;
  descending?: boolean;
}

/**
 * Quote a value as a QuickBooks query string literal. QuickBooks escapes a
 * single quote with a backslash, so a backslash has to be escaped as well or a
 * trailing one would swallow the closing quote.
 */
export function quoteQuickbooksString(value: string): string {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

/** `column = 'value'`; `column` is always a provider constant, never caller input. */
export function equalsCondition(column: string, value: string): string {
  return `${column} = ${quoteQuickbooksString(value)}`;
}

/** `column LIKE '%value%'`. */
export function containsCondition(column: string, value: string): string {
  return `${column} LIKE ${quoteQuickbooksString(`%${value}%`)}`;
}

/** `column <op> 'value'` for ordered comparisons such as `TxnDate >= '2026-01-01'`. */
export function compareCondition(column: string, operator: ">=" | "<=" | ">", value: string): string {
  return `${column} ${operator} ${quoteQuickbooksString(value)}`;
}

/** Condition for the `status` list filter; QuickBooks hides inactive rows unless asked for them. */
export function statusCondition(status: string | undefined): string {
  switch (status) {
    case "inactive":
      return "Active = false";
    case "all":
      return "Active IN (true, false)";
    default:
      return "Active = true";
  }
}

/** Read and bound `start_position` and `max_results`. */
export function readPaging(input: Record<string, unknown>): QuickbooksPaging {
  const startPosition = optionalInteger(input.start_position) ?? 1;
  const maxResults = optionalInteger(input.max_results) ?? quickbooksDefaultMaxResults;
  if (startPosition < 1) {
    throw providerInputError("start_position must be at least 1");
  }
  if (maxResults < 1 || maxResults > quickbooksMaxResults) {
    throw providerInputError(`max_results must be between 1 and ${quickbooksMaxResults}`);
  }
  return { startPosition, maxResults };
}

/** Build a `select *` statement with filters, ordering and paging. */
export function buildSelectStatement(select: QuickbooksSelect): string {
  const parts = [`select * from ${select.entity}`];
  if (select.conditions.length > 0) {
    parts.push(`where ${select.conditions.join(" and ")}`);
  }
  if (select.orderBy) {
    if (!columnPattern.test(select.orderBy)) {
      throw providerInputError("order_by is not a valid column name");
    }
    parts.push(`order by ${select.orderBy}${select.descending ? " desc" : ""}`);
  }
  parts.push(`startposition ${select.startPosition}`, `maxresults ${select.maxResults}`);
  return parts.join(" ");
}

/** `TxnDate` range conditions for the `txn_date_from` and `txn_date_to` list filters. */
export function txnDateConditions(input: Record<string, unknown>): string[] {
  const from = optionalString(input.txn_date_from);
  const to = optionalString(input.txn_date_to);
  return [
    ...(from ? [compareCondition("TxnDate", ">=", from)] : []),
    ...(to ? [compareCondition("TxnDate", "<=", to)] : []),
  ];
}

/** Reject anything but a read-only `select` statement. */
export function assertReadOnlySelect(statement: string): void {
  if (!selectPattern.test(statement)) {
    throw providerInputError("statement must be a read-only query that begins with select");
  }
}

/** Reject anything but a `select` statement without its own paging clauses. */
export function assertSelectStatement(statement: string): void {
  assertReadOnlySelect(statement);
  if (pagingClausePattern.test(statement)) {
    throw providerInputError(
      "statement must not contain STARTPOSITION or MAXRESULTS; use start_position and max_results",
    );
  }
}
