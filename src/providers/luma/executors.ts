import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "luma";
const lumaApiBaseUrl = "https://public-api.luma.com";

type LumaActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const lumaActionHandlers: ProviderActionHandlers<"luma", LumaActionHandler> = {
  async get_self(_input, context) {
    return {
      user: asRecord(await requestLuma(context, lumaUrl("/v1/users/get-self"), "execute"), "Luma user response"),
    };
  },
  async get_calendar(_input, context) {
    return {
      calendar: asRecord(await requestLuma(context, lumaUrl("/v1/calendars/get"), "execute"), "Luma calendar response"),
    };
  },
  async list_calendar_events(input, context) {
    const payload = await requestLuma(
      context,
      lumaUrl("/v1/calendars/events/list", {
        before: input.before,
        after: input.after,
        pagination_cursor: input.pagination_cursor,
        pagination_limit: input.pagination_limit,
        platforms: input.platforms,
        sort_column: input.sort_column,
        sort_direction: input.sort_direction,
        status: input.status,
        access: input.access,
      }),
      "execute",
    );
    const page = readLumaPage(asRecord(payload, "Luma events response"), "Luma events response");
    return {
      events: page.entries,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    };
  },
  async get_event(input, context) {
    return {
      event: asRecord(
        await requestLuma(context, lumaUrl("/v1/events/get", { event_id: input.event_id }), "execute"),
        "Luma event response",
      ),
    };
  },
  async list_event_guests(input, context) {
    const payload = await requestLuma(
      context,
      lumaUrl("/v1/events/guests/list", {
        event_id: input.event_id,
        approval_status: input.approval_status,
        pagination_cursor: input.pagination_cursor,
        pagination_limit: input.pagination_limit,
        sort_column: input.sort_column,
        sort_direction: input.sort_direction,
      }),
      "execute",
    );
    const page = readLumaPage(asRecord(payload, "Luma guests response"), "Luma guests response");
    return {
      guests: page.entries,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    };
  },
  async get_event_guest(input, context) {
    return {
      guest: asRecord(
        await requestLuma(
          context,
          lumaUrl("/v1/events/guests/get", {
            event_id: input.event_id,
            id: input.id,
          }),
          "execute",
        ),
        "Luma guest response",
      ),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, lumaActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateLumaCredential(input.apiKey, fetcher, signal);
  },
};

async function validateLumaCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const user = await requestLuma({ apiKey, fetcher, signal }, lumaUrl("/v1/users/get-self"), "validate");
  const record = asRecord(user, "Luma user response");
  const email = optionalString(record.email);
  const name = optionalString(record.name);
  const id = optionalString(record.id);

  return {
    profile: {
      accountId: id ?? email ?? "luma-api-key",
      displayName: email ?? name ?? id ?? "Luma API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: lumaApiBaseUrl,
      validationEndpoint: "/v1/users/get-self",
      userId: id,
      email,
      name,
    }),
  };
}

function lumaUrl(path: string, query?: Record<string, unknown>): URL {
  const url = new URL(path, lumaApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function requestLuma(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  url: URL,
  mode: "validate" | "execute",
): Promise<unknown> {
  let response: Response;
  try {
    response = await context.fetcher(url.toString(), {
      method: "GET",
      headers: lumaHeaders(context.apiKey),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `Luma request failed: ${error instanceof Error ? error.message : "unknown transport error"}`,
    );
  }

  await assertLumaResponse(response, mode);
  return readLumaJson(response, "invalid Luma response");
}

function lumaHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    "x-luma-api-key": apiKey,
    "user-agent": providerUserAgent,
  };
}

async function assertLumaResponse(response: Response, mode: "validate" | "execute"): Promise<void> {
  if (response.ok) {
    return;
  }

  const error = await readLumaError(response);
  if (response.status === 429) {
    throw new ProviderRequestError(429, error.message);
  }
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, error.message);
  }
  if (mode === "execute" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(401, error.message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    throw new ProviderRequestError(response.status, error.message);
  }

  throw new ProviderRequestError(response.status >= 500 ? 502 : response.status, error.message);
}

async function readLumaError(response: Response): Promise<{ message: string }> {
  const payload = await readLumaJson(response, response.statusText || "Luma request failed").catch(() => null);
  return {
    message: extractLumaErrorMessage(payload) ?? response.statusText ?? "Luma request failed",
  };
}

async function readLumaJson(response: Response, message: string): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, message);
  }
}

function extractLumaErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.detail);
}

function readLumaPage(
  record: Record<string, unknown>,
  label: string,
): {
  entries: unknown[];
  hasMore: boolean;
  nextCursor: string | null;
} {
  if (!Array.isArray(record.entries) || typeof record.has_more !== "boolean") {
    throw new ProviderRequestError(502, `invalid ${label}`);
  }
  if (record.next_cursor !== undefined && record.next_cursor !== null && typeof record.next_cursor !== "string") {
    throw new ProviderRequestError(502, `invalid ${label}`);
  }
  return {
    entries: record.entries,
    hasMore: record.has_more,
    nextCursor: record.next_cursor ?? null,
  };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `invalid ${label}`);
  }
  return record;
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://public-api.luma.com",
  auth: { type: "api_key_header", name: "x-luma-api-key" },
});
