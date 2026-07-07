import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { IpregistryActionName } from "./actions.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "ipregistry";
const ipregistryBaseUrl = "https://api.ipregistry.co";
const validationIp = "8.8.8.8";

type IpregistryRequestPhase = "validate" | "execute";
type IpregistryActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type IpregistryActionHandler = (input: Record<string, unknown>, context: IpregistryActionContext) => Promise<unknown>;

export const ipregistryActionHandlers: Record<IpregistryActionName, IpregistryActionHandler> = {
  async lookup_ip(input, context) {
    const payload = await requestIpregistryJson(
      {
        pathSegments: [readRequiredString(input.ipAddress, "ipAddress")],
        query: {
          hostname: input.includeHostname === true ? "true" : undefined,
          fields: optionalString(input.fields),
        },
        phase: "execute",
      },
      context,
    );

    return { data: requireIpregistryObject(payload) };
  },
  async batch_lookup_ips(input, context) {
    const payload = await requestIpregistryJson(
      {
        pathSegments: [],
        query: {
          hostname: input.includeHostname === true ? "true" : undefined,
          fields: optionalString(input.fields),
        },
        method: "POST",
        body: readStringArray(input.ipAddresses, "ipAddresses"),
        phase: "execute",
      },
      context,
    );

    return { results: normalizeResults(payload) };
  },
  async parse_user_agents(input, context) {
    const payload = await requestIpregistryJson(
      {
        pathSegments: ["user_agent"],
        query: {
          fields: optionalString(input.fields),
        },
        method: "POST",
        body: readStringArray(input.userAgents, "userAgents"),
        phase: "execute",
      },
      context,
    );

    return { results: normalizeResults(payload) };
  },
  async lookup_asn(input, context) {
    const payload = await requestIpregistryJson(
      {
        pathSegments: [normalizeAsn(readRequiredString(input.asn, "asn"))],
        query: {
          fields: optionalString(input.fields),
        },
        phase: "execute",
      },
      context,
    );

    return { data: requireIpregistryObject(payload) };
  },
  async batch_lookup_asns(input, context) {
    const payload = await requestIpregistryJson(
      {
        pathSegments: [],
        query: {
          fields: optionalString(input.fields),
        },
        method: "POST",
        body: readStringArray(input.asns, "asns").map((asn) => normalizeAsn(asn)),
        phase: "execute",
      },
      context,
    );

    return { results: normalizeResults(payload) };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ipregistryActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: ipregistryBaseUrl,
  auth: {
    type: "api_key_authorization",
    prefix: "ApiKey ",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestIpregistryJson(
      {
        pathSegments: [validationIp],
        query: {},
        phase: "validate",
      },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
    );
    const data = requireIpregistryObject(payload);
    const location = optionalRecord(data.location);
    const country = optionalRecord(location?.country);

    return {
      profile: {
        accountId: "api_key",
        displayName: "Ipregistry API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: ipregistryBaseUrl,
        validationEndpoint: `/${validationIp}`,
        validatedIp: optionalString(data.ip) ?? validationIp,
        validatedCountryCode: optionalString(country?.code),
        validatedCountryName: optionalString(country?.name),
      },
    };
  },
};

async function requestIpregistryJson(
  input: {
    pathSegments: string[];
    query: Record<string, unknown>;
    phase: IpregistryRequestPhase;
    method?: "GET" | "POST";
    body?: unknown;
  },
  context: IpregistryActionContext,
): Promise<unknown> {
  const method = input.method ?? "GET";

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(buildIpregistryUrl(input.pathSegments, input.query), {
      method,
      headers: {
        accept: "application/json",
        authorization: `ApiKey ${context.apiKey}`,
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      ...(method === "POST" ? { body: JSON.stringify(input.body) } : {}),
      signal: context.signal,
    });
    payload = await readIpregistryPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      isAbortLikeError(error) ? 504 : 502,
      error instanceof Error ? error.message : "Ipregistry request failed",
      error,
    );
  }

  if (!response.ok) {
    throw mapIpregistryError(response.status, extractIpregistryErrorMessage(payload), input.phase);
  }

  return payload;
}

function buildIpregistryUrl(pathSegments: string[], query: Record<string, unknown>): URL {
  const url = new URL(ipregistryBaseUrl);
  for (const segment of pathSegments) {
    const basePath = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
    url.pathname = `${basePath}/${encodeURIComponent(segment)}`;
  }
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readIpregistryPayload(response: Response): Promise<unknown> {
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

function normalizeResults(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map((item) => requireIpregistryObject(item));
  }

  const record = requireIpregistryObject(payload);
  if (!Array.isArray(record.results)) {
    throw new ProviderRequestError(502, "Ipregistry response did not include results", payload);
  }

  return record.results.map((item) => requireIpregistryObject(item));
}

function requireIpregistryObject(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "Ipregistry response was not a JSON object", value);
  }
  return record;
}

function normalizeAsn(value: string): string {
  const trimmed = value.trim();
  return trimmed.toUpperCase().startsWith("AS") ? trimmed.toUpperCase() : `AS${trimmed}`;
}

function extractIpregistryErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.resolution) ?? optionalString(record.code);
}

function mapIpregistryError(
  status: number,
  message: string | undefined,
  phase: IpregistryRequestPhase,
): ProviderRequestError {
  const normalizedMessage = message ?? "Ipregistry request failed";

  if (status === 401 || status === 403 || status === 451) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, normalizedMessage);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, normalizedMessage);
  }
  if (status === 402 || status === 429) {
    return new ProviderRequestError(429, normalizedMessage);
  }
  return new ProviderRequestError(status || 500, normalizedMessage);
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value.map((item) => readRequiredString(item, fieldName));
}
