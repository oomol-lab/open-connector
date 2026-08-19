import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

type WhoisfreaksRequestPhase = "validate" | "execute";
type WhoisfreaksActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface WhoisfreaksRequestInput {
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
}

export const whoisfreaksApiBaseUrl = "https://api.whoisfreaks.com";
const whoisfreaksValidationDomain = "example.com";

export const whoisfreaksActionHandlers: ProviderActionHandlers<"whoisfreaks", WhoisfreaksActionHandler> = {
  async check_domain_availability(input, context) {
    const payload = await whoisfreaksRequest(
      {
        path: "/v1.0/domain/availability",
        query: {
          domain: optionalString(input.domain),
          sug: typeof input.sug === "boolean" ? input.sug : undefined,
          count: typeof input.count === "number" ? input.count : undefined,
        },
      },
      context,
      "execute",
    );

    return {
      availability: Array.isArray(payload.domain_available_response) ? payload.domain_available_response : [],
    };
  },
  async get_domain_whois(input, context) {
    const payload = await whoisfreaksRequest(
      {
        path: "/v2.0/whois/live",
        query: { domainName: optionalString(input.domainName) },
      },
      context,
      "execute",
    );
    return { whois: payload };
  },
  async list_subdomains(input, context) {
    const payload = await whoisfreaksRequest(
      {
        path: "/v1.0/subdomains",
        query: {
          domain: optionalString(input.domain),
          page: typeof input.page === "number" ? input.page : undefined,
          status: optionalString(input.status),
          after: optionalString(input.after),
          before: optionalString(input.before),
        },
      },
      context,
      "execute",
    );

    return {
      domain: optionalString(payload.domain) ?? optionalString(input.domain),
      subdomains: Array.isArray(payload.subdomains) ? payload.subdomains : [],
      pagination: {
        currentPage: readNumber(payload.current_page) ?? readNumber(payload.currentPage) ?? 1,
        totalPages: readNumber(payload.total_pages) ?? readNumber(payload.totalPages) ?? 1,
        totalRecords: readNumber(payload.total_records) ?? readNumber(payload.totalRecords) ?? 0,
      },
    };
  },
  async get_ip_whois(input, context) {
    const payload = await whoisfreaksRequest(
      {
        path: "/v1.0/ip-whois",
        query: { ip: optionalString(input.ip) },
      },
      context,
      "execute",
    );
    return { ipWhois: payload };
  },
  async get_asn_whois(input, context) {
    const payload = await whoisfreaksRequest(
      {
        path: "/v2.0/asn-whois",
        query: { asn: optionalString(input.asn) },
      },
      context,
      "execute",
    );
    return { asnWhois: payload };
  },
};

export async function validateWhoisfreaksCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await whoisfreaksRequest(
    {
      path: "/v1.0/domain/availability",
      query: { domain: whoisfreaksValidationDomain },
    },
    { apiKey, fetcher, signal },
    "validate",
  );

  return {
    profile: {
      accountId: "whoisfreaks",
      displayName: "WhoisFreaks API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: whoisfreaksApiBaseUrl,
      validationFamily: "domain_availability",
      validationDomain: whoisfreaksValidationDomain,
    },
  };
}

async function whoisfreaksRequest(
  input: WhoisfreaksRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: WhoisfreaksRequestPhase,
): Promise<Record<string, unknown>> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(buildWhoisfreaksUrl(input, context.apiKey), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readWhoisfreaksPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      error instanceof Error && error.name === "AbortError" ? 504 : 502,
      error instanceof Error ? `WhoisFreaks request failed: ${error.message}` : "WhoisFreaks request failed",
    );
  }

  if (!response.ok) throw buildWhoisfreaksError(response.status, payload, phase);
  const record = optionalRecord(payload);
  if (!record) throw new ProviderRequestError(502, "WhoisFreaks returned an invalid JSON object", payload);
  return record;
}

function buildWhoisfreaksUrl(input: WhoisfreaksRequestInput, apiKey: string): URL {
  const url = new URL(input.path, whoisfreaksApiBaseUrl);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("format", "json");
  for (const [key, value] of Object.entries(queryParams(input.query ?? {}))) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function readWhoisfreaksPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function buildWhoisfreaksError(status: number, payload: unknown, phase: WhoisfreaksRequestPhase): ProviderRequestError {
  const message = readWhoisfreaksMessage(payload) ?? `WhoisFreaks request failed with ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) return new ProviderRequestError(429, message, payload);
  return new ProviderRequestError(status || 500, message, payload);
}

function readWhoisfreaksMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload) return payload;
  const objectPayload = optionalRecord(payload);
  return (
    optionalString(objectPayload?.error) ??
    optionalString(objectPayload?.message) ??
    optionalString(objectPayload?.error_message)
  );
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
