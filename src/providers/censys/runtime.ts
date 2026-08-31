import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

type CensysActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type CensysRequestPhase = "validate" | "execute";
type CensysQueryValue = string | undefined;

export const censysApiBaseUrl = "https://api.platform.censys.io/v3";

export const censysActionHandlers: ProviderActionHandlers<"censys", CensysActionHandler> = {
  async get_host(input, context) {
    const hostId = readRequiredString(input.host_id, "host_id");
    const payload = await requestCensysJson(
      {
        path: `/global/asset/host/${encodeURIComponent(hostId)}`,
        query: buildAssetQuery(input),
      },
      context.apiKey,
      context.fetcher,
      "execute",
      context.signal,
    );

    return {
      host: normalizeAssetPayload(payload),
    };
  },
  async get_certificate(input, context) {
    const certificateId = readRequiredString(input.certificate_id, "certificate_id");
    const payload = await requestCensysJson(
      {
        path: `/global/asset/certificate/${encodeURIComponent(certificateId)}`,
      },
      context.apiKey,
      context.fetcher,
      "execute",
      context.signal,
    );

    return {
      certificate: normalizeAssetPayload(payload),
    };
  },
  async get_web_property(input, context) {
    const webPropertyId = readRequiredString(input.webproperty_id, "webproperty_id");
    const payload = await requestCensysJson(
      {
        path: `/global/asset/webproperty/${encodeURIComponent(webPropertyId)}`,
        query: buildAssetQuery(input),
      },
      context.apiKey,
      context.fetcher,
      "execute",
      context.signal,
    );

    return {
      webProperty: normalizeAssetPayload(payload),
    };
  },
};

export async function validateCensysCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestCensysJson(
    {
      path: "/global/asset/host/8.8.8.8",
    },
    apiKey,
    fetcher,
    "validate",
    signal,
  );

  return {
    profile: {
      accountId: "censys",
      displayName: "Censys Personal Access Token",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: censysApiBaseUrl,
      validationEndpoint: "/global/asset/host/8.8.8.8",
    },
  };
}

interface CensysRequestInput {
  path: string;
  query?: Record<string, CensysQueryValue>;
}

async function requestCensysJson(
  input: CensysRequestInput,
  apiKey: string,
  fetcher: typeof fetch,
  phase: CensysRequestPhase,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  let response: Response;
  let payload: unknown;
  const timeoutSignal = createProviderTimeout(signal);

  try {
    response = await fetcher(buildCensysUrl(input), {
      method: "GET",
      headers: buildCensysHeaders(apiKey),
      signal: timeoutSignal.signal,
    });
    if (!response.ok) {
      payload = await readCensysPayload(response, { allowTextFallback: true });
      throw createCensysError(response.status, payload, phase);
    }

    payload = await readCensysPayload(response);
    const payloadObject = optionalRecord(payload);
    if (!payloadObject) {
      throw new ProviderRequestError(502, "Censys returned an invalid JSON response", payload);
    }

    return payloadObject;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    const isTimeoutError =
      timeoutSignal.didTimeout() ||
      (error instanceof Error &&
        (error.name === "AbortError" ||
          error.name === "TimeoutError" ||
          (error as Error & { code?: unknown }).code === "ECONNABORTED"));

    throw new ProviderRequestError(
      isTimeoutError ? 504 : 502,
      error instanceof Error ? `Censys request failed: ${error.message}` : "Censys request failed",
    );
  } finally {
    timeoutSignal.cleanup();
  }
}

function buildCensysHeaders(apiKey: string) {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

function buildCensysUrl(input: CensysRequestInput) {
  const url = new URL(`${censysApiBaseUrl}${input.path}`);
  if (input.query) {
    for (const [key, value] of Object.entries(input.query)) {
      if (value === undefined) {
        continue;
      }
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function readCensysPayload(response: Response, options: { allowTextFallback?: boolean } = {}) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (options.allowTextFallback) {
      return text;
    }
    throw new ProviderRequestError(502, "Censys returned invalid JSON");
  }
}

function createCensysError(status: number, payload: unknown, phase: CensysRequestPhase) {
  const message = readCensysMessage(payload) ?? `Censys request failed with ${status || 500}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 500, message, payload);
}

function readCensysMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage =
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(record.title);
  if (directMessage) {
    return directMessage;
  }

  const nestedError = optionalRecord(record.error);
  const nestedMessage =
    optionalString(nestedError?.message) ?? optionalString(nestedError?.detail) ?? optionalString(nestedError?.title);
  if (nestedMessage) {
    return nestedMessage;
  }

  const errors = record.errors;
  if (!Array.isArray(errors)) {
    return undefined;
  }

  for (const error of errors) {
    if (typeof error === "string" && error.trim() !== "") {
      return error.trim();
    }

    const errorObject = optionalRecord(error);
    const errorMessage =
      optionalString(errorObject?.message) ?? optionalString(errorObject?.detail) ?? optionalString(errorObject?.title);
    if (errorMessage) {
      return errorMessage;
    }
  }

  return undefined;
}

function normalizeAssetPayload(payload: Record<string, unknown>) {
  const result = readResultObject(payload);
  return optionalRecord(result.resource) ?? result;
}

function readResultObject(payload: Record<string, unknown>) {
  return optionalRecord(payload.result) ?? payload;
}

function buildAssetQuery(input: Record<string, unknown>) {
  return compactObject({
    at_time: readOptionalString(input.at_time),
  });
}

function readRequiredString(value: unknown, fieldName: string) {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function readOptionalString(value: unknown) {
  return optionalString(value);
}
