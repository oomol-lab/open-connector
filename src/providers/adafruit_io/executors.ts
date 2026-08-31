import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "adafruit_io";
const adafruitIoApiBaseUrl = "https://io.adafruit.com/api/v2";
const adafruitIoDefaultRequestTimeoutMs = 30_000;

type AdafruitIoPhase = "validate" | "execute";

interface AdafruitIoActionContext {
  apiKey: string;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface AdafruitIoUser {
  id: number | null;
  username: string;
  name: string | null;
  color: string | null;
  timeZone: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  raw: Record<string, unknown>;
}

interface AdafruitIoFeed {
  id: number | null;
  key: string;
  name: string | null;
  description: string | null;
  unitType: string | null;
  unitSymbol: string | null;
  visibility: string | null;
  lastValue: string | null;
  status: string | null;
  history: boolean | null;
  enabled: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
  raw: Record<string, unknown>;
}

interface AdafruitIoDataPoint {
  id: string | null;
  value: string | null;
  feedId: number | null;
  groupId: number | null;
  expiration: string | null;
  lat: number | null;
  lon: number | null;
  ele: number | null;
  completedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  createdEpoch: number | null;
  raw: Record<string, unknown>;
}

type AdafruitIoActionHandler = (input: Record<string, unknown>, context: AdafruitIoActionContext) => Promise<unknown>;

export const adafruitIoActionHandlers: ProviderActionHandlers<"adafruit_io", AdafruitIoActionHandler> = {
  async get_current_user(_input, context) {
    const user = await fetchAdafruitIoCurrentUser({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });

    return {
      user,
    };
  },
  async list_feeds(input, context) {
    const username = resolveAdafruitIoUsername(input, context.metadata);
    const payload = await requestAdafruitIoJson({
      path: `/${encodeURIComponent(username)}/feeds`,
      apiKey: context.apiKey,
      method: "GET",
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });

    return {
      feeds: normalizeAdafruitIoFeeds(payload),
    };
  },
  async get_feed(input, context) {
    const username = resolveAdafruitIoUsername(input, context.metadata);
    const feedKey = readRequiredProviderString(input.feedKey, "feedKey");
    const payload = await requestAdafruitIoJson({
      path: `/${encodeURIComponent(username)}/feeds/${encodeURIComponent(feedKey)}`,
      apiKey: context.apiKey,
      method: "GET",
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });

    return {
      feed: normalizeAdafruitIoFeed(payload),
    };
  },
  async list_feed_data(input, context) {
    const username = resolveAdafruitIoUsername(input, context.metadata);
    const feedKey = readRequiredProviderString(input.feedKey, "feedKey");
    const payload = await requestAdafruitIoJson({
      path: `/${encodeURIComponent(username)}/feeds/${encodeURIComponent(feedKey)}/data`,
      apiKey: context.apiKey,
      method: "GET",
      query: compactObject({
        start_time: optionalString(input.startTime),
        end_time: optionalString(input.endTime),
        limit: input.limit == null ? undefined : String(input.limit),
        include: readIncludeFields(input.include),
      }),
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });

    return {
      data: normalizeAdafruitIoDataPoints(payload),
    };
  },
  async create_feed_data(input, context) {
    const username = resolveAdafruitIoUsername(input, context.metadata);
    const feedKey = readRequiredProviderString(input.feedKey, "feedKey");
    const payload = await requestAdafruitIoJson({
      path: `/${encodeURIComponent(username)}/feeds/${encodeURIComponent(feedKey)}/data`,
      apiKey: context.apiKey,
      method: "POST",
      body: compactObject({
        value: String(input.value),
        created_at: optionalString(input.createdAt),
        lat: optionalNumber(input.lat),
        lon: optionalNumber(input.lon),
        ele: optionalNumber(input.ele),
        epoch: optionalNumber(input.epoch),
      }),
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });

    return {
      data: normalizeAdafruitIoDataPoint(payload),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AdafruitIoActionContext>({
  service,
  handlers: adafruitIoActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AdafruitIoActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      metadata: credential.metadata,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: adafruitIoApiBaseUrl,
  auth: {
    type: "api_key_header",
    name: "X-AIO-Key",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const user = await fetchAdafruitIoCurrentUser({
      apiKey: input.apiKey,
      fetcher,
      phase: "validate",
      signal,
    });

    return {
      profile: {
        accountId: user.username,
        displayName: user.name || user.username,
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/user",
        username: user.username,
        userId: user.id,
        timeZone: user.timeZone,
      }),
    };
  },
};

async function fetchAdafruitIoCurrentUser(input: {
  apiKey: string;
  fetcher: typeof fetch;
  phase: AdafruitIoPhase;
  signal?: AbortSignal;
}): Promise<AdafruitIoUser> {
  const payload = await requestAdafruitIoJson({
    path: "/user",
    apiKey: input.apiKey,
    method: "GET",
    fetcher: input.fetcher,
    phase: input.phase,
    signal: input.signal,
  });

  return normalizeAdafruitIoUser(payload);
}

async function requestAdafruitIoJson(input: {
  path: string;
  apiKey: string;
  method: "GET" | "POST";
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  phase: AdafruitIoPhase;
  signal?: AbortSignal;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, adafruitIoDefaultRequestTimeoutMs);

  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": providerUserAgent,
      "x-aio-key": input.apiKey,
    };
    if (input.body) {
      headers["content-type"] = "application/json";
    }

    const response = await input.fetcher(buildAdafruitIoUrl(input.path, input.query), {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readAdafruitIoPayload(response);

    if (!response.ok) {
      throw createAdafruitIoError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Adafruit IO request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Adafruit IO request failed: ${error.message}` : "Adafruit IO request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildAdafruitIoUrl(path: string, query: Record<string, string | undefined> = {}): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${adafruitIoApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readAdafruitIoPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Adafruit IO returned invalid JSON");
  }
}

function createAdafruitIoError(status: number, payload: unknown, phase: AdafruitIoPhase): ProviderRequestError {
  const message = extractAdafruitIoErrorMessage(payload) ?? `Adafruit IO request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }

  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractAdafruitIoErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message = optionalString(record.message) ?? optionalString(record.error);
  if (message) {
    return message;
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    const firstError = errors.find((item) => typeof item === "string" && item.trim() !== "");
    if (typeof firstError === "string") {
      return firstError.trim();
    }
  }

  return undefined;
}

function normalizeAdafruitIoUser(payload: unknown): AdafruitIoUser {
  const record = requireRecord(payload, "Adafruit IO returned an invalid user payload");
  const username = readRequiredProviderString(record.username, "username");

  return {
    id: optionalNumber(record.id) ?? null,
    username,
    name: optionalString(record.name) ?? null,
    color: optionalString(record.color) ?? null,
    timeZone: optionalString(record.time_zone) ?? null,
    createdAt: optionalString(record.created_at) ?? null,
    updatedAt: optionalString(record.updated_at) ?? null,
    raw: record,
  };
}

function normalizeAdafruitIoFeeds(payload: unknown): AdafruitIoFeed[] {
  return objectArray(payload, "Adafruit IO feeds", providerResponseError).map((record) =>
    normalizeAdafruitIoFeed(record),
  );
}

function normalizeAdafruitIoFeed(payload: unknown): AdafruitIoFeed {
  const record = requireRecord(payload, "Adafruit IO returned an invalid feed payload");
  const key = readRequiredProviderString(record.key, "feed key");

  return {
    id: optionalNumber(record.id) ?? null,
    key,
    name: optionalString(record.name) ?? null,
    description: optionalString(record.description) ?? null,
    unitType: optionalString(record.unit_type) ?? null,
    unitSymbol: optionalString(record.unit_symbol) ?? null,
    visibility: optionalString(record.visibility) ?? null,
    lastValue: optionalString(record.last_value) ?? null,
    status: optionalString(record.status) ?? null,
    history: optionalBoolean(record.history) ?? null,
    enabled: optionalBoolean(record.enabled) ?? null,
    createdAt: optionalString(record.created_at) ?? null,
    updatedAt: optionalString(record.updated_at) ?? null,
    raw: record,
  };
}

function normalizeAdafruitIoDataPoints(payload: unknown): AdafruitIoDataPoint[] {
  return objectArray(payload, "Adafruit IO data points", providerResponseError).map((record) =>
    normalizeAdafruitIoDataPoint(record),
  );
}

function normalizeAdafruitIoDataPoint(payload: unknown): AdafruitIoDataPoint {
  const record = requireRecord(payload, "Adafruit IO returned an invalid data point payload");

  return {
    id: readOptionalStringOrNumber(record.id),
    value: readOptionalStringOrNumber(record.value),
    feedId: optionalNumber(record.feed_id) ?? null,
    groupId: optionalNumber(record.group_id) ?? null,
    expiration: optionalString(record.expiration) ?? null,
    lat: optionalNumber(record.lat) ?? null,
    lon: optionalNumber(record.lon) ?? null,
    ele: optionalNumber(record.ele) ?? null,
    completedAt: optionalString(record.completed_at) ?? null,
    createdAt: optionalString(record.created_at) ?? null,
    updatedAt: optionalString(record.updated_at) ?? null,
    createdEpoch: optionalNumber(record.created_epoch) ?? null,
    raw: record,
  };
}

function resolveAdafruitIoUsername(input: Record<string, unknown>, metadata: Record<string, unknown>): string {
  const inputUsername = optionalString(input.username);
  if (inputUsername) {
    return inputUsername;
  }

  const metadataUsername = optionalString(metadata.username);
  if (metadataUsername) {
    return metadataUsername;
  }

  throw new ProviderRequestError(
    400,
    "Adafruit IO username is required. Reconnect the account or pass username explicitly.",
  );
}

function readIncludeFields(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const fields = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter((item) => item !== "");
  return fields.length > 0 ? fields.join(",") : undefined;
}

function readRequiredProviderString(value: unknown, fieldName: string): string {
  return requiredString(
    value,
    fieldName,
    (message) => new ProviderRequestError(502, `Adafruit IO response is missing ${fieldName}: ${message}`),
  );
}

function readOptionalStringOrNumber(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message, value);
  }
  return record;
}
