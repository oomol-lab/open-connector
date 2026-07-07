import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { NetsuiteActionName } from "./actions.ts";

import { createHmac, randomBytes } from "node:crypto";
import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const netsuiteRecordPathPrefix = "/services/rest/record/v1";
const netsuiteQueryPathPrefix = "/services/rest/query/v1";
const netsuiteValidationPath = `${netsuiteRecordPathPrefix}/metadata-catalog`;
const netsuiteRequestTimeoutMs = 30_000;

type NetsuiteMode = "validate" | "execute";
type NetsuiteActionHandler = ProviderRuntimeHandler<NetsuiteContext>;
type JsonPayloadReadResult =
  | { kind: "empty" }
  | { kind: "json"; value: unknown }
  | { kind: "invalid_json"; raw: string };

const emptyResponsePayload = Symbol("netsuiteEmptyResponsePayload");

interface NetsuiteResponsePayload {
  payload: unknown | typeof emptyResponsePayload;
  location?: string;
}

interface NetsuiteCredential {
  accountId: string;
  consumerKey: string;
  consumerSecret: string;
  tokenId: string;
  tokenSecret: string;
}

export interface NetsuiteContext extends NetsuiteCredential {
  restBaseUrl: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface NetsuiteRequestOptions {
  context: NetsuiteContext;
  path: string;
  mode: NetsuiteMode;
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  extraHeaders?: Record<string, string>;
  notFoundAsInvalidInput?: boolean;
}

interface OAuthHeaderInput {
  credential: NetsuiteCredential;
  method: string;
  url: URL;
}

export const netsuiteActionHandlers: Record<NetsuiteActionName, NetsuiteActionHandler> = {
  run_suiteql(input, context) {
    return runSuiteql(input, context);
  },
  list_records(input, context) {
    return listRecords(input, context);
  },
  get_record(input, context) {
    return getRecord(input, context);
  },
  create_record(input, context) {
    return createRecord(input, context);
  },
  update_record(input, context) {
    return updateRecord(input, context);
  },
};

export function resolveNetsuiteCredentialContext(
  values: Record<string, string>,
  metadata: Record<string, unknown> | undefined,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): NetsuiteContext {
  const credential = readCredential(values);
  const restBaseUrl = resolveRestBaseUrlFromMetadata(metadata, credential);
  return {
    ...credential,
    restBaseUrl,
    fetcher,
    signal,
  };
}

export async function validateNetsuiteCredential(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = resolveNetsuiteCredentialContext(values, undefined, fetcher, signal);
  await requestNetsuiteJson({
    context,
    path: netsuiteValidationPath,
    query: {
      select: "recordTypes",
    },
    mode: "validate",
  });

  return {
    profile: {
      accountId: context.accountId,
      displayName: `NetSuite ${context.accountId}`,
    },
    grantedScopes: [],
    metadata: {
      accountId: context.accountId,
      restBaseUrl: context.restBaseUrl,
      apiBaseUrl: context.restBaseUrl,
      validationEndpoint: netsuiteValidationPath,
    },
  };
}

async function runSuiteql(input: Record<string, unknown>, context: NetsuiteContext): Promise<unknown> {
  return {
    result: normalizeCollection(
      await requestNetsuiteJson({
        context,
        path: `${netsuiteQueryPathPrefix}/suiteql`,
        query: compactObject({
          limit: optionalPositiveInteger(input.limit, "limit"),
          offset: optionalNonNegativeInteger(input.offset, "offset"),
        }),
        method: "POST",
        body: {
          q: requiredInputString(input.query, "query"),
        },
        extraHeaders: {
          Prefer: "transient",
        },
        mode: "execute",
      }),
    ),
  };
}

async function listRecords(input: Record<string, unknown>, context: NetsuiteContext): Promise<unknown> {
  const recordType = requiredInputString(input.recordType, "recordType");
  return {
    records: normalizeCollection(
      await requestNetsuiteJson({
        context,
        path: `${netsuiteRecordPathPrefix}/${encodeURIComponent(recordType)}`,
        query: compactObject({
          limit: optionalPositiveInteger(input.limit, "limit"),
          offset: optionalNonNegativeInteger(input.offset, "offset"),
          q: optionalString(input.q),
        }),
        mode: "execute",
      }),
    ),
  };
}

async function getRecord(input: Record<string, unknown>, context: NetsuiteContext): Promise<unknown> {
  const recordType = requiredInputString(input.recordType, "recordType");
  const recordId = requiredInputString(input.recordId, "recordId");
  return {
    record: normalizeRecord(
      await requestNetsuiteJson({
        context,
        path: `${netsuiteRecordPathPrefix}/${encodeURIComponent(recordType)}/${encodeURIComponent(recordId)}`,
        query: compactObject({
          expandSubResources: optionalBoolean(input.expandSubResources),
        }),
        mode: "execute",
        notFoundAsInvalidInput: true,
      }),
    ),
  };
}

async function createRecord(input: Record<string, unknown>, context: NetsuiteContext): Promise<unknown> {
  const recordType = requiredInputString(input.recordType, "recordType");
  const result = await requestNetsuiteJsonWithMetadata({
    context,
    path: `${netsuiteRecordPathPrefix}/${encodeURIComponent(recordType)}`,
    method: "POST",
    body: requiredRecord(input.body, "body", providerInputError),
    mode: "execute",
  });
  const record = result.payload === emptyResponsePayload ? undefined : normalizeRecord(result.payload);

  return compactObject({
    ok: true,
    location: result.location,
    record,
  });
}

async function updateRecord(input: Record<string, unknown>, context: NetsuiteContext): Promise<unknown> {
  const recordType = requiredInputString(input.recordType, "recordType");
  const recordId = requiredInputString(input.recordId, "recordId");
  const result = await requestNetsuiteJsonWithMetadata({
    context,
    path: `${netsuiteRecordPathPrefix}/${encodeURIComponent(recordType)}/${encodeURIComponent(recordId)}`,
    method: "PATCH",
    body: requiredRecord(input.body, "body", providerInputError),
    mode: "execute",
    notFoundAsInvalidInput: true,
  });
  const record = result.payload === emptyResponsePayload ? undefined : optionalRecord(result.payload);

  return compactObject({
    ok: true,
    location: result.location,
    record,
  });
}

async function requestNetsuiteJson(input: NetsuiteRequestOptions): Promise<unknown> {
  return (await requestNetsuiteJsonWithMetadata(input)).payload;
}

async function requestNetsuiteJsonWithMetadata(input: NetsuiteRequestOptions): Promise<NetsuiteResponsePayload> {
  const timeout = createProviderTimeout(input.context.signal, netsuiteRequestTimeoutMs);
  try {
    let response: Response;
    try {
      response = await netsuiteFetch(input, timeout.signal);
    } catch (error) {
      throw new ProviderRequestError(
        timeout.didTimeout() || isAbortLikeError(error) ? 504 : 502,
        error instanceof Error ? `NetSuite request failed: ${error.message}` : "NetSuite request failed",
      );
    }

    const payload = await readJsonPayload(response);
    if (!response.ok) {
      const message = payload.kind === "json" ? readErrorMessage(payload.value) : undefined;
      throw mapNetsuiteError(response.status, message, input.mode, input.notFoundAsInvalidInput === true);
    }

    if (payload.kind === "invalid_json") {
      throw new ProviderRequestError(502, "NetSuite returned invalid JSON");
    }

    if (payload.kind === "empty") {
      return {
        payload: emptyResponsePayload,
        location: response.headers.get("location") ?? undefined,
      };
    }

    return {
      payload: payload.value,
      location: response.headers.get("location") ?? undefined,
    };
  } finally {
    timeout.cleanup();
  }
}

function netsuiteFetch(input: NetsuiteRequestOptions, signal: AbortSignal): Promise<Response> {
  const url = buildNetsuiteUrl(input.context.restBaseUrl, input.path, input.query);
  const method = input.method ?? "GET";
  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
    ...input.extraHeaders,
  });

  let body: string | undefined;
  if (input.body) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(input.body);
  }

  headers.set(
    "authorization",
    buildOAuthAuthorizationHeader({
      credential: input.context,
      method,
      url,
    }),
  );

  return input.context.fetcher(url, {
    method,
    headers,
    body,
    signal,
  });
}

function readCredential(input: Record<string, string>): NetsuiteCredential {
  return {
    accountId: requireCredentialString(input, "accountId"),
    consumerKey: requireCredentialString(input, "consumerKey"),
    consumerSecret: requireCredentialString(input, "consumerSecret"),
    tokenId: requireCredentialString(input, "tokenId"),
    tokenSecret: requireCredentialString(input, "tokenSecret"),
  };
}

function requireCredentialString(input: Record<string, string>, fieldName: keyof NetsuiteCredential): string {
  return requiredString(input[fieldName], fieldName, providerInputError);
}

function buildRestBaseUrl(accountId: string): string {
  const accountSlug = normalizeAccountSlug(accountId);
  return `https://${accountSlug}.suitetalk.api.netsuite.com`;
}

function resolveRestBaseUrlFromMetadata(
  metadata: Record<string, unknown> | undefined,
  credential: NetsuiteCredential,
): string {
  const metadataUrl = optionalString(metadata?.restBaseUrl) ?? optionalString(metadata?.apiBaseUrl);
  return metadataUrl ? normalizeRestBaseUrl(metadataUrl) : buildRestBaseUrl(credential.accountId);
}

function normalizeRestBaseUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new ProviderRequestError(400, "restBaseUrl must be a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "restBaseUrl must use https");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new ProviderRequestError(400, "restBaseUrl must not include a path or query");
  }
  if (!url.hostname.endsWith(".suitetalk.api.netsuite.com")) {
    throw new ProviderRequestError(400, "restBaseUrl must use a NetSuite REST host");
  }

  return url.origin;
}

function normalizeAccountSlug(accountId: string): string {
  const trimmed = accountId.trim();
  if (trimmed.includes("/") || trimmed.includes("?") || trimmed.includes("#") || trimmed.includes(".")) {
    throw new ProviderRequestError(400, "accountId must be the NetSuite account ID, not a REST host or URL");
  }

  const slug = trimmed.toLowerCase().replaceAll("_", "-");
  if (!slug || slug.startsWith("-") || slug.endsWith("-") || !isAccountIdLike(trimmed)) {
    throw new ProviderRequestError(400, "accountId must be a NetSuite account ID");
  }

  return slug;
}

function isAccountIdLike(value: string): boolean {
  for (const char of value) {
    if (!isAccountIdChar(char)) {
      return false;
    }
  }
  return true;
}

function isAccountIdChar(char: string): boolean {
  return (
    (char >= "0" && char <= "9") ||
    (char >= "A" && char <= "Z") ||
    (char >= "a" && char <= "z") ||
    char === "_" ||
    char === "-"
  );
}

function buildNetsuiteUrl(
  restBaseUrl: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): URL {
  const url = new URL(path, restBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

export function buildOAuthAuthorizationHeader(input: OAuthHeaderInput): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: input.credential.consumerKey,
    oauth_token: input.credential.tokenId,
    oauth_signature_method: "HMAC-SHA256",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_version: "1.0",
  };
  const signature = signOAuthRequest({
    ...input,
    oauthParams,
  });

  return [
    `OAuth realm="${encodeOAuthHeaderValue(input.credential.accountId)}"`,
    ...Object.entries({
      ...oauthParams,
      oauth_signature: signature,
    }).map(([key, value]) => `${encodeURIComponent(key)}="${encodeOAuthHeaderValue(value)}"`),
  ].join(",");
}

function signOAuthRequest(input: OAuthHeaderInput & { oauthParams: Record<string, string> }): string {
  const params = new URLSearchParams(input.url.search);
  for (const [key, value] of Object.entries(input.oauthParams)) {
    params.append(key, value);
  }

  const parameterString = Array.from(params.entries())
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyComparison = leftKey.localeCompare(rightKey);
      return keyComparison === 0 ? leftValue.localeCompare(rightValue) : keyComparison;
    })
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const signatureBaseString = [
    input.method.toUpperCase(),
    encodeRfc3986(`${input.url.origin}${input.url.pathname}`),
    encodeRfc3986(parameterString),
  ].join("&");
  const signingKey = `${encodeRfc3986(input.credential.consumerSecret)}&${encodeRfc3986(input.credential.tokenSecret)}`;

  return createHmac("sha256", signingKey).update(signatureBaseString).digest("base64");
}

function encodeOAuthHeaderValue(value: string): string {
  return encodeRfc3986(value);
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value)
    .replaceAll("!", "%21")
    .replaceAll("'", "%27")
    .replaceAll("(", "%28")
    .replaceAll(")", "%29")
    .replaceAll("*", "%2A");
}

async function readJsonPayload(response: Response): Promise<JsonPayloadReadResult> {
  const text = await response.text();
  if (!text) {
    return { kind: "empty" };
  }

  try {
    return { kind: "json", value: JSON.parse(text) as unknown };
  } catch {
    return { kind: "invalid_json", raw: text };
  }
}

function readErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  const detail = optionalString(object.detail);
  if (detail) {
    return detail;
  }

  const title = optionalString(object.title);
  if (title) {
    return title;
  }

  const message = optionalString(object.message);
  if (message) {
    return message;
  }

  const errors = Array.isArray(object["o:errorDetails"]) ? object["o:errorDetails"] : undefined;
  const first = optionalRecord(errors?.[0]);
  return optionalString(first?.detail) ?? optionalString(first?.message);
}

function mapNetsuiteError(
  status: number,
  message: string | undefined,
  mode: NetsuiteMode,
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const detail = message ? `: ${message}` : "";
  if (mode === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, `NetSuite rejected the credential${detail}`);
  }

  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, `NetSuite rejected the credential${detail}`);
  }

  if (status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(404, `NetSuite resource was not found${detail}`);
  }

  if (status === 429) {
    return new ProviderRequestError(429, `NetSuite rate limit exceeded${detail}`);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, `NetSuite rejected the request${detail}`);
  }

  return new ProviderRequestError(502, `NetSuite request failed${detail}`);
}

function normalizeCollection(payload: unknown): Record<string, unknown> {
  const object = requiredRecord(payload, "NetSuite response", providerOutputError);
  return {
    ...object,
    links: Array.isArray(object.links) ? object.links : [],
    count: readInteger(object.count, "count", 0),
    hasMore: typeof object.hasMore === "boolean" ? object.hasMore : false,
    offset: readInteger(object.offset, "offset", 0),
    totalResults: readInteger(object.totalResults, "totalResults", readInteger(object.count, "count", 0)),
    items: Array.isArray(object.items)
      ? object.items.map((item, index) => requiredRecord(item, `items[${index}]`, providerOutputError))
      : [],
  };
}

function normalizeRecord(payload: unknown): Record<string, unknown> {
  return requiredRecord(payload, "NetSuite record", providerOutputError);
}

function readInteger(value: unknown, fieldName: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  throw new ProviderRequestError(502, `NetSuite ${fieldName} must be an integer`);
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, providerInputError);
}

function optionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  const result = optionalInteger(value);
  if (value == null) {
    return undefined;
  }
  if (result === undefined || result <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return result;
}

function optionalNonNegativeInteger(value: unknown, fieldName: string): number | undefined {
  const result = optionalInteger(value);
  if (value == null) {
    return undefined;
  }
  if (result === undefined || result < 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-negative integer`);
  }
  return result;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerOutputError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
