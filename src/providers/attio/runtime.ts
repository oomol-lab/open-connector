import { compactObject, optionalInteger, optionalRawString, optionalRecord, requiredArray } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

const attioApiBaseUrl = "https://api.attio.com";

type AttioRequestPhase = "validate" | "execute";

export interface AttioActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export type AttioActionHandler = (input: Record<string, unknown>, context: AttioActionContext) => Promise<unknown>;

interface AttioRequestOptions extends AttioActionContext {
  method: string;
  phase: AttioRequestPhase;
  searchParams?: URLSearchParams;
  body?: Record<string, unknown>;
}

export async function attioRequest(path: string, input: AttioRequestOptions): Promise<unknown> {
  const url = new URL(path, attioApiBaseUrl);
  if (input.searchParams) {
    for (const [key, value] of input.searchParams) {
      url.searchParams.set(key, value);
    }
  }

  return runProviderRequest({ label: "Attio", signal: input.signal }, async (signal) => {
    const response = await input.fetcher(url, {
      method: input.method,
      headers: attioHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });

    const payload = await readAttioPayload(response);
    if (!response.ok) throw createAttioError(response, payload, input.phase);
    return payload;
  });
}

function attioHeaders(apiKey: string, hasBody: boolean) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }

  return headers;
}

export async function readAttioPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (response.ok) {
      throw new ProviderRequestError(
        502,
        error instanceof Error ? `Attio returned malformed JSON: ${error.message}` : "Attio returned malformed JSON",
        undefined,
        "provider_error",
      );
    }

    return text;
  }
}

export function createAttioError(response: Response, payload: unknown, phase: AttioRequestPhase): ProviderRequestError {
  const providerCode = optionalRawString(optionalRecord(payload)?.code);
  const detail = extractAttioErrorMessage(payload) || response.statusText || "Attio request failed";
  const message = providerCode ? `${providerCode}: ${detail}` : detail;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, undefined, "rate_limited");
  }

  if (phase === "execute" && [400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, undefined, "invalid_input");
  }

  return new ProviderRequestError(response.status || 500, message, undefined, "provider_error");
}

function extractAttioErrorMessage(payload: unknown) {
  const data = optionalRecord(payload);
  if (!data) {
    return typeof payload === "string" && payload ? payload : undefined;
  }

  const message = optionalRawString(data.message) ?? optionalRawString(data.error_description);
  if (message) {
    return message;
  }

  const error = data.error;
  if (typeof error === "string" && error) {
    return error;
  }

  if (Array.isArray(data.errors)) {
    const firstError = optionalRecord(data.errors[0]);
    return optionalRawString(firstError?.message);
  }

  return undefined;
}

export function readDataObject(payload: unknown): Record<string, unknown> {
  const envelope = requiredResponseRecord(payload, "Attio response");
  return requiredResponseRecord(envelope.data, "Attio data");
}

export function readDataArray(payload: unknown): unknown[] {
  const data = optionalRecord(payload)?.data;
  return requiredArray(data, "Attio data", providerResponseError);
}

export function readPagination(
  payload: unknown,
): Partial<{ limit: number | undefined; offset: number | undefined }> | null {
  const root = optionalRecord(payload);
  const pagination = optionalRecord(root?.pagination) ?? root;
  const limit = optionalInteger(pagination?.limit);
  const offset = optionalInteger(pagination?.offset);
  if (limit === undefined && offset === undefined) {
    return null;
  }

  return compactObject({ limit, offset });
}
