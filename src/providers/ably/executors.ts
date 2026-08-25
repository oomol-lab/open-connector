import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "ably";
const ablyApiBaseUrl = "https://main.realtime.ably.net";
const ablyValidationPath = "/stats";
const defaultChannelSeparator = ",";

type AblyRequestPhase = "validate" | "execute";

interface AblyActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface AblyJsonResponse {
  payload: unknown;
  links?: Record<string, string>;
}

type AblyActionHandler = (input: Record<string, unknown>, context: AblyActionContext) => Promise<unknown>;

export const ablyActionHandlers: ProviderActionHandlers<"ably", AblyActionHandler> = {
  async batch_presence(input, context): Promise<unknown> {
    const separator = optionalString(input.separator) ?? defaultChannelSeparator;
    const channels = normalizeChannels(input.channels, separator);
    const response = await ablyRequestJson(context, {
      path: "/presence",
      query: buildQueryParams({
        channels: channels.join(separator),
        separator: separator === defaultChannelSeparator ? undefined : separator,
      }),
      phase: "execute",
    });

    return compactObject({
      results: requireArrayPayload(response.payload, "ably batch presence response"),
      links: response.links,
    });
  },

  async batch_presence_history(input, context): Promise<unknown> {
    const separator = optionalString(input.separator) ?? defaultChannelSeparator;
    const channels = normalizeChannels(input.channels, separator);
    const results = await Promise.all(
      channels.map(async (channel) => {
        const response = await ablyRequestJson(context, {
          path: `/channels/${encodePathSegment(channel)}/presence/history`,
          query: buildHistoryQuery(input),
          phase: "execute",
        });

        return compactObject({
          channel,
          presence: requireArrayPayload(response.payload, "ably presence history response"),
          links: response.links,
        });
      }),
    );

    return { results };
  },

  async create_channel(input, context): Promise<unknown> {
    const channelId = requireNonEmptyString(input.channel_id, "channel_id");
    const response = await ablyRequestJson(context, {
      path: `/channels/${encodePathSegment(channelId)}`,
      phase: "execute",
    });

    return {
      channel_id: channelId,
      channel: requireObjectPayload(response.payload, "ably create channel response"),
    };
  },

  async delete_channel_subscription(input, context): Promise<unknown> {
    const query = buildPushSubscriptionQuery(input);
    if (!query.has("deviceId") && !query.has("clientId")) {
      throw new ProviderRequestError(400, "device_id or client_id is required to delete an Ably channel subscription");
    }
    if (query.has("deviceId") && query.has("clientId")) {
      throw new ProviderRequestError(
        400,
        "provide only one of device_id or client_id when deleting an Ably channel subscription",
      );
    }

    await ablyRequestJson(context, {
      method: "DELETE",
      path: "/push/channelSubscriptions",
      query,
      phase: "execute",
    });

    return { success: true };
  },

  async get_channel_details(input, context): Promise<unknown> {
    const channelId = requireNonEmptyString(input.channel_id, "channel_id");
    const response = await ablyRequestJson(context, {
      path: `/channels/${encodePathSegment(channelId)}`,
      phase: "execute",
    });

    return {
      channel: requireObjectPayload(response.payload, "ably channel details response"),
    };
  },

  async get_channel_history(input, context): Promise<unknown> {
    const channelId = requireNonEmptyString(input.channel_id, "channel_id");
    const response = await ablyRequestJson(context, {
      path: `/channels/${encodePathSegment(channelId)}/messages`,
      query: buildHistoryQuery(input),
      phase: "execute",
    });

    return compactObject({
      messages: requireArrayPayload(response.payload, "ably channel history response"),
      links: response.links,
    });
  },

  async get_presence_history(input, context): Promise<unknown> {
    const channelId = requireNonEmptyString(input.channel_id, "channel_id");
    const response = await ablyRequestJson(context, {
      path: `/channels/${encodePathSegment(channelId)}/presence/history`,
      query: buildHistoryQuery(input),
      phase: "execute",
    });

    return compactObject({
      presence: requireArrayPayload(response.payload, "ably presence history response"),
      links: response.links,
    });
  },

  async get_service_time(_input, context): Promise<unknown> {
    const response = await ablyRequestJson(context, {
      path: "/time",
      phase: "execute",
    });
    if (!Array.isArray(response.payload) || typeof response.payload[0] !== "number") {
      throw new ProviderRequestError(502, "invalid ably service time response");
    }

    return {
      time: response.payload[0],
    };
  },

  async get_stats(input, context): Promise<unknown> {
    const response = await ablyRequestJson(context, {
      path: "/stats",
      query: buildHistoryQuery(input),
      phase: "execute",
    });

    return compactObject({
      stats: requireArrayPayload(response.payload, "ably stats response"),
      links: response.links,
    });
  },

  async list_push_channel_subscriptions(input, context): Promise<unknown> {
    const response = await ablyRequestJson(context, {
      path: "/push/channelSubscriptions",
      query: buildPushSubscriptionQuery(input),
      phase: "execute",
    });

    return compactObject({
      subscriptions: requireArrayPayload(response.payload, "ably push channel subscriptions response"),
      links: response.links,
    });
  },

  async publish_message_to_channel(input, context): Promise<unknown> {
    const channelId = requireNonEmptyString(input.channel_id, "channel_id");
    const response = await ablyRequestJson(context, {
      method: "POST",
      path: `/channels/${encodePathSegment(channelId)}/messages`,
      body: buildMessageBody(input),
      phase: "execute",
    });

    return {
      result: requireObjectPayload(response.payload, "ably publish response"),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AblyActionContext>({
  service,
  handlers: ablyActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AblyActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const response = await ablyRequestJson(
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      {
        path: ablyValidationPath,
        query: buildQueryParams({ limit: 1 }),
        phase: "validate",
      },
    );
    const stats = requireArrayPayload(response.payload, "ably stats validation response");

    return {
      profile: {
        accountId: "api_key",
        displayName: "Ably API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: ablyApiBaseUrl,
        validationEndpoint: `${ablyValidationPath}?limit=1`,
        statsCount: stats.length,
      },
    };
  },
};

async function ablyRequestJson(
  context: AblyActionContext,
  input: {
    path: string;
    phase: AblyRequestPhase;
    method?: "DELETE" | "GET" | "POST";
    query?: URLSearchParams;
    body?: unknown;
  },
): Promise<AblyJsonResponse> {
  let response: Response;
  try {
    response = await context.fetcher(buildAblyUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers: buildAblyHeaders(context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ably request failed: ${error.message}` : "ably request failed",
    );
  }

  const payload = await readAblyPayload(response);
  if (!response.ok) {
    throw createAblyError(response, payload, input.phase);
  }

  return compactObject({
    payload,
    links: parseAblyLinks(response.headers),
  }) as AblyJsonResponse;
}

function buildAblyUrl(path: string, query?: URLSearchParams): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${ablyApiBaseUrl}/`);
  if (query && query.size > 0) {
    url.search = query.toString();
  }
  return url;
}

function buildAblyHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Basic ${Buffer.from(apiKey).toString("base64")}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function buildHistoryQuery(input: Record<string, unknown>): URLSearchParams {
  return buildQueryParams({
    start: input.start,
    end: input.end,
    limit: input.limit,
    direction: input.direction,
    unit: input.unit,
  });
}

function buildPushSubscriptionQuery(input: Record<string, unknown>): URLSearchParams {
  return buildQueryParams({
    channel: input.channel,
    clientId: input.client_id,
    deviceId: input.device_id,
    concatFilters: input.concat_filters,
    limit: input.limit,
  });
}

function buildQueryParams(input: Record<string, unknown>): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    query.set(key, String(value));
  }
  return query;
}

function buildMessageBody(input: Record<string, unknown>): Partial<Record<string, unknown>> {
  return compactObject({
    id: optionalString(input.id),
    name: optionalString(input.name),
    data: input.data,
    encoding: optionalString(input.encoding),
    clientId: optionalString(input.client_id),
    connectionKey: optionalString(input.connection_key),
    extras: optionalRecord(input.extras),
  });
}

async function readAblyPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "invalid ably JSON response");
    }
    return text;
  }
}

function createAblyError(response: Response, payload: unknown, phase: AblyRequestPhase): ProviderRequestError {
  const message =
    extractAblyErrorMessage(payload) ??
    response.headers.get("x-ably-errormessage") ??
    response.statusText ??
    "ably request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if ([400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status >= 500) {
    return new ProviderRequestError(502, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractAblyErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  return optionalString(error?.message) ?? optionalString(record?.message);
}

function parseAblyLinks(headers: Headers): Record<string, string> | undefined {
  const linkHeader = headers.get("link");
  if (!linkHeader) {
    return undefined;
  }

  const links: Record<string, string> = {};
  for (const part of linkHeader.split(",")) {
    const start = part.indexOf("<");
    const end = part.indexOf(">");
    const relStart = part.indexOf('rel="');
    if (start < 0 || end <= start || relStart < 0) {
      continue;
    }
    const relValueStart = relStart + 'rel="'.length;
    const relValueEnd = part.indexOf('"', relValueStart);
    if (relValueEnd <= relValueStart) {
      continue;
    }
    links[part.slice(relValueStart, relValueEnd)] = part.slice(start + 1, end);
  }

  return Object.keys(links).length > 0 ? links : undefined;
}

function normalizeChannels(value: unknown, separator: string): string[] {
  if (Array.isArray(value)) {
    const channels = value.map((item) => requireNonEmptyString(item, "channels"));
    if (channels.length === 0) {
      throw new ProviderRequestError(400, "channels is required");
    }
    return channels;
  }

  const channels = requireNonEmptyString(value, "channels")
    .split(separator)
    .map((channel) => channel.trim())
    .filter(Boolean);
  if (channels.length === 0) {
    throw new ProviderRequestError(400, "channels is required");
  }
  return channels;
}

function requireArrayPayload(payload: unknown, context: string): Record<string, unknown>[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `invalid ${context}`);
  }
  return payload.map((item) => requireObjectPayload(item, context));
}

function requireObjectPayload(payload: unknown, context: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `invalid ${context}`);
  }
  return record;
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}
