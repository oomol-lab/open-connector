import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredRecord, stringArray } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

type SerphousePhase = "validate" | "execute";
type SerphouseQueryValue = string | number | undefined;
type SerphouseActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type SerphouseActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

const serphouseBaseUrl = "https://api.serphouse.com";

export const serphouseActionHandlers: ProviderActionHandlers<"serphouse", SerphouseActionHandler> = {
  async account_info(_input, context) {
    const payload = requiredRecord(
      await requestSerphouseJson({
        path: "/account/info",
        method: "GET",
        context,
        phase: "execute",
      }),
      "SERPHouse account info response",
      providerOutputError,
    );

    return normalizeAccountInfo(payload);
  },
  async list_domains(_input, context) {
    const payload = requiredRecord(
      await requestSerphouseJson({
        path: "/domain/list",
        method: "GET",
        context,
        phase: "execute",
      }),
      "SERPHouse domain list response",
      providerOutputError,
    );

    return {
      status: readString(payload.status, "status"),
      msg: readString(payload.msg, "msg"),
      domains: stringArray(payload.results, "SERPHouse results", providerOutputError),
    };
  },
  async list_languages(input, context) {
    const payload = requiredRecord(
      await requestSerphouseJson({
        path: `/language/list/${encodeURIComponent(readRequiredString(input.type, "type"))}`,
        method: "GET",
        context,
        phase: "execute",
      }),
      "SERPHouse language list response",
      providerOutputError,
    );

    return {
      status: readString(payload.status, "status"),
      msg: readString(payload.msg, "msg"),
      languages: readStringRecord(payload.results, "results"),
    };
  },
  async search_locations(input, context) {
    const payload = requiredRecord(
      await requestSerphouseJson({
        path: "/location/search",
        method: "GET",
        query: {
          q: readRequiredString(input.q, "q"),
          type: readRequiredString(input.type, "type"),
        },
        context,
        phase: "execute",
      }),
      "SERPHouse location search response",
      providerOutputError,
    );

    return {
      status: readString(payload.status, "status"),
      msg: readString(payload.msg, "msg"),
      locations: asArrayOfObjects(payload.results),
    };
  },
  async search_web(input, context) {
    const payload = requiredRecord(
      await requestSerphouseJson({
        path: "/serp/live",
        method: "POST",
        body: {
          data: compactObject({
            q: readRequiredString(input.q, "q"),
            domain: readRequiredString(input.domain, "domain"),
            lang: readRequiredString(input.lang, "lang"),
            device: readRequiredString(input.device, "device"),
            serp_type: "web",
            loc: optionalString(input.loc),
            loc_id: readOptionalNumber(input.loc_id),
            verbatim: readOptionalNumber(input.verbatim),
            gfilter: readOptionalNumber(input.gfilter),
            page: readOptionalNumber(input.page),
            num_result: readOptionalNumber(input.num_result),
            date_range: optionalString(input.date_range),
          }),
        },
        context,
        phase: "execute",
      }),
      "SERPHouse live SERP response",
      providerOutputError,
    );

    return normalizeSearchWeb(payload);
  },
};

export async function validateSerphouseCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = requiredRecord(
    await requestSerphouseJson({
      path: "/account/info",
      method: "GET",
      context: {
        apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    }),
    "SERPHouse account info response",
    providerOutputError,
  );
  const account = sanitizeAccount(requiredRecord(payload.results ?? {}, "SERPHouse account", providerOutputError));
  const email = optionalString(account.email);
  const name = optionalString(account.name);
  const planCount = Array.isArray(account.plan) ? account.plan.length : undefined;

  return {
    profile: {
      accountId: email ?? "serphouse-api-key",
      displayName: email ?? name ?? "SERPHouse API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/account/info",
      email,
      name,
      planCount,
    }),
  };
}

async function requestSerphouseJson(input: {
  path: string;
  method: "GET" | "POST";
  query?: Record<string, SerphouseQueryValue>;
  body?: Record<string, unknown>;
  context: SerphouseActionContext;
  phase: SerphousePhase;
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;

  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${input.context.apiKey}`,
      "user-agent": providerUserAgent,
    };
    if (input.body) {
      headers["content-type"] = "application/json";
    }

    response = await input.context.fetcher(buildSerphouseUrl(input.path, input.query), {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `SERPHouse request failed: ${error.message}` : "SERPHouse request failed",
    );
  }

  if (!response.ok) {
    throw createSerphouseError(response.status, payload, input.phase);
  }

  if (optionalRecord(payload)?.status === "error") {
    throw createSerphouseError(0, payload, input.phase);
  }

  return payload;
}

function buildSerphouseUrl(path: string, query: Record<string, SerphouseQueryValue> = {}): string {
  const url = new URL(path, serphouseBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "SERPHouse returned invalid JSON");
  }
}

function createSerphouseError(status: number, payload: unknown, phase: SerphousePhase): ProviderRequestError {
  const message = extractSerphouseMessage(payload) ?? `SERPHouse request failed with status ${status || 500}`;

  if (status === 429 || status === 402) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  if ((status === 401 || status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(403, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message, payload);
}

function extractSerphouseMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const msg = optionalString(record?.msg);
  if (msg) {
    return msg;
  }
  const error = record?.error;
  if (typeof error === "string" && error) {
    return error;
  }
  if (error && typeof error === "object") {
    return JSON.stringify(error);
  }
  return undefined;
}

function normalizeAccountInfo(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    status: readString(payload.status, "status"),
    msg: readString(payload.msg, "msg"),
    account: sanitizeAccount(requiredRecord(payload.results ?? {}, "SERPHouse account", providerOutputError)),
  };
}

function normalizeSearchWeb(payload: Record<string, unknown>): Record<string, unknown> {
  const resultEnvelope = requiredRecord(payload.results ?? {}, "SERPHouse results", providerOutputError);
  return {
    status: readString(payload.status, "status"),
    msg: readString(payload.msg, "msg"),
    search_metadata: requiredRecord(
      resultEnvelope.search_metadata ?? {},
      "SERPHouse search_metadata",
      providerOutputError,
    ),
    search_parameters: requiredRecord(
      resultEnvelope.search_parameters ?? {},
      "SERPHouse search_parameters",
      providerOutputError,
    ),
    results: requiredRecord(resultEnvelope.results ?? {}, "SERPHouse results.results", providerOutputError),
  };
}

function sanitizeAccount(account: Record<string, unknown>): Record<string, unknown> {
  const { api_key: _apiKey, ...safeAccount } = account;
  return safeAccount;
}

function asArrayOfObjects(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "SERPHouse returned invalid array payload");
  }
  return value.map((item) => requiredRecord(item, "SERPHouse array item", providerOutputError));
}

function readStringRecord(value: unknown, fieldName: string): Record<string, string> {
  const record = requiredRecord(value, `SERPHouse ${fieldName}`, providerOutputError);
  for (const [key, child] of Object.entries(record)) {
    if (typeof child !== "string") {
      throw new ProviderRequestError(502, `SERPHouse returned invalid ${fieldName}.${key} value`);
    }
  }
  return record as Record<string, string>;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, `SERPHouse returned invalid ${fieldName} value`);
  }
  return value;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function providerOutputError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
