import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";

const service = "daily";
const dailyApiBaseUrl = "https://api.daily.co/v1";
const requestTimeoutMs = 30_000;

type DailyRequestPhase = "validate" | "execute";

type DailyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const dailyActionHandlers: ProviderActionHandlers<"daily", DailyActionHandler> = {
  async get_domain_config(_input, context) {
    return {
      domain: await dailyRequestObject({ method: "GET", path: "/" }, context, "execute"),
    };
  },
  async list_rooms(input, context) {
    const raw = await dailyRequestObject(
      {
        method: "GET",
        path: "/rooms",
        query: compactObject({
          limit: optionalInteger(input.limit),
          starting_after: optionalString(input.starting_after),
          ending_before: optionalString(input.ending_before),
        }),
      },
      context,
      "execute",
    );
    return {
      total_count: optionalInteger(raw.total_count),
      rooms: readDailyArray(raw.data, "data"),
      raw,
    };
  },
  async create_room(input, context) {
    return {
      room: await dailyRequestObject(
        {
          method: "POST",
          path: "/rooms",
          body: compactObject({
            name: optionalString(input.name),
            privacy: optionalString(input.privacy),
            properties: optionalRecord(input.properties),
          }),
        },
        context,
        "execute",
      ),
    };
  },
  async get_room(input, context) {
    return {
      room: await dailyRequestObject(
        {
          method: "GET",
          path: `/rooms/${encodeURIComponent(requiredString(input.room_name, "room_name"))}`,
        },
        context,
        "execute",
      ),
    };
  },
  async update_room(input, context) {
    return {
      room: await dailyRequestObject(
        {
          method: "POST",
          path: `/rooms/${encodeURIComponent(requiredString(input.room_name, "room_name"))}`,
          body: compactObject({
            privacy: optionalString(input.privacy),
            properties: optionalRecord(input.properties),
          }),
        },
        context,
        "execute",
      ),
    };
  },
  async delete_room(input, context) {
    const roomName = requiredString(input.room_name, "room_name");
    const raw = await dailyRequestObject(
      {
        method: "DELETE",
        path: `/rooms/${encodeURIComponent(roomName)}`,
      },
      context,
      "execute",
    );
    const deleted = optionalBoolean(raw.deleted);
    if (deleted === undefined) {
      throw new ProviderRequestError(502, "Daily delete room response missing deleted");
    }
    return {
      deleted,
      name: optionalString(raw.name) ?? roomName,
    };
  },
  async create_meeting_token(input, context) {
    const raw = await dailyRequestObject(
      {
        method: "POST",
        path: "/meeting-tokens",
        body: {
          properties: optionalRecord(input.properties) ?? {},
        },
      },
      context,
      "execute",
    );
    return {
      token: requiredString(raw.token, "token", (message) => new ProviderRequestError(502, message)),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, dailyActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: dailyApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const domain = await dailyRequestObject(
      { method: "GET", path: "/" },
      { apiKey: input.apiKey, fetcher, signal },
      "validate",
    );
    const domainName = optionalString(domain.domain_name);
    const domainId = optionalString(domain.domain_id);
    return {
      profile: {
        accountId: domainId ?? "api_key",
        displayName: domainName ?? "Daily API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: dailyApiBaseUrl,
        validationEndpoint: "/",
        domainName,
        domainId,
      }),
    };
  },
};

async function dailyRequestObject(
  request: {
    method: string;
    path: string;
    query?: Record<string, string | number | boolean | undefined>;
    body?: Record<string, unknown>;
  },
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: DailyRequestPhase,
): Promise<Record<string, unknown>> {
  const url = buildDailyUrl(request.path);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);
  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: request.method,
      headers: dailyHeaders(context.apiKey, request.body !== undefined),
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "Daily returned malformed JSON",
      invalidJsonFallback: (text) => ({ info: text }),
    });
    if (!response.ok) {
      throw createDailyError(response, payload, phase);
    }
    return readDailyObject(payload, "Daily response");
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Daily request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Daily request failed: ${error.message}` : "Daily request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function dailyHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function buildDailyUrl(path: string): URL {
  let relativePath = path;
  while (relativePath.startsWith("/")) {
    relativePath = relativePath.slice(1);
  }
  return new URL(relativePath, `${dailyApiBaseUrl}/`);
}

function createDailyError(response: Response, payload: unknown, phase: DailyRequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.info) ??
    optionalString(record?.error) ??
    `Daily request failed with HTTP ${response.status}`;
  if (phase === "validate" && (response.status === 400 || response.status === 401)) {
    return new ProviderRequestError(401, message);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message);
  }
  return new ProviderRequestError(response.status || 502, message);
}

function readDailyObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`);
  }
  return object;
}

function readDailyArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`);
  }
  return value.map((item, index) => readDailyObject(item, `${fieldName}[${index}]`));
}
