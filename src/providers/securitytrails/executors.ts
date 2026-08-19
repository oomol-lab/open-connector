import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "securitytrails";
const securitytrailsApiBaseUrl = "https://api.securitytrails.com";

type QueryValue = string | number | boolean | undefined;
type SecuritytrailsRequestPhase = "validate" | "execute";
type SecuritytrailsActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface SecuritytrailsRequestInput {
  path: string;
  query?: Record<string, QueryValue>;
}

export const securitytrailsActionHandlers: ProviderActionHandlers<"securitytrails", SecuritytrailsActionHandler> = {
  async get_domain(input, context): Promise<unknown> {
    const hostname = readRequiredHostname(input);
    const payload = await securitytrailsRequest(
      context.apiKey,
      {
        path: `/v1/domain/${encodeURIComponent(hostname)}`,
      },
      context,
      "execute",
    );

    return { domain: payload };
  },
  async get_subdomains(input, context): Promise<unknown> {
    const hostname = readRequiredHostname(input);
    const payload = await securitytrailsRequest(
      context.apiKey,
      {
        path: `/v1/domain/${encodeURIComponent(hostname)}/subdomains`,
      },
      context,
      "execute",
    );

    return {
      hostname,
      subdomains: readRequiredStringArray(payload.subdomains, "subdomains"),
      recordTypeCounts: readRequiredNumberRecord(
        payload.record_type_count ?? payload.recordTypeCounts,
        "record_type_count",
      ),
    };
  },
  async find_associated_domains(input, context): Promise<unknown> {
    const hostname = readRequiredHostname(input);
    const payload = await securitytrailsRequest(
      context.apiKey,
      {
        path: `/v1/domain/${encodeURIComponent(hostname)}/associated`,
        query: {
          page: optionalInteger(input.page),
        },
      },
      context,
      "execute",
    );

    return {
      hostname,
      records: readRequiredObjectArray(payload.records, "records"),
    };
  },
  async get_domain_ssl(input, context): Promise<unknown> {
    const hostname = readRequiredHostname(input);
    const payload = await securitytrailsRequest(
      context.apiKey,
      {
        path: `/v1/domain/${encodeURIComponent(hostname)}/ssl`,
      },
      context,
      "execute",
    );

    return {
      hostname,
      ssl: payload,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, securitytrailsActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    await securitytrailsRequest(
      input.apiKey,
      {
        path: "/v1/ping",
      },
      { fetcher, signal },
      "validate",
    );

    return {
      profile: {
        displayName: "SecurityTrails API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: securitytrailsApiBaseUrl,
        validationEndpoint: "/v1/ping",
      },
    };
  },
};

async function securitytrailsRequest(
  apiKey: string,
  input: SecuritytrailsRequestInput,
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">,
  phase: SecuritytrailsRequestPhase,
): Promise<Record<string, unknown>> {
  const response = await securitytrailsRawRequest(apiKey, input, context);
  const payload = await readSecuritytrailsPayload(response);

  if (!response.ok) {
    throw buildSecuritytrailsError(response.status, payload, phase);
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "SecurityTrails returned an invalid JSON response");
  }

  return record;
}

async function securitytrailsRawRequest(
  apiKey: string,
  input: SecuritytrailsRequestInput,
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">,
): Promise<Response> {
  const url = new URL(input.path, securitytrailsApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    return await context.fetcher(url, {
      method: "GET",
      headers: {
        APIKEY: apiKey,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `SecurityTrails request failed: ${error.message}` : "SecurityTrails request failed",
    );
  }
}

async function readSecuritytrailsPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "SecurityTrails returned an invalid JSON response");
  }
}

function buildSecuritytrailsError(
  status: number,
  payload: unknown,
  phase: SecuritytrailsRequestPhase,
): ProviderRequestError {
  const message = readSecuritytrailsMessage(payload) ?? `SecurityTrails request failed with ${status || 500}`;
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function readSecuritytrailsMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
}

function readRequiredHostname(input: Record<string, unknown>): string {
  const hostname = optionalString(input.hostname);
  if (!hostname) {
    throw new ProviderRequestError(400, "hostname is required");
  }
  if (hostname.includes("://") || hostname.includes("/")) {
    throw new ProviderRequestError(400, "hostname must not include a URL scheme or path segments");
  }
  return hostname;
}

function readRequiredObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `SecurityTrails ${fieldName} response is invalid`);
  }

  return value.map((item) => {
    const record = optionalRecord(item);
    if (!record) {
      throw new ProviderRequestError(502, `SecurityTrails ${fieldName} response is invalid`);
    }
    return record;
  });
}

function readRequiredStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `SecurityTrails ${fieldName} response is invalid`);
  }

  return value.map((item) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw new ProviderRequestError(502, `SecurityTrails ${fieldName} response is invalid`);
    }
    return item;
  });
}

function readRequiredNumberRecord(value: unknown, fieldName: string): Record<string, number> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `SecurityTrails ${fieldName} response is invalid`);
  }

  for (const entryValue of Object.values(record)) {
    if (typeof entryValue !== "number" || !Number.isFinite(entryValue)) {
      throw new ProviderRequestError(502, `SecurityTrails ${fieldName} response is invalid`);
    }
  }

  return record as Record<string, number>;
}
