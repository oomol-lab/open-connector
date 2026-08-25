import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const umamiApiBaseUrl = "https://api.umami.is";
export const umamiValidationPath = "/api/auth/verify";

type UmamiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface UmamiRequestOptions {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  mode: "validate" | "execute";
  method?: "GET" | "POST";
  query?: Record<string, string | undefined>;
}

export const umamiActionHandlers: ProviderActionHandlers<"umami", UmamiActionHandler> = {
  async get_current_user(_input, context) {
    const user = requireObject(
      await requestUmamiJson({
        path: "/api/me",
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        signal: context.signal,
        mode: "execute",
      }),
      "Umami returned an invalid user payload",
    );
    return { user, raw: user };
  },
  async list_websites(input, context) {
    const payload = requireObject(
      await requestUmamiJson({
        path: "/api/websites",
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        signal: context.signal,
        mode: "execute",
        query: {
          query: optionalString(input.query),
          page: optionalIntegerString(input.page),
          pageSize: optionalIntegerString(input.pageSize),
        },
      }),
      "Umami returned an invalid website list payload",
    );
    return {
      websites: objectArray(payload.data, "Umami returned an invalid website list data payload"),
      count: readNonNegativeInteger(payload.count, "count"),
      page: readPositiveInteger(payload.page, "page"),
      pageSize: readPositiveInteger(payload.pageSize, "pageSize"),
      raw: payload,
    };
  },
  async get_website(input, context) {
    const websiteId = requiredInputString(input.websiteId, "websiteId");
    const website = requireObject(
      await requestUmamiJson({
        path: `/api/websites/${encodeURIComponent(websiteId)}`,
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        signal: context.signal,
        mode: "execute",
      }),
      "Umami returned an invalid website payload",
    );
    return { website, raw: website };
  },
  async get_website_stats(input, context) {
    const websiteId = requiredInputString(input.websiteId, "websiteId");
    const stats = requireObject(
      await requestUmamiJson({
        path: `/api/websites/${encodeURIComponent(websiteId)}/stats`,
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        signal: context.signal,
        mode: "execute",
        query: buildDateRangeQuery(input),
      }),
      "Umami returned an invalid stats payload",
    );
    return { stats, raw: stats };
  },
  async get_pageviews(input, context) {
    const websiteId = requiredInputString(input.websiteId, "websiteId");
    const pageviews = requireObject(
      await requestUmamiJson({
        path: `/api/websites/${encodeURIComponent(websiteId)}/pageviews`,
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        signal: context.signal,
        mode: "execute",
        query: {
          ...buildDateRangeQuery(input),
          unit: optionalString(input.unit),
        },
      }),
      "Umami returned an invalid pageviews payload",
    );
    return { pageviews, raw: pageviews };
  },
  async get_metrics(input, context) {
    const websiteId = requiredInputString(input.websiteId, "websiteId");
    const metrics = objectArray(
      await requestUmamiJson({
        path: `/api/websites/${encodeURIComponent(websiteId)}/metrics`,
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        signal: context.signal,
        mode: "execute",
        query: {
          ...buildDateRangeQuery(input),
          type: requiredInputString(input.type, "type"),
          limit: optionalIntegerString(input.limit),
        },
      }),
      "Umami returned an invalid metrics payload",
    );
    return { metrics, raw: metrics };
  },
  async get_realtime(input, context) {
    const websiteId = requiredInputString(input.websiteId, "websiteId");
    const realtime = requireObject(
      await requestUmamiJson({
        path: `/api/realtime/${encodeURIComponent(websiteId)}`,
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        signal: context.signal,
        mode: "execute",
      }),
      "Umami returned an invalid realtime payload",
    );
    return { realtime, raw: realtime };
  },
  async list_events(input, context) {
    const websiteId = requiredInputString(input.websiteId, "websiteId");
    const payload = requireObject(
      await requestUmamiJson({
        path: `/api/websites/${encodeURIComponent(websiteId)}/events`,
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        signal: context.signal,
        mode: "execute",
        query: {
          ...buildDateRangeQuery(input),
          query: optionalString(input.query),
          page: optionalIntegerString(input.page),
          pageSize: optionalIntegerString(input.pageSize),
        },
      }),
      "Umami returned an invalid event list payload",
    );
    return {
      events: objectArray(payload.data, "Umami returned an invalid event list data payload"),
      count: readNonNegativeInteger(payload.count, "count"),
      page: readPositiveInteger(payload.page, "page"),
      pageSize: readPositiveInteger(payload.pageSize, "pageSize"),
      raw: payload,
    };
  },
};

export async function validateUmamiCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const user = requireObject(
    await requestUmamiJson({
      path: umamiValidationPath,
      apiKey,
      fetcher,
      signal,
      mode: "validate",
      method: "POST",
    }),
    "Umami returned an invalid credential payload",
  );

  const userId = optionalString(user.id);
  const username = optionalString(user.username);
  return {
    profile: {
      accountId: userId ?? username ?? "umami:api-key",
      displayName: username ?? userId ?? "Umami API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: umamiApiBaseUrl,
      validationEndpoint: umamiValidationPath,
      userId,
      username,
      role: optionalString(user.role),
    },
  };
}

async function requestUmamiJson(options: UmamiRequestOptions): Promise<unknown> {
  const url = new URL(`${umamiApiBaseUrl}${options.path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const response = await options.fetcher(url, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${options.apiKey}`,
      "user-agent": providerUserAgent,
    },
    signal: options.signal,
  });
  const payload = await readResponsePayload(response);

  if (!response.ok) {
    throw mapUmamiError(response.status, payload, options.mode);
  }

  return payload;
}

function buildDateRangeQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    startAt: integerString(input.startAt, "startAt"),
    endAt: integerString(input.endAt, "endAt"),
    timezone: requiredInputString(input.timezone, "timezone"),
    url: optionalString(input.url),
    referrer: optionalString(input.referrer),
    title: optionalString(input.title),
    host: optionalString(input.host),
    os: optionalString(input.os),
    browser: optionalString(input.browser),
    device: optionalString(input.device),
    country: optionalString(input.country),
    region: optionalString(input.region),
    city: optionalString(input.city),
  };
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      message: text,
    };
  }
}

function mapUmamiError(status: number, payload: unknown, mode: "validate" | "execute"): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Umami API request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  }
  if (status === 404) {
    return new ProviderRequestError(404, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 400 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  if (typeof body.error === "string" && body.error) {
    return body.error;
  }
  const errorObject = optionalRecord(body.error);
  const errorMessage = optionalString(errorObject?.message);
  if (errorMessage) {
    return errorMessage;
  }

  return optionalString(body.message);
}

function requireObject(value: unknown, errorMessage: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, errorMessage, value);
  }
  return record;
}

function objectArray(value: unknown, errorMessage: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, errorMessage, value);
  }
  return value.map((item) => requireObject(item, errorMessage));
}

function requiredInputString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function integerString(value: unknown, fieldName: string): string {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return String(parsed);
}

function optionalIntegerString(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, "optional integer input must be an integer");
  }
  return String(parsed);
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ProviderRequestError(502, `Umami returned an invalid ${fieldName} payload`, value);
  }
  return value;
}

function readNonNegativeInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ProviderRequestError(502, `Umami returned an invalid ${fieldName} payload`, value);
  }
  return value;
}
