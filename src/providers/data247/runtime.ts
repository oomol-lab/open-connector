import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { Data247ActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const data247ApiBaseUrl = "https://api.data247.com/v3.0";
const data247DefaultRequestTimeoutMs = 30_000;

type Data247ApiCode = "B" | "CT" | "VP" | "DC" | "AG";
type Data247Phase = "validate" | "execute";
type Data247Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface Data247RequestInput {
  apiKey: string;
  fetcher: typeof fetch;
  api: Data247ApiCode;
  phase: Data247Phase;
  signal?: AbortSignal;
  query?: Record<string, string | undefined>;
}

interface Data247ListOutput {
  status: string;
  message?: string;
  results: unknown[];
}

interface Data247DncOutput {
  status: string;
  message?: string;
  phone: string;
  dnc: string;
}

export const data247ActionHandlers: Record<Data247ActionName, Data247Handler> = {
  check_balance(_input, context) {
    return requestData247ListOutput({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      api: "B",
      phase: "execute",
      signal: context.signal,
    });
  },
  get_carrier_type(input, context) {
    return requestData247ListOutput({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      api: "CT",
      phase: "execute",
      signal: context.signal,
      query: {
        phone: requiredString(input.phone, "phone", badInput),
      },
    });
  },
  verify_phone(input, context) {
    return requestData247ListOutput({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      api: "VP",
      phase: "execute",
      signal: context.signal,
      query: {
        phone: requiredString(input.phone, "phone", badInput),
      },
    });
  },
  check_dnc(input, context) {
    return requestData247DncOutput({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      api: "DC",
      phase: "execute",
      signal: context.signal,
      query: {
        phone: requiredString(input.phone, "phone", badInput),
      },
    });
  },
  append_gender(input, context) {
    return requestData247ListOutput({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      api: "AG",
      phase: "execute",
      signal: context.signal,
      query: {
        fname: requiredString(input.fname, "fname", badInput),
      },
    });
  },
};

export async function validateData247Credential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const output = await requestData247ListOutput({
    apiKey,
    fetcher,
    api: "B",
    phase: "validate",
    signal,
  });
  const firstResult = optionalRecord(output.results[0]);

  return {
    profile: {
      accountId: "api_key",
      displayName: "Data247 API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: data247ApiBaseUrl,
      validationApi: "B",
      balance: optionalString(firstResult?.balance),
    }),
  };
}

async function requestData247ListOutput(input: Data247RequestInput): Promise<Data247ListOutput> {
  const payload = await requestData247Json(input);
  const response = unwrapData247Response(payload, input.api, input.phase);
  return normalizeListResponse(response, input.api);
}

async function requestData247DncOutput(input: Data247RequestInput): Promise<Data247DncOutput> {
  const payload = await requestData247Json(input);
  const response = unwrapData247Response(payload, input.api, input.phase);
  return normalizeDncResponse(response, input.api);
}

async function requestData247Json(input: Data247RequestInput): Promise<unknown> {
  const url = new URL(data247ApiBaseUrl);
  url.searchParams.set("key", input.apiKey);
  url.searchParams.set("api", input.api);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(input.signal, data247DefaultRequestTimeoutMs);
  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
  } catch (error) {
    if (isAbortLikeError(error) || timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Data247 request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Data247 request failed: ${error.message}` : "Data247 request failed",
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readData247Payload(response);
  if (!response.ok) {
    throw createData247Error(response.status, payload, input.phase);
  }
  return payload;
}

async function readData247Payload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function unwrapData247Response(payload: unknown, api: Data247ApiCode, phase: Data247Phase): Record<string, unknown> {
  const payloadObject = optionalRecord(payload);
  const response = optionalRecord(payloadObject?.response);
  if (!response) {
    throw new ProviderRequestError(502, `Data247 api ${api} returned a response without response object`, payload);
  }

  if (optionalString(response.status) !== "OK") {
    throw createData247Error(200, payload, phase);
  }

  return response;
}

function normalizeListResponse(response: Record<string, unknown>, api: Data247ApiCode): Data247ListOutput {
  if (!Array.isArray(response.results)) {
    throw new ProviderRequestError(502, `Data247 api ${api} returned a response without results`, response);
  }
  return compactObject({
    status: readRequiredResponseString(response.status, "status", api),
    message: optionalString(response.message),
    results: response.results,
  }) as Data247ListOutput;
}

function normalizeDncResponse(response: Record<string, unknown>, api: Data247ApiCode): Data247DncOutput {
  return compactObject({
    status: readRequiredResponseString(response.status, "status", api),
    message: optionalString(response.message),
    phone: readRequiredResponseString(response.phone, "phone", api),
    dnc: readRequiredResponseString(response.dnc, "dnc", api),
  }) as Data247DncOutput;
}

function createData247Error(status: number, payload: unknown, phase: Data247Phase): ProviderRequestError {
  const data247Status = extractData247Status(payload);
  const message = extractData247ErrorMessage(payload) ?? `Data247 request failed with ${status}`;

  if (data247Status === "D247_INVALID_API_KEY") {
    return new ProviderRequestError(400, message, payload);
  }
  if (data247Status === "D247_INVALID_API" || status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 400 ? status : 502, message, payload);
}

function extractData247Status(payload: unknown): string | undefined {
  return optionalString(optionalRecord(optionalRecord(payload)?.response)?.status);
}

function extractData247ErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }
  const payloadObject = optionalRecord(payload);
  const response = optionalRecord(payloadObject?.response);
  return (
    optionalString(response?.message) ?? optionalString(response?.status) ?? optionalString(payloadObject?.message)
  );
}

function readRequiredResponseString(value: unknown, fieldName: string, api: Data247ApiCode): string {
  if (typeof value === "string") {
    return value;
  }
  throw new ProviderRequestError(502, `Data247 api ${api} response missing ${fieldName}`);
}

function badInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
