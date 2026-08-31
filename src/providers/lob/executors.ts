import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import { compactJson, queryParams } from "../../core/request.ts";
import {
  defineApiKeyProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "lob";
const lobApiBaseUrl = "https://api.lob.com/v1";

type LobActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const lobActionHandlers: ProviderActionHandlers<"lob", LobActionHandler> = {
  verify_us_address(input, context) {
    return verifyUsAddress(input, context);
  },
  bulk_verify_us_addresses(input, context) {
    return bulkVerifyUsAddresses(input, context);
  },
  autocomplete_us_addresses(input, context) {
    return autocompleteUsAddresses(input, context);
  },
  verify_international_address(input, context) {
    return verifyInternationalAddress(input, context);
  },
  bulk_verify_international_addresses(input, context) {
    return bulkVerifyInternationalAddresses(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, lobActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const payload = await requestLobJson({
      context: { apiKey: input.apiKey, fetcher, signal },
      path: "/addresses",
      method: "GET",
      query: queryParams({ limit: 1 }),
      phase: "validate",
    });
    const account = readObject(payload, "lob addresses response");
    const suffix = input.apiKey.slice(-4) || input.apiKey;
    return {
      profile: {
        accountId: `lob:${suffix}`,
        displayName: "Lob API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: lobApiBaseUrl,
        validationEndpoint: "/addresses?limit=1",
        addressCount: readArray(account.data).length,
      },
    };
  },
};

async function verifyUsAddress(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestLobJson({
    context,
    path: "/us_verifications",
    method: "POST",
    body: compactJson(input),
    phase: "execute",
  });

  return {
    verification: readObject(payload, "lob US verification response"),
  };
}

async function bulkVerifyUsAddresses(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestLobJson({
    context,
    path: "/us_verifications/bulk",
    method: "POST",
    body: compactJson(input),
    phase: "execute",
  });
  const response = readObject(payload, "lob bulk US verification response");

  return {
    verifications: readArray(response.addresses),
    raw: response,
  };
}

async function autocompleteUsAddresses(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await requestLobJson({
    context,
    path: "/us_autocompletions",
    method: "GET",
    query: queryParams({
      address_prefix: optionalString(input.address_prefix),
      city: optionalString(input.city),
      state: optionalString(input.state),
      zip_code: optionalString(input.zip_code),
      geo_ip_sort: optionalBoolean(input.geo_ip_sort),
    }),
    phase: "execute",
  });
  const response = readObject(payload, "lob US autocomplete response");

  return {
    suggestions: readArray(response.suggestions),
    raw: response,
  };
}

async function verifyInternationalAddress(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await requestLobJson({
    context,
    path: "/intl_verifications",
    method: "POST",
    body: compactJson(input),
    phase: "execute",
  });

  return {
    verification: readObject(payload, "lob international verification response"),
  };
}

async function bulkVerifyInternationalAddresses(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await requestLobJson({
    context,
    path: "/intl_verifications/bulk",
    method: "POST",
    body: compactJson(input),
    phase: "execute",
  });
  const response = readObject(payload, "lob bulk international verification response");

  return {
    verifications: readArray(response.addresses),
    raw: response,
  };
}

async function requestLobJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  method: "GET" | "POST";
  phase: "validate" | "execute";
  query?: Record<string, string>;
  body?: unknown;
}): Promise<unknown> {
  const url = new URL(`.${input.path}`, `${lobApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, value);
  }

  return runProviderRequest({ signal: input.context.signal, label: "lob" }, async (signal) => {
    const response = await input.context.fetcher(url, {
      method: input.method,
      headers: lobHeaders(input.context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });
    const payload = await readLobPayload(response);
    if (!response.ok) {
      throw createLobError(response.status, payload, input.phase);
    }
    return payload;
  });
}

function lobHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
    "user-agent": providerUserAgent,
    ...(hasBody ? { "content-type": "application/json" } : {}),
  };
}

async function readLobPayload(response: Response): Promise<unknown> {
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

function createLobError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = extractLobErrorMessage(payload) ?? "lob request failed";
  const isAuthError = status === 401 || status === 403;
  const mappedStatus = phase === "validate" && isAuthError ? 400 : status;
  return new ProviderRequestError(mappedStatus || 502, `lob request failed: ${message}`, payload);
}

function extractLobErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }
  const error = object.error;
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  const errorObject = optionalRecord(error);
  const message = optionalString(errorObject?.message) ?? optionalString(object.message);
  return message?.trim() || undefined;
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (record) {
    return record;
  }
  throw new ProviderRequestError(502, `invalid ${label}`);
}

function readArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map((item) => readObject(item, "lob array item")) : [];
}
