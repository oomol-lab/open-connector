import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  nullableString,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "riveter";
const riveterApiBaseUrl = "https://api.riveterhq.com/v1";
const validationPath = "/account";
const requestTimeoutMs = 30_000;

type RiveterActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const riveterActionHandlers: ProviderActionHandlers<"riveter", RiveterActionHandler> = {
  get_account(_input, context) {
    return requestRiveterObject({
      method: "GET",
      path: validationPath,
      context,
      phase: "execute",
    });
  },
  async scrape(input, context) {
    const payload = await requestRiveterObject({
      method: "POST",
      path: "/scrape",
      context,
      phase: "execute",
      body: compactObject({
        url: input.url,
        proxy_country_code: input.proxy_country_code,
        skip_cache: input.skip_cache,
      }),
    });
    return normalizeScrapeResponse(payload);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, riveterActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
    const payload = await requestRiveterObject({
      method: "GET",
      path: validationPath,
      context: { apiKey, fetcher, signal },
      phase: "validate",
    });
    const account = optionalRecord(payload.account);
    const apiKeyInfo = optionalRecord(payload.api_key_info);
    const accountName = optionalString(account?.name);
    const apiKeyName = optionalString(apiKeyInfo?.name);
    return {
      profile: {
        accountId: optionalString(account?.uuid) ?? "riveter-api-key",
        displayName: accountName ?? apiKeyName ?? "Riveter API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: validationPath,
        accountUuid: optionalString(account?.uuid),
        accountName,
        plan: optionalString(account?.plan),
        apiKeyName,
        lastUsedAt: nullableString(apiKeyInfo?.last_used_at),
      }),
    };
  },
};

async function requestRiveterObject(input: {
  method: "GET" | "POST";
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: "validate" | "execute";
  body?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const signal = input.context.signal ?? controller.signal;
  try {
    const response = await input.context.fetcher(buildRiveterUrl(input.path), {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        ...(input.body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      signal,
    });
    const payload = await readRiveterPayload(response);
    if (!response.ok) {
      throw createRiveterError(response.status, payload, input.phase);
    }
    return requiredRecord(payload, "Riveter payload", (message) => new ProviderRequestError(502, message));
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new ProviderRequestError(504, "Riveter request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Riveter request failed: ${error.message}` : "Riveter request failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function buildRiveterUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, `${riveterApiBaseUrl}/`).toString();
}

async function readRiveterPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Riveter returned invalid JSON");
  }
}

function createRiveterError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = extractRiveterErrorMessage(payload) ?? `Riveter request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function extractRiveterErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }
  const record = optionalRecord(payload);
  return record
    ? optionalString(record.message)?.trim() ||
        optionalString(record.error)?.trim() ||
        optionalString(record.detail)?.trim()
    : undefined;
}

function normalizeScrapeResponse(payload: Record<string, unknown>): Record<string, unknown> {
  const data = requiredRecord(payload.data, "data", (message) => new ProviderRequestError(502, message));
  return {
    request_status: requireProviderString(payload.request_status, "request_status"),
    message: requireProviderString(payload.message, "message"),
    run_key: requireProviderString(payload.run_key, "run_key"),
    data: compactObject({
      url: requireProviderString(data.url, "data.url"),
      text: requireProviderString(data.text, "data.text"),
      base_url_for_links: requireProviderString(data.base_url_for_links, "data.base_url_for_links"),
      status_code: optionalNumber(data.status_code),
      possibly_blocked: typeof data.possibly_blocked === "boolean" ? data.possibly_blocked : undefined,
      credit_used: requireProviderNumber(data.credit_used, "data.credit_used"),
      riveter_app_link: requireProviderString(data.riveter_app_link, "data.riveter_app_link"),
      raw: data,
    }),
  };
}

function requireProviderString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `Riveter returned invalid ${fieldName}`);
  }
  return parsed;
}

function requireProviderNumber(value: unknown, fieldName: string): number {
  const parsed = optionalNumber(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `Riveter returned invalid ${fieldName}`);
  }
  return parsed;
}
