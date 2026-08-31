import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderFetch } from "../provider-runtime.ts";
import type { TikHubEndpointMethod } from "./endpoint-policy.ts";

import {
  compactObject,
  optionalRecord as asOptionalObject,
  optionalString as asOptionalString,
  requiredString,
} from "../../core/cast.ts";
import { createProviderTimeout, isAbortLikeError, providerUserAgent } from "../provider-runtime.ts";
import { BoundedResponseTooLargeError, readBoundedResponseText } from "./bounded-response.ts";
import { discoverTikHubEndpoints } from "./endpoint-catalog.ts";
import {
  assertResolvedTikHubEndpointEligible,
  assertTikHubEndpointEligible,
  hasTikHubControlCharacter,
} from "./endpoint-policy.ts";
import { TikHubRequestError } from "./errors.ts";

const tikhubApiBaseUrl = "https://api.tikhub.io";
const tikhubUserScope = "/api/v1/tikhub/user/";
const tikhubUserRequestTimeoutMs = 45_000;
const tikhubDynamicRequestTimeoutMs = 60_000;
const tikhubDynamicRequestMaxBytes = 256 * 1024;
const tikhubDynamicResponseMaxBytes = 4 * 1024 * 1024;
const tikhubDynamicStringMaxBytes = 64 * 1024;
const tikhubDynamicMaxJsonDepth = 64;
const tikhubDynamicMaxQueryKeys = 128;
const tikhubDynamicMaxQueryValues = 256;

type TikHubPhase = "validate" | "execute";
type TikHubActionHandler = (input: Record<string, unknown>, fetcher: typeof fetch, apiKey: string) => Promise<unknown>;
type TikHubProviderActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

type TikHubEnvelope = {
  code?: number | null;
  requestId?: string | null;
  message?: string | null;
  router?: string | null;
  params?: Record<string, unknown> | null;
};

const executeTikHubHandlers: Record<string, TikHubActionHandler> = {
  async get_user_daily_usage(_input, fetcher, apiKey) {
    const payload = await requestTikHubUserJson({
      path: "/api/v1/tikhub/user/get_user_daily_usage",
      apiKey,
      fetcher,
      phase: "execute",
    });
    return {
      envelope: normalizeEnvelope(payload),
      usage: Array.isArray(payload.data) ? payload.data.filter(isRecord) : [],
      rawData: payload.data,
      raw: payload,
    };
  },

  async get_user_info(_input, fetcher, apiKey) {
    const payload = await requestTikHubUserJson({
      path: "/api/v1/tikhub/user/get_user_info",
      apiKey,
      fetcher,
      phase: "execute",
    });
    return normalizeUserInfo(payload);
  },

  async get_endpoint_info(input, fetcher, apiKey) {
    const endpoint = readEndpoint(input.endpoint);
    const payload = await requestTikHubUserJson({
      path: "/api/v1/tikhub/user/get_endpoint_info",
      apiKey,
      query: { endpoint },
      fetcher,
      phase: "execute",
    });
    return {
      envelope: normalizeEnvelope(payload),
      endpoint,
      endpointInfo: payload.data,
      raw: payload,
    };
  },

  async get_all_endpoints_info(_input, fetcher, apiKey) {
    const payload = await requestTikHubUserJson({
      path: "/api/v1/tikhub/user/get_all_endpoints_info",
      apiKey,
      fetcher,
      phase: "execute",
    });
    return {
      envelope: normalizeEnvelope(payload),
      endpoints: payload.data,
      raw: payload,
    };
  },

  async calculate_price(input, fetcher, apiKey) {
    const endpoint = readEndpoint(input.endpoint);
    const requestPerDay =
      typeof input.requestPerDay === "number" && Number.isInteger(input.requestPerDay) ? input.requestPerDay : 1;
    const payload = await requestTikHubUserJson({
      path: "/api/v1/tikhub/user/calculate_price",
      apiKey,
      query: { endpoint, request_per_day: String(requestPerDay) },
      fetcher,
      phase: "execute",
    });
    return {
      envelope: normalizeEnvelope(payload),
      endpoint,
      requestPerDay,
      price: payload.data,
      raw: payload,
    };
  },

  async discover_endpoints(input, fetcher) {
    return discoverTikHubEndpoints(
      {
        query: asOptionalString(input.query),
        category: asOptionalString(input.category),
        cursor: input.cursor === null ? null : asOptionalString(input.cursor),
        limit: typeof input.limit === "number" ? input.limit : undefined,
      },
      fetcher,
    );
  },

  async invoke_endpoint(input, fetcher, apiKey) {
    return invokeTikHubEndpoint(input, fetcher, apiKey);
  },
};

export const tikhubActionHandlers: ProviderActionHandlers<"tikhub", TikHubProviderActionHandler> = {
  get_user_daily_usage: adaptTikHubHandler(executeTikHubHandlers.get_user_daily_usage),
  get_user_info: adaptTikHubHandler(executeTikHubHandlers.get_user_info),
  get_endpoint_info: adaptTikHubHandler(executeTikHubHandlers.get_endpoint_info),
  get_all_endpoints_info: adaptTikHubHandler(executeTikHubHandlers.get_all_endpoints_info),
  calculate_price: adaptTikHubHandler(executeTikHubHandlers.calculate_price),
  discover_endpoints: adaptTikHubHandler(executeTikHubHandlers.discover_endpoints),
  invoke_endpoint: adaptTikHubHandler(executeTikHubHandlers.invoke_endpoint),
};

function adaptTikHubHandler(handler: TikHubActionHandler): TikHubProviderActionHandler {
  return (input, context) => handler(input, context.fetcher, context.apiKey);
}

export async function validateTikHubCredential(
  input: Record<string, string>,
  fetcher: ProviderFetch,
): Promise<CredentialValidationResult> {
  const payload = await requestTikHubUserJson({
    path: "/api/v1/tikhub/user/get_user_info",
    apiKey: requiredString(input.apiKey, "apiKey", (message) => new TikHubRequestError("invalid_input", message, 401)),
    fetcher,
    phase: "validate",
  });
  const normalized = normalizeUserInfo(payload);

  return {
    profile: {
      accountId: asOptionalString(normalized.apiKey?.api_key_name) ?? "tikhub-api-key",
      displayName:
        asOptionalString(normalized.user?.email) ??
        asOptionalString(normalized.apiKey?.api_key_name) ??
        "TikHub API Key",
      grantedScopes: normalized.scopes,
    },
    grantedScopes: normalized.scopes,
    metadata: compactObject({
      validationEndpoint: "/api/v1/tikhub/user/get_user_info",
      apiKeyName: normalized.apiKey?.api_key_name,
      apiKeyStatus: normalized.apiKey?.api_key_status,
      balance: normalized.user?.balance,
      freeCredit: normalized.user?.free_credit,
      emailVerified: normalized.user?.email_verified,
      requiredScope: tikhubUserScope,
    }),
  };
}

async function invokeTikHubEndpoint(input: Record<string, unknown>, fetcher: typeof fetch, apiKey: string) {
  const method = readMethod(input.method);
  const pathTemplate = readRequiredString(input.path, "path");
  const policy = assertTikHubEndpointEligible(method, pathTemplate);
  const request = asRecordOrEmpty(input.request, "request");
  assertDynamicInvocationWithinLimits({ method, path: pathTemplate, request });
  const pathValues = asRecordOrEmpty(request.path, "request.path");
  const finalPath = resolvePathTemplate(pathTemplate, policy.placeholders, pathValues);
  const finalPolicy = assertResolvedTikHubEndpointEligible(method, finalPath);
  const query = buildQuery(request.query);
  const body = buildRequestBody(method, request.body);
  const url = new URL(finalPath, tikhubApiBaseUrl);
  const queryString = query.toString();
  if (queryString !== "") {
    url.search = queryString;
  }
  const serializedBody = method === "POST" && body !== undefined ? JSON.stringify(body) : undefined;
  assertSerializedDynamicRequestWithinLimits(url, serializedBody);

  const timeout = createProviderTimeout(undefined, tikhubDynamicRequestTimeoutMs);
  try {
    const response = await fetcher(url, {
      method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        ...(serializedBody === undefined ? {} : { "content-type": "application/json" }),
        "user-agent": providerUserAgent,
      },
      ...(serializedBody === undefined ? {} : { body: serializedBody }),
      redirect: "error",
      signal: timeout.signal,
    });
    let responseBody: unknown;
    try {
      responseBody = await readTikHubResponseBody(response, tikhubDynamicResponseMaxBytes);
    } catch (error) {
      if (error instanceof BoundedResponseTooLargeError && !response.ok) {
        throw createDynamicTikHubError({
          upstreamStatus: response.status,
          body: { bodyTooLarge: true, bodyTruncated: true },
          requiredScope: finalPolicy.requiredScope,
        });
      }
      throw error;
    }
    const responseRecord = asOptionalObject(responseBody);
    const hasBusinessCode = responseRecord ? Object.hasOwn(responseRecord, "code") : false;
    const rawBusinessCode = hasBusinessCode ? responseRecord?.code : undefined;
    const businessCode = typeof rawBusinessCode === "number" ? rawBusinessCode : undefined;
    const requestId = responseRecord ? asOptionalString(responseRecord.request_id) : undefined;

    if (response.ok && hasBusinessCode && businessCode === undefined) {
      throw new TikHubRequestError(
        "provider_error",
        "TikHub returned an invalid business code",
        502,
        compactObject({
          upstreamStatus: response.status,
          businessCode: rawBusinessCode,
          requestId,
          body: responseBody,
        }),
      );
    }

    if (!response.ok || !isSuccessfulBusinessCode(businessCode)) {
      throw createDynamicTikHubError({
        upstreamStatus: response.status,
        businessCode: rawBusinessCode,
        requestId,
        body: responseBody,
        requiredScope: finalPolicy.requiredScope,
      });
    }
    if (!responseRecord) {
      throw new TikHubRequestError("provider_error", "TikHub returned an invalid successful response payload", 502);
    }

    return {
      method,
      path: finalPath,
      status: response.status,
      requestId: requestId ?? null,
      response: responseRecord,
    };
  } catch (error) {
    if (error instanceof TikHubRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new TikHubRequestError("provider_error", "TikHub request timed out", 504);
    }
    throw new TikHubRequestError("provider_error", "TikHub endpoint request failed", 502);
  } finally {
    timeout.cleanup();
  }
}

function resolvePathTemplate(pathTemplate: string, placeholders: string[], pathValues: Record<string, unknown>) {
  const providedNames = Object.keys(pathValues).sort();
  const expectedNames = [...placeholders].sort();
  if (JSON.stringify(providedNames) !== JSON.stringify(expectedNames)) {
    throw new TikHubRequestError(
      "invalid_input",
      "request.path must provide exactly one value for every path placeholder",
      400,
    );
  }

  const encodedValues = new Map<string, string>();
  for (const placeholder of placeholders) {
    encodedValues.set(placeholder, encodePathValue(pathValues[placeholder], placeholder));
  }
  return pathTemplate
    .split("/")
    .map((segment) => {
      if (!segment.startsWith("{") || !segment.endsWith("}")) {
        return segment;
      }
      return encodedValues.get(segment.slice(1, -1))!;
    })
    .join("/");
}

function encodePathValue(value: unknown, fieldName: string) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    throw new TikHubRequestError(
      "invalid_input",
      `request.path.${fieldName} must be a string, number, or boolean`,
      400,
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TikHubRequestError("invalid_input", `request.path.${fieldName} must be finite`, 400);
  }
  const text = String(value);
  if (
    text === "" ||
    text === "." ||
    text === ".." ||
    text.includes("/") ||
    text.includes("\\") ||
    text.includes("?") ||
    text.includes("#") ||
    text.includes("%") ||
    hasTikHubControlCharacter(text)
  ) {
    throw new TikHubRequestError(
      "invalid_input",
      `request.path.${fieldName} cannot contain a path separator or URL control character`,
      400,
    );
  }
  return encodeURIComponent(text);
}

function buildQuery(value: unknown) {
  const query = asRecordOrEmpty(value, "request.query");
  const entries = Object.entries(query);
  if (entries.length > tikhubDynamicMaxQueryKeys) {
    throw new TikHubRequestError(
      "invalid_input",
      `request.query cannot contain more than ${tikhubDynamicMaxQueryKeys} keys`,
      400,
    );
  }
  const result = new URLSearchParams();
  let valueCount = 0;
  for (const [key, rawValue] of entries) {
    if (key === "" || hasTikHubControlCharacter(key)) {
      throw new TikHubRequestError("invalid_input", "request.query contains an invalid key", 400);
    }
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    valueCount += values.length;
    if (valueCount > tikhubDynamicMaxQueryValues) {
      throw new TikHubRequestError(
        "invalid_input",
        `request.query cannot contain more than ${tikhubDynamicMaxQueryValues} scalar values`,
        400,
      );
    }
    for (const item of values) {
      result.append(key, serializeQueryScalar(item, key));
    }
  }
  return result;
}

function serializeQueryScalar(value: unknown, fieldName: string) {
  if (value === null) {
    return "null";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TikHubRequestError("invalid_input", `request.query.${fieldName} must contain finite numbers`, 400);
    }
    return String(value);
  }
  if (typeof value === "string" || typeof value === "boolean") {
    assertDynamicStringAllowed(value, `request.query.${fieldName}`);
    return String(value);
  }
  throw new TikHubRequestError(
    "invalid_input",
    `request.query.${fieldName} must be a JSON scalar or scalar array`,
    400,
  );
}

function buildRequestBody(method: TikHubEndpointMethod, value: unknown) {
  if (method === "GET") {
    if (value !== undefined && value !== null) {
      throw new TikHubRequestError("invalid_input", "GET endpoints cannot receive request.body", 400);
    }
    return undefined;
  }
  if (value === undefined) {
    return undefined;
  }
  assertJsonValue(value, "request.body");
  return value;
}

function assertDynamicInvocationWithinLimits(invocation: Record<string, unknown>) {
  assertJsonValue(invocation, "invocation");
  let serialized: string;
  try {
    serialized = JSON.stringify(invocation);
  } catch {
    throw new TikHubRequestError("invalid_input", "invocation must be JSON serializable", 400);
  }
  if (new TextEncoder().encode(serialized).byteLength > tikhubDynamicRequestMaxBytes) {
    throw new TikHubRequestError(
      "invalid_input",
      `invocation exceeds the ${tikhubDynamicRequestMaxBytes} byte limit`,
      400,
    );
  }
}

function assertSerializedDynamicRequestWithinLimits(url: URL, body: string | undefined) {
  const serializedRequest = body === undefined ? url.href : `${url.href}\n${body}`;
  if (new TextEncoder().encode(serializedRequest).byteLength > tikhubDynamicRequestMaxBytes) {
    throw new TikHubRequestError(
      "invalid_input",
      `serialized request exceeds the ${tikhubDynamicRequestMaxBytes} byte limit`,
      400,
    );
  }
}

function assertJsonValue(value: unknown, path: string) {
  type Frame = { kind: "visit"; value: unknown; path: string; depth: number } | { kind: "leave"; value: object };
  const stack: Frame[] = [{ kind: "visit", value, path, depth: 0 }];
  const ancestors = new Set<object>();

  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.kind === "leave") {
      ancestors.delete(frame.value);
      continue;
    }
    if (frame.depth > tikhubDynamicMaxJsonDepth) {
      throw new TikHubRequestError(
        "invalid_input",
        `${frame.path} exceeds the ${tikhubDynamicMaxJsonDepth} level JSON depth limit`,
        400,
      );
    }
    const current = frame.value;
    if (current === null || typeof current === "boolean") {
      continue;
    }
    if (typeof current === "string") {
      assertDynamicStringAllowed(current, frame.path);
      continue;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        throw new TikHubRequestError("invalid_input", `${frame.path} contains a non-finite number`, 400);
      }
      continue;
    }
    if (typeof current !== "object") {
      throw new TikHubRequestError("invalid_input", `${frame.path} contains a non-JSON value`, 400);
    }
    if (ancestors.has(current)) {
      throw new TikHubRequestError("invalid_input", `${frame.path} contains a circular value`, 400);
    }
    ancestors.add(current);
    stack.push({ kind: "leave", value: current });
    if (Array.isArray(current)) {
      for (let index = current.length - 1; index >= 0; index -= 1) {
        stack.push({
          kind: "visit",
          value: current[index],
          path: `${frame.path}[${index}]`,
          depth: frame.depth + 1,
        });
      }
      continue;
    }
    const entries = Object.entries(current);
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const [key, child] = entries[index]!;
      assertDynamicStringAllowed(key, `${frame.path} key`);
      stack.push({
        kind: "visit",
        value: child,
        path: `${frame.path}.${key}`,
        depth: frame.depth + 1,
      });
    }
  }
}

function assertDynamicStringAllowed(value: string | boolean, path: string) {
  if (typeof value !== "string") {
    return;
  }
  if (new TextEncoder().encode(value).byteLength > tikhubDynamicStringMaxBytes) {
    throw new TikHubRequestError(
      "invalid_input",
      `${path} exceeds the ${tikhubDynamicStringMaxBytes} byte string limit`,
      400,
    );
  }
  if (value.trimStart().toLowerCase().startsWith("data:")) {
    throw new TikHubRequestError("invalid_input", `${path} cannot contain a data URI`, 400);
  }
}

function createDynamicTikHubError(input: {
  upstreamStatus: number;
  businessCode?: unknown;
  requestId?: string;
  body: unknown;
  requiredScope: string;
}) {
  const numericBusinessCode = typeof input.businessCode === "number" ? input.businessCode : undefined;
  const status =
    input.upstreamStatus >= 400
      ? input.upstreamStatus
      : numericBusinessCode && numericBusinessCode >= 400 && numericBusinessCode <= 599
        ? numericBusinessCode
        : 502;
  const data = compactObject({
    upstreamStatus: input.upstreamStatus,
    businessCode: input.businessCode,
    requestId: input.requestId,
    body: input.body,
  });

  if (status === 401) {
    return new TikHubRequestError("authorization_failed", "TikHub rejected the API credential", 401, data);
  }
  if (status === 402) {
    return new TikHubRequestError("provider_error", "TikHub payment is required for this endpoint request", 402, data);
  }
  if (status === 403) {
    return new TikHubRequestError(
      "authorization_failed",
      `TikHub rejected the endpoint scope. The API token likely needs the ${input.requiredScope} path scope.`,
      403,
      data,
    );
  }
  if (status === 429) {
    return new TikHubRequestError("rate_limited", "TikHub rate limit exceeded", 429, data);
  }
  if (status >= 400 && status < 500) {
    return new TikHubRequestError("invalid_input", "TikHub rejected the endpoint request", status, data);
  }
  return new TikHubRequestError("provider_error", "TikHub endpoint request failed", status, data);
}

async function requestTikHubUserJson(input: {
  path: string;
  apiKey: string;
  query?: Record<string, string>;
  fetcher: typeof fetch;
  phase: TikHubPhase;
}) {
  const timeout = createProviderTimeout(undefined, tikhubUserRequestTimeoutMs);
  try {
    const url = new URL(input.path, tikhubApiBaseUrl);
    for (const [key, value] of Object.entries(input.query ?? {})) {
      url.searchParams.set(key, value);
    }
    const response = await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      redirect: "error",
      signal: timeout.signal,
    });
    const payload = await readTikHubResponseBody(response, tikhubDynamicResponseMaxBytes);
    if (!response.ok) {
      throw createUserTikHubError(response.status, payload, input.phase, input.path);
    }
    const record = asOptionalObject(payload);
    if (!record) {
      throw new TikHubRequestError("provider_error", "TikHub returned an invalid payload", 502);
    }
    const code = typeof record.code === "number" ? record.code : undefined;
    if (!isSuccessfulBusinessCode(code)) {
      throw createUserTikHubError(code ?? 500, record, input.phase, input.path);
    }
    return record;
  } catch (error) {
    if (error instanceof TikHubRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new TikHubRequestError("provider_error", "TikHub request timed out", 504);
    }
    throw new TikHubRequestError(
      "provider_error",
      error instanceof Error ? `TikHub request failed: ${error.message}` : "TikHub request failed",
      502,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readTikHubResponseBody(response: Response, maxBytes: number) {
  const text = await readBoundedResponseText(response, {
    maxBytes,
    label: "TikHub response",
  });
  if (text.trim() === "") {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createUserTikHubError(status: number, payload: unknown, phase: TikHubPhase, path: string) {
  const message = extractTikHubErrorMessage(payload) ?? `TikHub request failed with status ${status}`;
  if (status === 401) {
    return phase === "validate"
      ? new TikHubRequestError("invalid_input", message, 400, payload)
      : new TikHubRequestError("authorization_failed", message, 401, payload);
  }
  if (status === 402) {
    return new TikHubRequestError("provider_error", `TikHub payment required: ${message}`, 402, payload);
  }
  if (status === 403) {
    return new TikHubRequestError(
      "authorization_failed",
      `${message}. The TikHub API token likely needs the ${requiredScopeForPath(path)} path scope.`,
      403,
      payload,
    );
  }
  if (status === 429) {
    return new TikHubRequestError("rate_limited", message, 429, payload);
  }
  if (status === 422 || (status >= 400 && status < 500)) {
    return new TikHubRequestError(
      phase === "validate" ? "invalid_input" : "invalid_input",
      message,
      phase === "validate" ? 400 : status,
      payload,
    );
  }
  return new TikHubRequestError("provider_error", message, status || 500, payload);
}

function extractTikHubErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.slice(0, 500);
  }
  const record = asOptionalObject(payload);
  if (!record) {
    return undefined;
  }
  if (typeof record.detail === "string" && record.detail.trim() !== "") {
    return record.detail.trim().slice(0, 500);
  }
  const detail = asOptionalObject(record.detail);
  return (
    readRecordMessage(detail) ??
    asOptionalString(record.message)?.trim().slice(0, 500) ??
    asOptionalString(record.error)?.trim().slice(0, 500) ??
    asOptionalString(record.error_message)?.trim().slice(0, 500)
  );
}

function readRecordMessage(record: Record<string, unknown> | undefined) {
  if (!record) {
    return undefined;
  }
  return (
    asOptionalString(record.message)?.trim().slice(0, 500) ??
    asOptionalString(record.message_zh)?.trim().slice(0, 500) ??
    asOptionalString(record.error)?.trim().slice(0, 500) ??
    asOptionalString(record.error_message)?.trim().slice(0, 500)
  );
}

function isSuccessfulBusinessCode(code: number | undefined) {
  return code === undefined || code === 0 || (code >= 200 && code < 300);
}

function normalizeEnvelope(payload: Record<string, unknown>): TikHubEnvelope {
  return compactObject({
    code: typeof payload.code === "number" ? payload.code : null,
    requestId: asOptionalString(payload.request_id) ?? null,
    message: asOptionalString(payload.message) ?? null,
    router: asOptionalString(payload.router) ?? null,
    params: asOptionalObject(payload.params) ?? null,
  });
}

function normalizeUserInfo(payload: Record<string, unknown>) {
  const apiKey = readPayloadRecord(payload, "api_key_data");
  const user = readPayloadRecord(payload, "user_data");
  const scopes = readStringArray(apiKey?.api_key_scopes);
  return {
    envelope: normalizeEnvelope(payload),
    apiKey,
    user,
    scopes,
    rawData: compactObject({ api_key_data: apiKey, user_data: user }),
    raw: payload,
  };
}

function readPayloadRecord(payload: Record<string, unknown>, key: string) {
  const direct = asOptionalObject(payload[key]);
  if (direct) {
    return direct;
  }
  const data = asOptionalObject(payload.data);
  return asOptionalObject(data?.[key]) ?? null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function requiredScopeForPath(path: string) {
  return path.startsWith(tikhubUserScope) ? tikhubUserScope : "the matching TikHub path";
}

function readEndpoint(value: unknown) {
  const endpoint = readRequiredString(value, "endpoint");
  if (!endpoint.startsWith("/")) {
    throw new TikHubRequestError("invalid_input", "endpoint must start with /", 400);
  }
  return endpoint;
}

function readMethod(value: unknown): TikHubEndpointMethod {
  if (value === "GET" || value === "POST") {
    return value;
  }
  throw new TikHubRequestError("invalid_input", "method must be GET or POST", 400);
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TikHubRequestError("invalid_input", `${fieldName} is required`, 400);
  }
  return value;
}

function asRecordOrEmpty(value: unknown, fieldName: string) {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    throw new TikHubRequestError("invalid_input", `${fieldName} must be an object`, 400);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
