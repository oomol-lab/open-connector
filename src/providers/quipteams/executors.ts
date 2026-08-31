import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRawString, optionalRecord, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "quipteams";
const quipteamsApiBaseUrl = "https://api.quipteams.com";

type QuipteamsRequestPhase = "validate" | "execute";
type QuipteamsActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const quipteamsActionHandlers: ProviderActionHandlers<"quipteams", QuipteamsActionHandler> = {
  list_quotes(input, context) {
    return requestQuipteamsList("quotes", "/api/v1/quotes", input, context);
  },
  get_quote(input, context) {
    return requestQuipteamsDetail("quote", `/api/v1/quotes/${readPathSegment(input.id, "id")}`, {}, context);
  },
  list_assets(input, context) {
    return requestQuipteamsList("assets", "/api/v1/assets", input, context);
  },
  list_device_actions(input, context) {
    return requestQuipteamsList("deviceActions", "/api/v1/device-actions", input, context);
  },
  get_device_action(input, context) {
    return requestQuipteamsDetail(
      "deviceAction",
      `/api/v1/device-actions/${readPathSegment(input.id, "id")}`,
      { include_asset: input.include_asset },
      context,
    );
  },
  list_products(input, context) {
    return requestQuipteamsList("products", "/api/v1/products", input, context);
  },
  get_product(input, context) {
    return requestQuipteamsDetail("product", `/api/v1/products/${readPathSegment(input.id, "id")}`, {}, context);
  },
  list_kits(input, context) {
    return requestQuipteamsList("kits", "/api/v1/kits", input, context);
  },
  get_kit(input, context) {
    return requestQuipteamsDetail("kit", `/api/v1/kits/${readPathSegment(input.id, "id")}`, {}, context);
  },
  list_employees(input, context) {
    return requestQuipteamsList("employees", "/api/v1/employees", input, context);
  },
  get_employee(input, context) {
    return requestQuipteamsDetail("employee", `/api/v1/employees/${readPathSegment(input.id, "id")}`, {}, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, quipteamsActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestQuipteamsJson({
      path: "/api/v1/products",
      query: { include_inactive: "false" },
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });

    return {
      profile: {
        accountId: "quipteams:api-key",
        displayName: "Quipteams API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: quipteamsApiBaseUrl,
        validationEndpoint: "/api/v1/products",
      },
    };
  },
};

async function requestQuipteamsList(
  outputKey: string,
  path: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestQuipteamsJson({
    path,
    query: readQuery(input),
    context,
    phase: "execute",
  });

  return {
    [outputKey]: readListItems(payload, outputKey),
    ...readNextCursorOutput(payload),
    raw: payload,
  };
}

async function requestQuipteamsDetail(
  outputKey: string,
  path: string,
  query: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestQuipteamsJson({
    path,
    query: readQuery(query),
    context,
    phase: "execute",
  });

  return {
    [outputKey]: readDetailPayload(payload, `Quipteams ${outputKey} response`),
    raw: payload,
  };
}

async function requestQuipteamsJson(input: {
  path: string;
  query?: Record<string, string>;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: QuipteamsRequestPhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(buildQuipteamsUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    payload = await readQuipteamsPayload(response);
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Quipteams request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Quipteams request failed: ${error.message}` : "Quipteams request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createQuipteamsError(response.status, response.statusText, payload, input.phase);
  }

  return payload;
}

function buildQuipteamsUrl(path: string, query: Record<string, string> | undefined): URL {
  const url = new URL(path, quipteamsApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function readQuipteamsPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createQuipteamsError(
  status: number,
  statusText: string,
  payload: unknown,
  phase: QuipteamsRequestPhase,
): ProviderRequestError {
  const message = (extractQuipteamsErrorMessage(payload) ?? statusText) || "Quipteams request failed";

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if ([400, 404, 409, 422].includes(status)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractQuipteamsErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  const nestedError = optionalRecord(record?.error);
  return (
    optionalRawString(record?.message) ??
    optionalRawString(record?.error) ??
    optionalRawString(record?.detail) ??
    optionalRawString(record?.code) ??
    optionalRawString(nestedError?.message)
  );
}

function readQuery(input: Record<string, unknown>): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    appendQueryValue(query, key, value);
  }
  return query;
}

function appendQueryValue(query: Record<string, string>, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }

  if (Array.isArray(value)) {
    const joined = value.filter((item): item is string => typeof item === "string" && item !== "").join(",");
    if (joined) {
      query[key] = joined;
    }
    return;
  }

  query[key] = String(value);
}

function readListItems(payload: unknown, outputKey: string): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return normalizeObjectArray(payload);
  }

  const record = optionalRecord(payload) ?? {};
  const candidates = [record.data, record.items, record[outputKey], record.results];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return normalizeObjectArray(candidate);
    }
  }
  return [];
}

function readNextCursorOutput(payload: unknown): { nextCursor?: string } {
  const record = optionalRecord(payload) ?? {};
  const meta = optionalRecord(record.meta) ?? {};
  const pagination = optionalRecord(record.pagination) ?? {};
  const nextCursor =
    optionalRawString(record.next_cursor) ??
    optionalRawString(record.nextCursor) ??
    optionalRawString(meta.next_cursor) ??
    optionalRawString(meta.nextCursor) ??
    optionalRawString(pagination.next_cursor) ??
    optionalRawString(pagination.nextCursor);

  return nextCursor ? { nextCursor } : {};
}

function normalizeObjectArray(items: unknown[]): Array<Record<string, unknown>> {
  return items.filter(isObjectPayload).map((item) => ({ ...item }));
}

function readDetailPayload(payload: unknown, fieldName: string): Record<string, unknown> {
  const record = requireObjectPayload(payload, fieldName);
  const data = record.data;
  if (isObjectPayload(data)) {
    return { ...data };
  }
  return record;
}

function requireObjectPayload(payload: unknown, fieldName: string): Record<string, unknown> {
  if (!isObjectPayload(payload)) {
    throw new ProviderRequestError(502, `${fieldName} must be a JSON object`, payload);
  }
  return { ...payload };
}

function isObjectPayload(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readPathSegment(value: unknown, fieldName: string): string {
  const trimmed = requiredString(value, fieldName, providerInputError);
  if (trimmed.includes("/") || trimmed.includes("?") || trimmed.includes("#")) {
    throw new ProviderRequestError(400, `${fieldName} must be a Quipteams path segment`);
  }
  return encodeURIComponent(trimmed);
}
