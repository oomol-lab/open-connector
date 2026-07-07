import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";
import { unifapiOperationByActionName } from "./operations.ts";

export const unifapiApiBaseUrl = "https://api.unifapi.com";
export const unifapiApiVersion = "2026-07-01";

const unifapiDefaultRequestTimeoutMs = 60_000;
const validationEndpoint = "/hacker-news/max-item";

type UnifapiPhase = "validate" | "execute";

interface UnifapiRequestInput {
  path: string;
  method: "GET" | "POST";
  apiKey: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  phase: UnifapiPhase;
  signal?: AbortSignal;
}

export const unifapiActionHandlers: Record<string, ProviderRuntimeHandler<ApiKeyProviderContext>> = Object.fromEntries(
  [...unifapiOperationByActionName].map(([actionName, operation]) => [
    actionName,
    async (input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> => {
      const path = buildPath(operation.path, operation.pathFields, input);
      return requestUnifapiJson({
        path,
        method: operation.method,
        apiKey: context.apiKey,
        query: pickFields(input, operation.queryFields),
        body: operation.method === "POST" ? pickFields(input, operation.bodyFields) : undefined,
        fetcher: context.fetcher,
        phase: "execute",
        signal: context.signal,
      });
    },
  ]),
);

export async function validateUnifapiCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  await requestUnifapiJson({
    path: validationEndpoint,
    method: "GET",
    apiKey,
    fetcher: options.fetcher,
    phase: "validate",
    signal: options.signal,
  });

  return {
    profile: {
      accountId: "unifapi-api-key",
      displayName: "UnifAPI API Key",
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint,
      apiBaseUrl: unifapiApiBaseUrl,
      apiVersion: unifapiApiVersion,
    },
  };
}

async function requestUnifapiJson(input: UnifapiRequestInput): Promise<Record<string, unknown>> {
  const timeoutHandle = createProviderTimeout(input.signal, unifapiDefaultRequestTimeoutMs);

  try {
    const response = await input.fetcher(buildUnifapiUrl(input.path, input.query), {
      method: input.method,
      headers: buildHeaders(input.apiKey, input.body),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeoutHandle.signal,
    });
    const payload = await readUnifapiPayload(response);

    if (!response.ok) {
      throw createUnifapiError(response.status, payload, input.phase);
    }

    const payloadRecord = optionalRecord(payload);
    if (!payloadRecord) {
      throw new ProviderRequestError(502, "UnifAPI returned an invalid payload", payload);
    }
    return payloadRecord;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeoutHandle.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "UnifAPI request timed out", error);
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `UnifAPI request failed: ${error.message}` : "UnifAPI request failed",
      error,
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

function buildHeaders(apiKey: string, body: Record<string, unknown> | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "unifapi-version": unifapiApiVersion,
    "user-agent": providerUserAgent,
  };
  if (body) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function buildUnifapiUrl(path: string, query: Record<string, unknown> | undefined): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${unifapiApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value == null) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

function buildPath(template: string, fields: readonly string[], input: Record<string, unknown>): string {
  let path = template;
  for (const field of fields) {
    const value = input[field];
    if (value == null) {
      throw new ProviderRequestError(400, `${field} is required`);
    }
    path = path.replaceAll(`{${field}}`, encodeURIComponent(String(value)));
  }
  return path;
}

function pickFields(input: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const field of fields) {
    const value = input[field];
    if (value !== undefined) {
      output[field] = value;
    }
  }
  return output;
}

async function readUnifapiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "UnifAPI returned invalid JSON");
  }
}

function createUnifapiError(status: number, payload: unknown, phase: UnifapiPhase): ProviderRequestError {
  const message = extractUnifapiErrorMessage(payload) ?? `UnifAPI request failed with status ${status}`;

  if (status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (status === 400 || status === 404) {
    return new ProviderRequestError(status, message, payload);
  }

  if (status === 402) {
    return new ProviderRequestError(502, message, { status, payload });
  }

  return new ProviderRequestError(502, message, { status, payload });
}

function extractUnifapiErrorMessage(payload: unknown): string | undefined {
  const payloadRecord = optionalRecord(payload);
  const error = optionalRecord(payloadRecord?.error);
  return optionalString(error?.message) ?? optionalString(payloadRecord?.message);
}
