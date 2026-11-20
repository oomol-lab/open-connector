import type { AppleAdsPhase } from "./auth.ts";

import { looseArray, optionalBoolean, optionalInteger, pickOptionalString, recordOrEmpty } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const appleAdsApiOrigin = "https://api.ads.apple.com";

const providerLabel = "Apple Ads";
const adAccountContextHeader = "x-ap-context";

export interface AppleAdsContext {
  authorization: () => Promise<string>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  defaultAdAccountId?: string;
}

export interface AppleAdsRequest {
  path: string;
  method?: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  adAccountId?: string;
  phase?: AppleAdsPhase;
}

export interface AppleAdsResponse {
  status: number;
  payload: unknown;
}

export interface AppleAdsPagination {
  offset: number | null;
  pageSize: number | null;
  totalCount: number | null;
}

type AppleAdsHandler = (input: Record<string, unknown>, context: AppleAdsContext) => Promise<unknown>;

export type AppleAdsHandlers = Record<string, AppleAdsHandler>;

export interface AppleAdsResourceRequest {
  path: string;
  label: string;
  adAccountId?: string;
  query?: Record<string, string | undefined>;
}

export interface AppleAdsWriteRequest extends AppleAdsResourceRequest {
  body: Record<string, unknown>;
}

export interface AppleAdsQueryRequest {
  path: string;
  label: string;
  adAccountId?: string;
}

export async function requestAppleAds(context: AppleAdsContext, input: AppleAdsRequest): Promise<AppleAdsResponse> {
  const url = new URL(`${appleAdsApiOrigin}${input.path}`);
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(name, value);
    }
  }

  return runProviderRequest({ label: providerLabel, signal: context.signal }, async (signal) => {
    const headers: Record<string, string> = {
      "accept": "application/json",
      "authorization": await context.authorization(),
      "user-agent": providerUserAgent,
    };
    if (input.adAccountId !== undefined) {
      headers[adAccountContextHeader] = `adAccountId=${input.adAccountId}`;
    }
    if (input.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    const response = await context.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw createAppleAdsError(response.status, payload, input.phase ?? "execute", response);
    }
    assertEnvelopeSucceeded(payload);
    return { status: response.status, payload };
  });
}

export async function getAppleAdsResource(
  context: AppleAdsContext,
  request: AppleAdsResourceRequest,
): Promise<Record<string, unknown>> {
  const { payload } = await requestAppleAds(context, {
    path: request.path,
    query: request.query,
    adAccountId: request.adAccountId,
  });
  return readResult(payload, request.label);
}

export async function getOptionalAppleAdsResource(
  context: AppleAdsContext,
  request: AppleAdsResourceRequest,
): Promise<Record<string, unknown> | null> {
  const { payload } = await requestAppleAds(context, {
    path: request.path,
    query: request.query,
    adAccountId: request.adAccountId,
  });
  return readOptionalResult(payload, request.label);
}

export async function listAppleAdsResources(
  context: AppleAdsContext,
  request: AppleAdsResourceRequest,
): Promise<Array<Record<string, unknown>>> {
  const { payload } = await requestAppleAds(context, {
    path: request.path,
    query: request.query,
    adAccountId: request.adAccountId,
  });
  return readResultCollection(payload, request.label);
}

export async function createAppleAdsResource(
  context: AppleAdsContext,
  request: AppleAdsWriteRequest,
): Promise<Record<string, unknown>> {
  const { payload } = await requestAppleAds(context, {
    method: "POST",
    path: request.path,
    body: request.body,
    adAccountId: request.adAccountId,
  });
  return readResult(payload, request.label);
}

export async function updateAppleAdsResource(
  context: AppleAdsContext,
  request: AppleAdsWriteRequest,
): Promise<Record<string, unknown>> {
  const { payload } = await requestAppleAds(context, {
    method: "PUT",
    path: request.path,
    body: request.body,
    adAccountId: request.adAccountId,
  });
  return readResult(payload, request.label);
}

export async function deleteAppleAdsResource(
  context: AppleAdsContext,
  request: AppleAdsResourceRequest,
): Promise<void> {
  await requestAppleAds(context, {
    method: "DELETE",
    path: request.path,
    adAccountId: request.adAccountId,
  });
}

export async function queryAppleAds(
  context: AppleAdsContext,
  input: Record<string, unknown>,
  request: AppleAdsQueryRequest,
): Promise<{ items: Array<Record<string, unknown>>; pagination: AppleAdsPagination }> {
  const { payload } = await requestAppleAds(context, {
    method: "POST",
    path: request.path,
    body: buildQueryBody(input),
    adAccountId: request.adAccountId,
  });
  return {
    items: readResultCollection(payload, request.label),
    pagination: readPagination(payload),
  };
}

export function buildQueryBody(input: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const filters = looseArray(input.filters);
  if (filters.length > 0) {
    body.filters = filters;
  }
  const sorting = looseArray(input.sorting);
  if (sorting.length > 0) {
    body.sorting = sorting;
  }
  const pagination: Record<string, unknown> = {};
  const offset = optionalInteger(input.offset);
  if (offset !== undefined) {
    pagination.offset = offset;
  }
  const pageSize = optionalInteger(input.pageSize);
  if (pageSize !== undefined) {
    pagination.pageSize = pageSize;
  }
  const fetchTotalCount = optionalBoolean(input.fetchTotalCount);
  if (fetchTotalCount !== undefined) {
    pagination.fetchTotalCount = fetchTotalCount;
  }
  if (Object.keys(pagination).length > 0) {
    body.pagination = pagination;
  }

  return body;
}

export function readResult(payload: unknown, label: string): Record<string, unknown> {
  const envelope = requiredResponseRecord(payload, label);
  return requiredResponseRecord(envelope.result, `${label} result`);
}

export function readOptionalResult(payload: unknown, label: string): Record<string, unknown> | null {
  const envelope = requiredResponseRecord(payload, label);
  if (envelope.result === null || envelope.result === undefined) {
    return null;
  }
  return requiredResponseRecord(envelope.result, `${label} result`);
}

export function readResultCollection(payload: unknown, label: string): Array<Record<string, unknown>> {
  const envelope = requiredResponseRecord(payload, label);
  if (!Array.isArray(envelope.result)) {
    throw new ProviderRequestError(502, `${label} result must be an array`);
  }

  return envelope.result.map((item) => requiredResponseRecord(item, `${label} item`));
}

export function readPagination(payload: unknown): AppleAdsPagination {
  const pagination = recordOrEmpty(recordOrEmpty(payload).pagination);
  return {
    offset: readResponseInteger(pagination.offset),
    pageSize: readResponseInteger(pagination.pageSize),
    totalCount: readResponseInteger(pagination.totalCount),
  };
}

export function readResponseInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function resolveAdAccountId(input: Record<string, unknown>, context: AppleAdsContext): string {
  const provided = input.adAccountId;
  if (provided !== undefined && provided !== null && provided !== "") {
    return readAppleAdsId(provided, "adAccountId");
  }
  if (context.defaultAdAccountId) {
    return readAppleAdsId(context.defaultAdAccountId, "adAccountId");
  }

  throw new ProviderRequestError(
    400,
    "adAccountId is required. Pass it in the action input, or set a default Ad Account ID on the connection.",
  );
}

export function readAppleAdsId(value: unknown, fieldName: string): string {
  const id =
    typeof value === "number" && Number.isInteger(value) ? String(value) : requiredInputString(value, fieldName);
  if (id === "." || id === ".." || id.includes("/") || id.includes("\\")) {
    throw new ProviderRequestError(400, `${fieldName} must be an Apple Ads identifier without path separators`);
  }

  return id;
}

export function asIdentifierText(value: unknown): string | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  return null;
}

export function readOptionalAppleAdsId(value: unknown, fieldName: string): string | undefined {
  return value === undefined || value === null || value === "" ? undefined : readAppleAdsId(value, fieldName);
}

export function readAppleAdsNumericId(value: unknown, fieldName: string): number {
  const id = readAppleAdsId(value, fieldName);
  if (!/^\d+$/.test(id)) {
    throw new ProviderRequestError(400, `${fieldName} must be a decimal Apple Ads identifier`);
  }

  const parsed = Number(id);
  if (!Number.isSafeInteger(parsed)) {
    throw new ProviderRequestError(
      400,
      `${fieldName} is larger than the identifiers this connector can send as a JSON number`,
    );
  }

  return parsed;
}

export function resourcePath(base: string, id: string, suffix?: string): string {
  return `${base}/${encodePathSegment(id)}${suffix ? `/${suffix}` : ""}`;
}

export function requireAnyAttribute(attributes: Record<string, unknown>, message: string): void {
  if (!Object.values(attributes).some((value) => value !== undefined)) {
    throw new ProviderRequestError(400, message, undefined, "invalid_input");
  }
}

async function readPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createAppleAdsError(
  status: number,
  payload: unknown,
  phase: AppleAdsPhase,
  response: Response,
): ProviderRequestError {
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(
      400,
      "Apple Ads refused the access token. Check that the API user still has access to the org and that the uploaded public key is current.",
      payload,
      "invalid_input",
    );
  }

  const message = readErrorMessage(status, payload);
  if (status === 429) {
    return new ProviderRequestError(
      429,
      message,
      {
        payload,
        retryAfterSeconds: readRetryAfterSeconds(response),
      },
      "rate_limited",
    );
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload, "invalid_input");
  }

  return new ProviderRequestError(400 <= status && status < 600 ? status : 502, message, payload);
}

function assertEnvelopeSucceeded(payload: unknown): void {
  const error = recordOrEmpty(payload).error;
  if (typeof error !== "object" || error === null || Array.isArray(error)) {
    return;
  }

  throw new ProviderRequestError(400, readErrorMessage(200, payload), payload, "invalid_input");
}

function readErrorMessage(status: number, payload: unknown): string {
  const error = recordOrEmpty(recordOrEmpty(payload).error);
  const details = looseArray(error.details);
  const firstDetail = recordOrEmpty(details[0]);
  const summary = [
    pickOptionalString(error, "code"),
    pickOptionalString(error, "message"),
    pickOptionalString(firstDetail, "code"),
    pickOptionalString(firstDetail, "message"),
  ]
    .filter((part) => part !== undefined)
    .join(": ");
  if (!summary) {
    return `Apple Ads request failed with HTTP ${status}`;
  }

  return details.length > 1 ? `${summary} (+${details.length - 1} more)` : summary;
}

function readRetryAfterSeconds(response: Response): number | null {
  const header = response.headers.get("retry-after") ?? response.headers.get("ratelimit-reset") ?? null;
  if (header === null) {
    return null;
  }
  const seconds = Number(header.trim());
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}
