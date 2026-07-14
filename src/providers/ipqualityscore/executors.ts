import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { IpqualityscoreActionName } from "./actions.ts";

import { isIP } from "node:net";
import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  defineApiKeyProviderExecutors,
  normalizeProviderProxyEndpoint,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "ipqualityscore";
const ipqualityscoreApiBaseUrl = "https://www.ipqualityscore.com";
const ipqualityscoreFetch = createProviderFetch({ skipDnsValidation: true });

type IpqualityscoreRequestPhase = "validate" | "execute";
type IpqualityscoreFamily = "email" | "ip" | "phone" | "url";
type IpqualityscoreActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type IpqualityscoreActionHandler = (
  input: Record<string, unknown>,
  context: IpqualityscoreActionContext,
) => Promise<unknown>;

export const ipqualityscoreActionHandlers: Record<IpqualityscoreActionName, IpqualityscoreActionHandler> = {
  check_ip_reputation(input, context) {
    const ipAddress = readRequiredString(input.ipAddress, "ipAddress");
    if (isIP(ipAddress) === 0) {
      throw new ProviderRequestError(400, "ipAddress must be a valid IPv4 or IPv6 address.");
    }

    return requestIpqualityscore(
      {
        family: "ip",
        value: ipAddress,
        phase: "execute",
        query: [
          ["strictness", optionalInteger(input.strictness)?.toString()],
          ["allow_public_access_points", optionalBoolean(input.allowPublicAccessPoints)?.toString()],
          ["user_agent", optionalString(input.userAgent)],
          ["user_language", optionalString(input.userLanguage)],
        ],
      },
      context,
    );
  },
  validate_email(input, context) {
    return requestIpqualityscore(
      {
        family: "email",
        value: readRequiredString(input.email, "email"),
        phase: "execute",
        query: [
          ["timeout", optionalInteger(input.timeout)?.toString()],
          ["abuse_strictness", optionalInteger(input.abuseStrictness)?.toString()],
        ],
      },
      context,
    );
  },
  validate_phone(input, context) {
    return requestIpqualityscore(
      {
        family: "phone",
        value: readRequiredString(input.phone, "phone"),
        phase: "execute",
        query: [["strictness", optionalInteger(input.strictness)?.toString()], ...buildCountryQuery(input.country)],
      },
      context,
    );
  },
  scan_url(input, context) {
    return requestIpqualityscore(
      {
        family: "url",
        value: readRequiredString(input.url, "url"),
        phase: "execute",
        query: [["strictness", optionalInteger(input.strictness)?.toString()]],
      },
      context,
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ipqualityscoreActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    if (input.method !== "GET") {
      throw new ProviderRequestError(400, "IPQualityScore proxy only supports GET");
    }
    const credential = await requireApiKeyCredential(context, service);
    const endpoint = normalizeProviderProxyEndpoint(input.endpoint);
    const parts = endpoint.split("/");
    const family = parts[3];
    const valuePath = parts.slice(4).join("/");
    if (parts[1] !== "api" || parts[2] !== "json" || !isIpqualityscoreFamily(family) || !valuePath) {
      throw new ProviderRequestError(400, "IPQualityScore proxy endpoint must be /api/json/{family}/{value}");
    }

    const url = createProviderProxyUrl(
      ipqualityscoreApiBaseUrl,
      `/api/json/${family}/${encodeURIComponent(credential.apiKey)}/${valuePath}`,
      input.query,
    );
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("user-agent", providerUserAgent);

    const response = await ipqualityscoreFetch(url, {
      method: "GET",
      headers,
      signal: context.signal,
    });
    if (!response.ok) {
      throw createIpqualityscoreError(response, await readIpqualityscorePayload(response), "execute");
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "IPQualityScore request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestIpqualityscore(
      {
        family: "ip",
        value: "8.8.8.8",
        phase: "validate",
      },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
    );
    const record = requireIpqualityscoreObject(payload, "validate");

    return {
      profile: {
        accountId: "api_key",
        displayName: "IPQualityScore API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/api/json/ip/{apiKey}/8.8.8.8",
        apiBaseUrl: ipqualityscoreApiBaseUrl,
        lastValidationRequestId: optionalString(record.request_id),
      }),
    };
  },
};

async function requestIpqualityscore(
  input: {
    family: IpqualityscoreFamily;
    value: string;
    phase: IpqualityscoreRequestPhase;
    query?: Array<[string, string | undefined]>;
  },
  context: IpqualityscoreActionContext,
): Promise<Record<string, unknown>> {
  const url = buildIpqualityscoreUrl(context.apiKey, input.family, input.value, input.query);

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readIpqualityscorePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `IPQualityScore request failed: ${error.message}` : "IPQualityScore request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createIpqualityscoreError(response, payload, input.phase);
  }

  const record = requireIpqualityscoreObject(payload, input.family);
  if (record.success === false) {
    throw createIpqualityscoreError(response, payload, input.phase);
  }

  return record;
}

function buildIpqualityscoreUrl(
  apiKey: string,
  family: IpqualityscoreFamily,
  value: string,
  query: Array<[string, string | undefined]> = [],
): URL {
  const encodedApiKey = encodeURIComponent(apiKey);
  const encodedValue = encodeURIComponent(value);
  const url = new URL(`/api/json/${family}/${encodedApiKey}/${encodedValue}`, ipqualityscoreApiBaseUrl);
  for (const [key, queryValue] of query) {
    if (queryValue !== undefined) {
      url.searchParams.append(key, queryValue);
    }
  }
  return url;
}

function isIpqualityscoreFamily(value: string | undefined): value is IpqualityscoreFamily {
  return value === "email" || value === "ip" || value === "phone" || value === "url";
}

async function readIpqualityscorePayload(response: Response): Promise<unknown> {
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

function createIpqualityscoreError(
  response: Response,
  payload: unknown,
  phase: IpqualityscoreRequestPhase,
): ProviderRequestError {
  const message =
    extractIpqualityscoreErrorMessage(payload) ??
    response.statusText ??
    `IPQualityScore request failed with ${response.status}`;
  const lowerMessage = message.toLowerCase();

  if (response.status === 429 || response.status === 402 || lowerMessage.includes("insufficient credits")) {
    return new ProviderRequestError(429, message, payload);
  }

  const looksLikeApiKeyError = lowerMessage.includes("invalid api key") || lowerMessage.includes("api key");
  if (looksLikeApiKeyError || response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }

  if (
    response.status === 400 ||
    lowerMessage.includes("invalid ip") ||
    lowerMessage.includes("invalid email") ||
    lowerMessage.includes("invalid phone") ||
    lowerMessage.includes("invalid url")
  ) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status >= 400 ? response.status : 502, message, payload);
}

function extractIpqualityscoreErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed || undefined;
  }

  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error);
}

function requireIpqualityscoreObject(payload: unknown, endpoint: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `IPQualityScore response for ${endpoint} was not a JSON object`, payload);
  }
  return record;
}

function buildCountryQuery(input: unknown): Array<[string, string]> {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((value): value is string => typeof value === "string")
    .map((value) => ["country[]", value.trim().toUpperCase()]);
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}
