import type { ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalIntegerLike,
  optionalRecord,
  optionalString as optionalTrimmedString,
  pickOptionalBoolean,
  pickOptionalInteger,
  pickOptionalString,
  requiredRecord,
  stringArray,
} from "../../core/cast.ts";
import { isAbortLikeError, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export {
  compactObject,
  optionalBoolean,
  optionalIntegerLike as asOptionalInteger,
  optionalRecord as asOptionalObject,
  pickOptionalBoolean,
  pickOptionalInteger,
  pickOptionalString,
};

export type GoogleQueryValue = string | readonly string[] | undefined;

const service = "googlesheets";
const googleDefaultRequestTimeoutMs = 30_000;

export async function googleJsonRequest<T>(
  url: string,
  input: {
    accessToken: string;
    fetcher: ProviderFetch;
    signal?: AbortSignal;
    method?: string;
    query?: Record<string, GoogleQueryValue>;
    body?: unknown;
    rawBody?: BodyInit;
    headers?: Record<string, string>;
    timeoutMs?: number;
  },
): Promise<T> {
  const response = await googleRequest(url, input);
  return (await response.json()) as T;
}

export async function googleRequest(
  url: string,
  input: {
    accessToken: string;
    fetcher: ProviderFetch;
    signal?: AbortSignal;
    method?: string;
    query?: Record<string, GoogleQueryValue>;
    body?: unknown;
    rawBody?: BodyInit;
    headers?: Record<string, string>;
    timeoutMs?: number;
  },
): Promise<Response> {
  const target = new URL(url);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        target.searchParams.append(key, item);
      }
      continue;
    }
    if (typeof value === "string") {
      target.searchParams.set(key, value);
    }
  }

  const headers = {
    authorization: `Bearer ${input.accessToken}`,
    "user-agent": providerUserAgent,
    ...(input.headers ?? {}),
  };
  const hasJsonBody = input.rawBody == null && input.body !== undefined;
  const hasRequestBody = input.rawBody != null || hasJsonBody;
  const method = (input.method ?? (hasRequestBody ? "POST" : "GET")).toUpperCase();
  if ((method === "GET" || method === "HEAD") && hasRequestBody) {
    throw new ProviderRequestError(400, `${service} ${method} request must not include a body`);
  }

  const requestInit: RequestInit = {
    method,
    headers:
      hasJsonBody && !hasContentTypeHeader(headers)
        ? {
            ...headers,
            "content-type": "application/json",
          }
        : headers,
    signal: input.signal,
    ...(input.rawBody != null ? { body: input.rawBody } : hasJsonBody ? { body: JSON.stringify(input.body) } : {}),
  };
  const response = await googleFetchWithTimeout(target.toString(), {
    fetcher: input.fetcher,
    timeoutMs: input.timeoutMs ?? googleDefaultRequestTimeoutMs,
    init: requestInit,
  });

  await assertGoogleResponse(response);
  return response;
}

export function resolveSpreadsheetId(input: Record<string, unknown>): string {
  const value = pickOptionalString(input, "spreadsheetId");
  if (!value) {
    throw new ProviderRequestError(400, "spreadsheetId is required");
  }
  return extractSpreadsheetId(value);
}

export function resolveOptionalSheetId(input: Record<string, unknown>): number | undefined {
  return pickOptionalInteger(input, "sheetId");
}

export function resolveOptionalSheetTitle(input: Record<string, unknown>): string | undefined {
  return pickOptionalString(input, "sheetTitle");
}

export function resolveOptionalRanges(input: Record<string, unknown>): string[] | undefined {
  if (input.ranges == null) {
    return undefined;
  }
  return asStringArray(input.ranges);
}

export function normalizeSpreadsheetSummary(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(payload.id ?? ""),
    name: String(payload.name ?? ""),
    mimeType: String(payload.mimeType ?? ""),
    webViewLink: optionalString(payload.webViewLink) ?? null,
    createdTime: optionalString(payload.createdTime) ?? null,
    modifiedTime: optionalString(payload.modifiedTime) ?? null,
    owners: Array.isArray(payload.owners) ? payload.owners.map((owner) => asObject(owner)) : [],
    shared: optionalBoolean(payload.shared) ?? false,
    starred: optionalBoolean(payload.starred) ?? false,
    trashed: optionalBoolean(payload.trashed) ?? false,
  };
}

export function normalizeSpreadsheet(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    spreadsheetId: String(payload.spreadsheetId ?? ""),
    spreadsheetUrl: optionalString(payload.spreadsheetUrl) ?? null,
    properties: optionalRecord(payload.properties) ?? {},
    sheets: Array.isArray(payload.sheets) ? payload.sheets.map((sheet) => normalizeSheet(asObject(sheet))) : [],
    namedRanges: Array.isArray(payload.namedRanges)
      ? payload.namedRanges.map((namedRange) => asObject(namedRange))
      : [],
    developerMetadata: Array.isArray(payload.developerMetadata)
      ? payload.developerMetadata.map((metadata) => asObject(metadata))
      : [],
  };
}

export function normalizeSheet(payload: Record<string, unknown>): Partial<Record<string, unknown>> {
  return compactUnknownObject({
    properties: normalizeSheetProperties(optionalRecord(payload.properties) ?? {}),
    data: Array.isArray(payload.data) ? payload.data.map((item) => asObject(item)) : undefined,
    conditionalFormats: Array.isArray(payload.conditionalFormats)
      ? payload.conditionalFormats.map((item) => asObject(item))
      : undefined,
  });
}

export function normalizeSheetProperties(payload: Record<string, unknown>): Partial<Record<string, unknown>> {
  return compactUnknownObject({
    sheetId: optionalIntegerLike(payload.sheetId, "sheetId"),
    title: optionalString(payload.title),
    index: optionalIntegerLike(payload.index, "index"),
    sheetType: optionalString(payload.sheetType),
    hidden: optionalBoolean(payload.hidden) ?? false,
    gridProperties: optionalRecord(payload.gridProperties) ?? undefined,
  });
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function quoteA1SheetTitle(title: string): string {
  if (/^[A-Za-z0-9_]+$/.test(title)) {
    return title;
  }
  return `'${title.replace(/'/g, "''")}'`;
}

export function buildCellA1(sheetTitle: string, rowIndex: number, columnIndex: number): string {
  return `${quoteA1SheetTitle(sheetTitle)}!${columnIndexToLetters(columnIndex)}${rowIndex + 1}`;
}

export function compactUnknownObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return compactObject(value);
}

export function asObject(value: unknown): Record<string, unknown> {
  return requiredRecord(value, "object input", (message) => new ProviderRequestError(400, message));
}

export function asObjectArray(value: unknown): Array<Record<string, unknown>> {
  return objectArray(value, "object array", (message) => new ProviderRequestError(400, message));
}

export function asStringArray(value: unknown): string[] {
  return stringArray(value, "string array", (message) => new ProviderRequestError(400, message));
}

async function googleFetchWithTimeout(
  url: string | URL,
  input: {
    fetcher: ProviderFetch;
    timeoutMs?: number;
    init?: RequestInit;
  },
): Promise<Response> {
  const timeoutMs = input.timeoutMs ?? googleDefaultRequestTimeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return input.fetcher(url, input.init);
  }

  const controller = new AbortController();
  const parentSignal = input.init?.signal;
  let didTimeout = false;
  const timeoutHandle = globalThis.setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);
  const abortFromParent = (): void => controller.abort(parentSignal?.reason);
  if (parentSignal) {
    if (parentSignal.aborted) {
      abortFromParent();
    } else {
      parentSignal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  try {
    return await input.fetcher(url, {
      ...(input.init ?? {}),
      signal: controller.signal,
    });
  } catch (error) {
    if (didTimeout && isAbortLikeError(error)) {
      throw new ProviderRequestError(
        502,
        `${service} request timed out after ${Math.max(1, Math.ceil(timeoutMs / 1000))} seconds`,
      );
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutHandle);
    if (parentSignal) {
      parentSignal.removeEventListener("abort", abortFromParent);
    }
  }
}

function hasContentTypeHeader(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === "content-type");
}

async function assertGoogleResponse(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  const { message, details } = await extractGoogleError(response);
  throw new ProviderRequestError(response.status, message, details);
}

async function extractGoogleError(response: Response): Promise<{ message: string; details: unknown }> {
  const rawText = await response.text().catch(() => "");
  if (!rawText) {
    return {
      message: `${service} request failed with ${response.status}`,
      details: { status: response.status },
    };
  }

  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    const error = optionalRecord(parsed.error);
    const message = optionalTrimmedString(error?.message) ?? optionalTrimmedString(parsed.error_description) ?? rawText;
    return {
      message,
      details: parsed,
    };
  } catch {
    return {
      message: rawText,
      details: rawText,
    };
  }
}

function extractSpreadsheetId(value: string): string {
  const matched = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return matched?.[1] ?? value;
}

function columnIndexToLetters(columnIndex: number): string {
  let current = columnIndex + 1;
  let letters = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    current = Math.floor((current - 1) / 26);
  }
  return letters;
}
