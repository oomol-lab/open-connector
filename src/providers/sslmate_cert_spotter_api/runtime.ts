import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, runProviderRequest } from "../provider-runtime.ts";

export const certSpotterMonitoringApiBaseUrl: string = "https://sslmate.com/api/v3/monitoring";
export const certSpotterCtSearchApiBaseUrl: string = "https://api.certspotter.com/v1";

type CertSpotterRequestPhase = "validate" | "execute";
type CertSpotterActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const certSpotterActionHandlers: ProviderActionHandlers<"sslmate_cert_spotter_api", CertSpotterActionHandler> = {
  list_certificate_issuances(input, context) {
    return executeListCertificateIssuances(input, context);
  },
  list_monitored_domains(_input, context) {
    return executeListMonitoredDomains(context);
  },
  get_monitored_domain(input, context) {
    return executeGetMonitoredDomain(input, context);
  },
  upsert_monitored_domain(input, context) {
    return executeUpsertMonitoredDomain(input, context);
  },
  delete_monitored_domain(input, context) {
    return executeDeleteMonitoredDomain(input, context);
  },
};

export async function validateCertSpotterCredential(
  context: ApiKeyProviderContext,
): Promise<CredentialValidationResult> {
  const { payload } = await requestCertSpotterJson({
    context,
    url: buildMonitoredDomainsUrl(),
    method: "GET",
    phase: "validate",
  });
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Cert Spotter monitored domains response is invalid");
  }
  return {
    profile: {
      accountId: "api_key",
      displayName: "SSLMate API Key",
    },
    grantedScopes: [],
    metadata: {
      monitoringApiBaseUrl: certSpotterMonitoringApiBaseUrl,
      ctSearchApiBaseUrl: certSpotterCtSearchApiBaseUrl,
      validationEndpoint: "/monitored_domains",
      monitoredDomainCount: payload.length,
    },
  };
}

async function executeListCertificateIssuances(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  validateCtSearchDomain(readInputString(input.domain, "domain"));
  const expand = Array.isArray(input.expand) ? input.expand.map((item) => readInputString(item, "expand")) : undefined;
  const { payload, response } = await requestCertSpotterJson({
    context,
    url: buildCtSearchIssuancesUrl({
      domain: readInputString(input.domain, "domain"),
      after: optionalString(input.after),
      include_subdomains: typeof input.include_subdomains === "boolean" ? input.include_subdomains : undefined,
      match_wildcards: typeof input.match_wildcards === "boolean" ? input.match_wildcards : undefined,
      expand,
    }),
    method: "GET",
    phase: "execute",
  });
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Cert Spotter issuances response is invalid");
  }
  return compactObject({
    issuances: payload,
    retryAfterSeconds: parseRetryAfterSeconds(response.headers.get("Retry-After")),
  });
}

async function executeListMonitoredDomains(context: ApiKeyProviderContext): Promise<unknown> {
  const { payload } = await requestCertSpotterJson({
    context,
    url: buildMonitoredDomainsUrl(),
    method: "GET",
    phase: "execute",
  });
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Cert Spotter monitored domains response is invalid");
  }
  return { domains: payload };
}

async function executeGetMonitoredDomain(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const name = readInputString(input.name, "name");
  validateMonitoredDomainName(name);
  const { payload } = await requestCertSpotterJson({
    context,
    url: buildMonitoredDomainsUrl(name),
    method: "GET",
    phase: "execute",
  });
  const domain = optionalRecord(payload);
  if (!domain) {
    throw new ProviderRequestError(502, "Cert Spotter monitored domain response is invalid");
  }
  return { domain };
}

async function executeUpsertMonitoredDomain(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const name = readInputString(input.name, "name");
  validateMonitoredDomainName(name);
  const { payload } = await requestCertSpotterJson({
    context,
    url: buildMonitoredDomainsUrl(name),
    method: "POST",
    body: JSON.stringify(compactObject({ enabled: typeof input.enabled === "boolean" ? input.enabled : undefined })),
    phase: "execute",
  });
  const domain = optionalRecord(payload);
  if (!domain) {
    throw new ProviderRequestError(502, "Cert Spotter monitored domain response is invalid");
  }
  return { domain };
}

async function executeDeleteMonitoredDomain(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const name = readInputString(input.name, "name");
  validateMonitoredDomainName(name);
  await requestCertSpotterJson({
    context,
    url: buildMonitoredDomainsUrl(name),
    method: "DELETE",
    phase: "execute",
  });
  return { deleted: true };
}

function buildCtSearchIssuancesUrl(input: {
  domain: string;
  after?: string;
  include_subdomains?: boolean;
  match_wildcards?: boolean;
  expand?: string[];
}): URL {
  const url = new URL("issuances", `${certSpotterCtSearchApiBaseUrl}/`);
  url.searchParams.set("domain", input.domain);
  if (input.after) url.searchParams.set("after", input.after);
  if (input.include_subdomains !== undefined)
    url.searchParams.set("include_subdomains", String(input.include_subdomains));
  if (input.match_wildcards !== undefined) url.searchParams.set("match_wildcards", String(input.match_wildcards));
  for (const field of input.expand ?? []) {
    url.searchParams.append("expand", field);
  }
  return url;
}

function buildMonitoredDomainsUrl(name?: string): URL {
  if (!name) {
    return new URL("monitored_domains", `${certSpotterMonitoringApiBaseUrl}/`);
  }
  return new URL(`monitored_domains/${encodeURIComponent(name)}`, `${certSpotterMonitoringApiBaseUrl}/`);
}

async function requestCertSpotterJson(input: {
  context: ApiKeyProviderContext;
  url: URL;
  method: "GET" | "POST" | "DELETE";
  body?: string;
  phase: CertSpotterRequestPhase;
}): Promise<{ response: Response; payload: unknown }> {
  return runProviderRequest({ signal: input.context.signal, label: "Cert Spotter" }, async (signal) => {
    const response = await input.context.fetcher(input.url, {
      method: input.method,
      headers: buildCertSpotterHeaders(input.context.apiKey, input.body ? "application/json" : undefined),
      body: input.body,
      signal,
    });
    const payload = await readCertSpotterPayload(response);
    if (!response.ok) {
      throw createCertSpotterError(response, payload, input.phase);
    }
    return { response, payload };
  });
}

function buildCertSpotterHeaders(apiKey: string, contentType?: string): Headers {
  const headers = new Headers({
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  });
  if (contentType) {
    headers.set("content-type", contentType);
  }
  return headers;
}

async function readCertSpotterPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Cert Spotter returned invalid JSON");
  }
}

function createCertSpotterError(
  response: Response,
  payload: unknown,
  phase: CertSpotterRequestPhase,
): ProviderRequestError {
  const message =
    extractCertSpotterErrorMessage(payload) ?? `Cert Spotter request failed with status ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && response.status === 404) {
    return new ProviderRequestError(404, message, payload);
  }
  if (phase === "execute" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function extractCertSpotterErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.code);
}

function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function readInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function validateCtSearchDomain(value: string): void {
  validateDomainName(value, false);
}

function validateMonitoredDomainName(value: string): void {
  validateDomainName(value, true);
}

function validateDomainName(value: string, allowLeadingDot: boolean): void {
  if (value.includes("://")) {
    throw new ProviderRequestError(400, "Domain must not include a URL scheme.");
  }
  if (value.includes("/")) {
    throw new ProviderRequestError(400, "Domain must not include path segments.");
  }
  const candidate = allowLeadingDot && value.startsWith(".") ? value.slice(1) : value;
  const labels = candidate.split(".");
  if (!candidate || labels.length < 2) {
    throw new ProviderRequestError(400, "Domain must include at least one dot-separated suffix.");
  }
  if (candidate.length > 253) {
    throw new ProviderRequestError(400, "Domain must not exceed 253 characters.");
  }
  for (const label of labels) {
    if (!label) {
      throw new ProviderRequestError(400, "Domain must not contain empty labels.");
    }
    if (label.length > 63) {
      throw new ProviderRequestError(400, "Domain labels must not exceed 63 characters.");
    }
    if (label.startsWith("-") || label.endsWith("-")) {
      throw new ProviderRequestError(400, "Domain labels must not start or end with a hyphen.");
    }
    if (!/^[A-Za-z0-9-]+$/.test(label)) {
      throw new ProviderRequestError(400, "Domain labels may only contain letters, digits, and hyphens.");
    }
  }
}
