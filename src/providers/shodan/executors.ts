import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "shodan";
const shodanApiBaseUrl = "https://api.shodan.io";
const validationEndpoint = "/api-info";

type ShodanPhase = "validate" | "execute";
type ShodanQueryValue = string | number | boolean | undefined;
type ShodanActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface ShodanRequestInput {
  path: string;
  query?: Record<string, ShodanQueryValue>;
}

export const shodanActionHandlers: ProviderActionHandlers<"shodan", ShodanActionHandler> = {
  async get_api_info(_input, context) {
    return normalizeApiInfoPayload(await requestShodanJson({ path: validationEndpoint }, context, "execute"));
  },
  async search_hosts(input, context) {
    const payload = await requestShodanJson(
      {
        path: "/shodan/host/search",
        query: compactObject({
          query: readRequiredString(input.query, "query"),
          facets: readOptionalString(input.facets),
          page: optionalInteger(input.page),
          minify: optionalBoolean(input.minify),
        }),
      },
      context,
      "execute",
    );
    return normalizeSearchPayload(payload);
  },
  async count_search_results(input, context) {
    const payload = await requestShodanJson(
      {
        path: "/shodan/host/count",
        query: compactObject({
          query: readRequiredString(input.query, "query"),
          facets: readOptionalString(input.facets),
        }),
      },
      context,
      "execute",
    );
    return normalizeCountPayload(payload);
  },
  async get_host(input, context) {
    const ip = readRequiredString(input.ip, "ip");
    const payload = await requestShodanJson(
      {
        path: `/shodan/host/${encodeURIComponent(ip)}`,
        query: compactObject({
          history: optionalBoolean(input.history),
          minify: optionalBoolean(input.minify),
        }),
      },
      context,
      "execute",
    );
    return { host: payload };
  },
  async get_domain_info(input, context) {
    const domain = readRequiredString(input.domain, "domain");
    const payload = await requestShodanJson({ path: `/dns/domain/${encodeURIComponent(domain)}` }, context, "execute");
    return normalizeDomainPayload(payload);
  },
  async resolve_hostnames(input, context) {
    const payload = await requestShodanJson(
      {
        path: "/dns/resolve",
        query: { hostnames: joinRequiredStringArray(input.hostnames, "hostnames") },
      },
      context,
      "execute",
    );
    return { results: readStringRecord(payload, "results") };
  },
  async reverse_dns_lookup(input, context) {
    const payload = await requestShodanJson(
      {
        path: "/dns/reverse",
        query: { ips: joinRequiredStringArray(input.ips, "ips") },
      },
      context,
      "execute",
    );
    return { results: readStringArrayRecord(payload, "results") };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, shodanActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiInfo = normalizeApiInfoPayload(
      await requestShodanJson({ path: validationEndpoint }, { apiKey: input.apiKey, fetcher, signal }, "validate"),
    );

    return {
      profile: {
        accountId: "shodan-api-key",
        displayName: "Shodan API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: shodanApiBaseUrl,
        validationEndpoint,
        plan: apiInfo.plan,
        queryCredits: apiInfo.query_credits,
        scanCredits: apiInfo.scan_credits,
        monitoredIps: apiInfo.monitored_ips,
      },
    };
  },
};

async function requestShodanJson(
  input: ShodanRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: ShodanPhase,
): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(context.signal);
  try {
    const response = await context.fetcher(buildShodanUrl(input, context.apiKey), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    if (!response.ok) {
      throw createShodanError(response.status, await readShodanPayload(response, { allowTextFallback: true }), phase);
    }

    const payload = await readShodanPayload(response);
    const payloadObject = optionalRecord(payload);
    if (!payloadObject) {
      throw new ProviderRequestError(502, "Shodan returned an invalid JSON response", payload);
    }
    return payloadObject;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      timeout.didTimeout() || isAbortLikeError(error) ? 504 : 502,
      error instanceof Error ? `Shodan request failed: ${error.message}` : "Shodan request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildShodanUrl(input: ShodanRequestInput, apiKey: string): string {
  const url = new URL(input.path, shodanApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("key", apiKey);
  return url.toString();
}

async function readShodanPayload(response: Response, options: { allowTextFallback?: boolean } = {}): Promise<unknown> {
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
    throw new ProviderRequestError(502, "Shodan returned invalid JSON");
  }
}

function createShodanError(status: number, payload: unknown, phase: ShodanPhase): ProviderRequestError {
  const message = readShodanMessage(payload) ?? `Shodan request failed with ${status || 500}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function readShodanMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return optionalString(record?.error) ?? optionalString(record?.message);
}

function normalizeApiInfoPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    plan: readRequiredString(payload.plan, "plan"),
    https: readOptionalBoolean(payload.https),
    monitored_ips: readRequiredNonNegativeInteger(payload.monitored_ips, "monitored_ips"),
    query_credits: readRequiredNonNegativeInteger(payload.query_credits, "query_credits"),
    scan_credits: readRequiredNonNegativeInteger(payload.scan_credits, "scan_credits"),
    telnet: readOptionalBoolean(payload.telnet),
    unlocked: readOptionalBoolean(payload.unlocked),
    unlocked_left: readOptionalNonNegativeInteger(payload.unlocked_left, "unlocked_left"),
    usage_limits: optionalRecord(payload.usage_limits),
  });
}

function normalizeSearchPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    matches: readObjectArray(payload.matches, "matches"),
    total: readRequiredNonNegativeInteger(payload.total, "total"),
    facets: optionalRecord(payload.facets),
  });
}

function normalizeCountPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    total: readRequiredNonNegativeInteger(payload.total, "total"),
    facets: optionalRecord(payload.facets),
  });
}

function normalizeDomainPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    domain: readRequiredString(payload.domain, "domain"),
    tags: readOptionalStringArray(payload.tags, "tags"),
    data: readOptionalObjectArray(payload.data, "data"),
    subdomains: readOptionalStringArray(payload.subdomains, "subdomains"),
    more: readOptionalBoolean(payload.more) ?? false,
  };
}

function readRequiredString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function readOptionalString(value: unknown): string | undefined {
  return optionalString(value);
}

function joinRequiredStringArray(value: unknown, fieldName: string): string {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }

  const values = value.map((item, index) => {
    const parsed = optionalString(item);
    if (!parsed) {
      throw new ProviderRequestError(400, `${fieldName}[${index}] is required`);
    }
    if (parsed.includes(",")) {
      throw new ProviderRequestError(400, `${fieldName}[${index}] must not contain commas`);
    }
    return parsed;
  });

  return values.join(",");
}

function readRequiredNonNegativeInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ProviderRequestError(502, `Shodan ${fieldName} response is invalid`, value);
  }
  return value;
}

function readOptionalNonNegativeInteger(value: unknown, fieldName: string): number | undefined {
  return value === undefined ? undefined : readRequiredNonNegativeInteger(value, fieldName);
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
    throw new ProviderRequestError(502, `Shodan ${fieldName} response is invalid`, value);
  }
  return value as Array<Record<string, unknown>>;
}

function readOptionalObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  return value === undefined ? [] : readObjectArray(value, fieldName);
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new ProviderRequestError(502, `Shodan ${fieldName} response is invalid`, value);
  }
  return value.map((item) => item.trim());
}

function readStringRecord(value: unknown, fieldName: string): Record<string, string> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Shodan ${fieldName} response is invalid`, value);
  }

  const entries = Object.entries(record).flatMap(([key, child]) => {
    if (child === null) {
      return [];
    }
    if (typeof child !== "string" || child.trim() === "") {
      throw new ProviderRequestError(502, `Shodan ${fieldName} response is invalid`, value);
    }
    return [[key, child.trim()] as const];
  });
  return Object.fromEntries(entries);
}

function readStringArrayRecord(value: unknown, fieldName: string): Record<string, string[]> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Shodan ${fieldName} response is invalid`, value);
  }

  const entries = Object.entries(record).map(([key, child]) => {
    if (!Array.isArray(child) || child.some((item) => typeof item !== "string" || item.trim() === "")) {
      throw new ProviderRequestError(502, `Shodan ${fieldName} response is invalid`, value);
    }
    return [key, child.map((item) => item.trim())] as const;
  });
  return Object.fromEntries(entries);
}
