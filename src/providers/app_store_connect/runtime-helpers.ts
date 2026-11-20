import {
  looseArray,
  recordOrEmpty,
  optionalInteger,
  optionalRecord,
  rawStringOrNull,
  compactObject,
  optionalBoolean,
  pickOptionalString,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const appStoreConnectApiOrigin = "https://api.appstoreconnect.apple.com";

const providerLabel = "App Store Connect";

export type AppStoreConnectPhase = "execute" | "validate";

export interface AppStoreConnectContext {
  authorization: () => Promise<string>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export interface AppStoreConnectRequest {
  path: string;
  method?: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  phase?: AppStoreConnectPhase;
}

export interface AppStoreConnectResponse {
  status: number;
  payload: unknown;
}

export type IncludedResources = Map<string, Record<string, unknown>>;

export interface AppStoreConnectPage {
  resources: Array<Record<string, unknown>>;
  included: IncludedResources;
  nextCursor: string | null;
  total: number | null;
}

export interface ListRequest {
  path: string;
  label: string;
  query?: Record<string, string | undefined>;
}

export type AppStoreConnectHandler = (
  input: Record<string, unknown>,
  context: AppStoreConnectContext,
) => Promise<unknown>;

export type AppStoreConnectHandlers = Record<string, AppStoreConnectHandler>;

export interface ResourceWriteRequest {
  path: string;

  type: string;
  label: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
}

export async function requestAppStoreConnect(
  context: AppStoreConnectContext,
  input: AppStoreConnectRequest,
): Promise<AppStoreConnectResponse> {
  const url = new URL(`${appStoreConnectApiOrigin}${input.path}`);
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
      throw createAppStoreConnectError(response.status, payload, input.phase ?? "execute");
    }
    return { status: response.status, payload };
  });
}

export async function listResources(
  context: AppStoreConnectContext,
  input: Record<string, unknown>,
  request: ListRequest,
): Promise<AppStoreConnectPage> {
  const limit = optionalInteger(input.limit);
  const { payload } = await requestAppStoreConnect(context, {
    path: request.path,
    query: {
      ...request.query,
      limit: limit === undefined ? undefined : String(limit),

      cursor: pickOptionalString(input, "cursor"),
    },
  });
  return {
    resources: readCollection(payload, request.label),
    included: indexIncludedResources(payload),
    nextCursor: readNextCursor(payload),
    total: readTotal(payload),
  };
}

export async function listPage(
  context: AppStoreConnectContext,
  input: Record<string, unknown>,
  request: ListRequest,
): Promise<{
  items: Array<Record<string, unknown>>;
  nextCursor: string | null;
  total: number | null;
}> {
  const page = await listResources(context, input, request);
  return {
    items: page.resources.map((resource) => normalizeResource(resource, request.label)),
    nextCursor: page.nextCursor,
    total: page.total,
  };
}

export async function getResource(
  context: AppStoreConnectContext,
  path: string,
  label: string,
  query?: Record<string, string | undefined>,
): Promise<Record<string, unknown>> {
  const { payload } = await requestAppStoreConnect(context, { path, query });
  return normalizeResource(readResource(payload, label), label);
}

export async function getOptionalResource(
  context: AppStoreConnectContext,
  path: string,
  label: string,
  query?: Record<string, string | undefined>,
): Promise<Record<string, unknown> | null> {
  const { payload } = await requestAppStoreConnect(context, { path, query });
  return readOptionalResource(payload, label);
}

export async function createResource(
  context: AppStoreConnectContext,
  request: ResourceWriteRequest,
): Promise<Record<string, unknown>> {
  const { payload } = await requestAppStoreConnect(context, {
    method: "POST",
    path: request.path,
    body: {
      data: compactObject({
        type: request.type,
        attributes: request.attributes ? compactObject(request.attributes) : undefined,
        relationships: request.relationships ? compactObject(request.relationships) : undefined,
      }),
    },
  });
  return normalizeResource(readResource(payload, request.label), request.label);
}

export async function updateResource(
  context: AppStoreConnectContext,
  request: ResourceWriteRequest & { id: string },
): Promise<Record<string, unknown>> {
  const { payload } = await requestAppStoreConnect(context, {
    method: "PATCH",
    path: request.path,
    body: {
      data: compactObject({
        type: request.type,
        id: request.id,
        attributes: request.attributes ? compactObject(request.attributes) : undefined,
        relationships: request.relationships ? compactObject(request.relationships) : undefined,
      }),
    },
  });
  return normalizeResource(readResource(payload, request.label), request.label);
}

export async function deleteResource(
  context: AppStoreConnectContext,
  path: string,
  label: string,
  allowedStatuses: readonly number[] = [204],
): Promise<void> {
  const response = await requestAppStoreConnect(context, { method: "DELETE", path });
  assertNoContent(response, allowedStatuses, label);
}

export async function modifyRelationship(
  context: AppStoreConnectContext,
  request: {
    path: string;
    method: "POST" | "DELETE" | "PATCH";
    type: string;
    ids: readonly string[];
    label: string;
  },
): Promise<void> {
  const response = await requestAppStoreConnect(context, {
    method: request.method,
    path: request.path,
    body: toManyLinkage(request.type, request.ids),
  });
  assertNoContent(response, [204], request.label);
}

export function resourcePath(base: string, id: string, suffix?: string): string {
  return `${base}/${encodePathSegment(id)}${suffix ? `/${suffix}` : ""}`;
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

function createAppStoreConnectError(
  status: number,
  payload: unknown,
  phase: AppStoreConnectPhase,
): ProviderRequestError {
  if (phase === "validate" && status === 401) {
    return new ProviderRequestError(
      400,
      "App Store Connect rejected the key. Check the Key ID, Issuer ID and private key.",
      payload,
    );
  }

  if (phase === "validate" && status === 403) {
    return new ProviderRequestError(
      400,
      "App Store Connect authenticated the key but refused to list apps. Grant the key a role that can read apps (for example Developer, App Manager or Admin), and check that the key has not been revoked.",
      payload,
    );
  }

  const message = readErrorMessage(status, payload);
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(responseStatus(status), message, payload);
}

function responseStatus(status: number): number {
  return 400 <= status && status < 600 ? status : 502;
}

function readErrorMessage(status: number, payload: unknown): string {
  const errors = looseArray(recordOrEmpty(payload).errors);
  const first = recordOrEmpty(errors[0]);

  const summary = [
    pickOptionalString(first, "code"),
    pickOptionalString(first, "title"),
    pickOptionalString(first, "detail"),
  ]
    .filter((part) => part !== undefined)
    .join(": ");
  if (!summary) {
    return `App Store Connect request failed with HTTP ${status}`;
  }

  return errors.length > 1 ? `${summary} (+${errors.length - 1} more)` : summary;
}

export function assertNoContent(
  response: AppStoreConnectResponse,
  allowedStatuses: readonly number[],
  label: string,
): void {
  if (!allowedStatuses.includes(response.status)) {
    throw new ProviderRequestError(
      502,
      `${label} answered HTTP ${response.status} instead of ${allowedStatuses.join(" or ")}`,
    );
  }
}

export function readResource(payload: unknown, label: string): Record<string, unknown> {
  const envelope = requiredResponseRecord(payload, label);
  return requiredResponseRecord(envelope.data, `${label} data`);
}

export function readOptionalRawResource(payload: unknown, label: string): Record<string, unknown> | null {
  const envelope = requiredResponseRecord(payload, label);
  if (envelope.data === null) {
    return null;
  }
  return requiredResponseRecord(envelope.data, `${label} data`);
}

export function readOptionalResource(payload: unknown, label: string): Record<string, unknown> | null {
  const resource = readOptionalRawResource(payload, label);
  return resource === null ? null : normalizeResource(resource, label);
}

export function readCollection(payload: unknown, label: string): Array<Record<string, unknown>> {
  const envelope = requiredResponseRecord(payload, label);
  return looseArray(envelope.data).map((item) => requiredResponseRecord(item, `${label} item`));
}

export function normalizeResource(resource: Record<string, unknown>, label: string): Record<string, unknown> {
  const id = pickOptionalString(resource, "id");
  if (!id) {
    throw new ProviderRequestError(502, `${label} is missing an id`);
  }

  return { id, ...recordOrEmpty(resource.attributes) };
}

export function indexIncludedResources(payload: unknown): IncludedResources {
  const included: IncludedResources = new Map();
  for (const item of looseArray(recordOrEmpty(payload).included)) {
    const resource = optionalRecord(item);
    const key = linkageKey(resource);
    if (resource && key) {
      included.set(key, resource);
    }
  }
  return included;
}

export function readIncludedResource(
  resource: Record<string, unknown>,
  relationship: string,
  included: IncludedResources,
): Record<string, unknown> | undefined {
  const linkage = optionalRecord(recordOrEmpty(recordOrEmpty(resource.relationships)[relationship]).data);
  const key = linkageKey(linkage);
  return key === undefined ? undefined : included.get(key);
}

export function readIncludedResources(
  resource: Record<string, unknown>,
  relationship: string,
  included: IncludedResources,
): Array<Record<string, unknown>> {
  const linkages = looseArray(recordOrEmpty(recordOrEmpty(resource.relationships)[relationship]).data);
  const resources: Array<Record<string, unknown>> = [];
  for (const linkage of linkages) {
    const key = linkageKey(optionalRecord(linkage));
    const found = key === undefined ? undefined : included.get(key);
    if (found) {
      resources.push(found);
    }
  }
  return resources;
}

export function readRelationshipId(resource: Record<string, unknown>, relationship: string): string | null {
  const linkage = recordOrEmpty(recordOrEmpty(recordOrEmpty(resource.relationships)[relationship]).data);
  return pickOptionalString(linkage, "id") ?? null;
}

export function readRelationshipIds(resource: Record<string, unknown>, relationship: string): string[] {
  const ids: string[] = [];
  for (const linkage of looseArray(recordOrEmpty(recordOrEmpty(resource.relationships)[relationship]).data)) {
    const id = pickOptionalString(recordOrEmpty(linkage), "id");
    if (id) {
      ids.push(id);
    }
  }
  return ids;
}

function linkageKey(resource: Record<string, unknown> | undefined): string | undefined {
  if (!resource) {
    return undefined;
  }
  const type = pickOptionalString(resource, "type");
  const id = pickOptionalString(resource, "id");
  return type && id ? `${type}:${id}` : undefined;
}

export function readNextCursor(payload: unknown): string | null {
  const next = pickOptionalString(recordOrEmpty(recordOrEmpty(payload).links), "next");
  if (next) {
    try {
      const cursor = new URL(next).searchParams.get("cursor");
      if (cursor) {
        return cursor;
      }
    } catch {}
  }

  return pickOptionalString(readPaging(payload), "nextCursor") ?? null;
}

export function readTotal(payload: unknown): number | null {
  return readResponseInteger(readPaging(payload).total);
}

function readPaging(payload: unknown): Record<string, unknown> {
  return recordOrEmpty(recordOrEmpty(recordOrEmpty(payload).meta).paging);
}

export function readResponseInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function readAppSummary(resource: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!resource) {
    return null;
  }

  const app = normalizeResource(resource, "App Store Connect app");
  return { id: app.id, name: rawStringOrNull(app.name), bundleId: rawStringOrNull(app.bundleId) };
}

export function readPreReleaseVersionSummary(
  resource: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!resource) {
    return null;
  }

  const version = normalizeResource(resource, "App Store Connect prerelease version");
  return {
    id: version.id,
    version: rawStringOrNull(version.version),
    platform: rawStringOrNull(version.platform),
  };
}

export function readBetaReviewSubmissionSummary(
  resource: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!resource) {
    return null;
  }

  const submission = normalizeResource(resource, "App Store Connect beta app review submission");
  return {
    id: submission.id,
    betaReviewState: rawStringOrNull(submission.betaReviewState),
    submittedDate: rawStringOrNull(submission.submittedDate),
  };
}

export function readAppStoreConnectId(value: unknown, fieldName: string): string {
  const id = requiredInputString(value, fieldName);
  if (id === "." || id === "..") {
    throw new ProviderRequestError(400, `${fieldName} must not be . or ..`);
  }

  return id;
}

export function readOptionalAppStoreConnectId(value: unknown, fieldName: string): string | undefined {
  return value === undefined || value === null || value === "" ? undefined : readAppStoreConnectId(value, fieldName);
}

export function readStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter((item): item is string => typeof item === "string");
  return items.length === value.length ? items : undefined;
}

export function readIdentifierList(value: unknown, fieldName: string): string[] {
  const identifiers = readStringList(value);
  if (!identifiers?.length) {
    throw new ProviderRequestError(400, `${fieldName} must contain at least one identifier`);
  }
  for (const identifier of identifiers) {
    readAppStoreConnectId(identifier, fieldName);
  }

  return identifiers;
}

export function hasAnyAttribute(attributes: Record<string, unknown>): boolean {
  return Object.values(attributes).some((value) => value !== undefined);
}

export function requireAnyAttribute(attributes: Record<string, unknown>, message: string): void {
  if (!hasAnyAttribute(attributes)) {
    throw new ProviderRequestError(400, message);
  }
}

export function requireInputBoolean(value: unknown, fieldName: string): boolean {
  const flag = optionalBoolean(value);
  if (flag === undefined) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return flag;
}

export function readCommaSeparatedList(value: unknown): string | undefined {
  const values = readStringList(value);
  return values?.length ? values.join(",") : undefined;
}

export function readOptionalIdentifierFilter(value: unknown, fieldName: string): string | undefined {
  return value === undefined || value === null ? undefined : readIdentifierList(value, fieldName).join(",");
}

export function readIntegerQuery(value: unknown): string | undefined {
  const integer = optionalInteger(value);
  return integer === undefined ? undefined : String(integer);
}

export function toOneLinkage(type: string, id: string): { data: { type: string; id: string } } {
  return { data: { type, id } };
}

export function toOptionalOneLinkage(
  type: string,
  id: string | undefined,
): { data: { type: string; id: string } } | undefined {
  return id === undefined ? undefined : toOneLinkage(type, id);
}

export function toManyLinkage(type: string, ids: readonly string[]): { data: Array<{ type: string; id: string }> } {
  return { data: ids.map((id) => ({ type, id })) };
}
