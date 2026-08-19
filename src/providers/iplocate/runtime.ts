import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { isIP } from "node:net";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const iplocateApiBaseUrl = "https://iplocate.io/api";

const requestTimeoutMs = 30_000;

type IplocateRequestPhase = "validate" | "execute";
type IplocateActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface IplocateRequestInput {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

export const iplocateActionHandlers: ProviderActionHandlers<"iplocate", IplocateActionHandler> = {
  async lookup_ip(input, context): Promise<unknown> {
    const ip = readIpAddress(input.ip, "ip");
    return {
      result: await requestIplocateObject(
        {
          method: "GET",
          path: `/lookup/${encodeURIComponent(ip)}`,
          query: {
            include: readInclude(input.include),
          },
        },
        context,
        "execute",
        "IPLocate lookup response",
      ),
    };
  },

  async lookup_self(input, context): Promise<unknown> {
    return {
      result: await requestIplocateObject(
        {
          method: "GET",
          path: "/lookup",
          query: {
            include: readInclude(input.include),
          },
        },
        context,
        "execute",
        "IPLocate self-lookup response",
      ),
    };
  },

  async batch_lookup(input, context): Promise<unknown> {
    const ipAddresses = readIpAddressArray(input.ipAddresses, "ipAddresses");
    return {
      requestedCount: ipAddresses.length,
      resultsByIp: await requestIplocateObject(
        {
          method: "POST",
          path: "/batch",
          body: ipAddresses,
        },
        context,
        "execute",
        "IPLocate batch lookup response",
      ),
    };
  },
};

export async function validateIplocateCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestIplocateObject(
    {
      method: "GET",
      path: "/lookup",
    },
    { apiKey, fetcher, signal },
    "validate",
    "IPLocate validation response",
  );

  return {
    profile: {
      accountId: "iplocate:api-key",
      displayName: "IPLocate API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: iplocateApiBaseUrl,
      validationEndpoint: "/lookup",
      validationIp: optionalString(payload.ip),
      validationCountryCode: optionalString(payload.country_code),
    },
  };
}

async function requestIplocateObject(
  input: IplocateRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: IplocateRequestPhase,
  responseLabel: string,
): Promise<Record<string, unknown>> {
  const payload = await requestIplocateJson(input, context, phase);
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${responseLabel} must be a JSON object`);
  }
  return record;
}

async function requestIplocateJson(
  input: IplocateRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: IplocateRequestPhase,
): Promise<unknown> {
  const url = new URL(`${iplocateApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value != null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: input.method,
      headers: iplocateHeaders(context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    payload = await readIplocatePayload(response);
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, `IPLocate request timed out after ${requestTimeoutMs / 1000} seconds`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `IPLocate request failed: ${error.message}` : "IPLocate request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createIplocateError(response, payload, phase);
  }

  return payload;
}

function iplocateHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "X-API-Key": apiKey,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readIplocatePayload(response: Response): Promise<unknown> {
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

function createIplocateError(response: Response, payload: unknown, phase: IplocateRequestPhase): ProviderRequestError {
  const message = extractIplocateErrorMessage(payload) ?? (response.statusText || "IPLocate request failed");
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  }
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
}

function extractIplocateErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.error) ?? optionalString(record.message);
}

function readIpAddress(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  const ip = value.trim();
  if (isIP(ip) === 0) {
    throw new ProviderRequestError(400, `${fieldName} must be an IPv4 or IPv6 address`);
  }
  return ip;
}

function readIpAddressArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value.map((item, index) => readIpAddress(item, `${fieldName}[${index}]`));
}

function readInclude(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "include must be an array");
  }
  return value
    .map((item, index) => {
      if (typeof item !== "string" || item.trim() === "") {
        throw new ProviderRequestError(400, `include[${index}] must be a non-empty string`);
      }
      return item.trim();
    })
    .join(",");
}
