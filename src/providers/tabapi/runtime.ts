import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent, readProviderJsonBody } from "../provider-runtime.ts";

interface TabapiRequestInput {
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
}

const baseUrl = "https://tabapi.com/api/v1/";

export const tabapiActionHandlers: ProviderActionHandlers<"tabapi", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  get_domain_traffic(input, context) {
    return request(context, {
      path: `domains/${encodeURIComponent(readInput(input, "domain"))}/traffic`,
      query: { months: optionalInteger(input.months) },
    });
  },
  get_domain_whois(input, context) {
    return domainRequest(input, context, "whois");
  },
  get_domain_rdap(input, context) {
    return domainRequest(input, context, "rdap");
  },
  get_dns_records(input, context) {
    return request(context, {
      path: `domains/${encodeURIComponent(readInput(input, "domain"))}/dns`,
      query: { type: optionalString(input.type) },
    });
  },
  get_domain_backlinks(input, context) {
    return domainRequest(input, context, "backlinks");
  },
  google_search(input, context) {
    return request(context, {
      path: "search/google",
      query: {
        q: readInput(input, "q"),
        country: optionalString(input.country),
        language: optionalString(input.language),
        page: optionalInteger(input.page),
      },
    });
  },
  find_adsense_publisher_sites(input, context) {
    return request(context, { path: `publishers/${encodeURIComponent(readInput(input, "pub_id"))}/sites` });
  },
  extract_url_markdown(input, context) {
    return request(context, { path: "markdown", method: "POST", body: { url: readInput(input, "url") } });
  },
  capture_url_screenshot(input, context) {
    return request(context, {
      path: "screenshot",
      method: "POST",
      body: { url: readInput(input, "url"), options: optionalRecord(input.options) },
    });
  },
};

export async function validateTabapiCredential(
  input: { apiKey: string },
  { fetcher, signal }: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const response = await fetcher(new URL("search/google?q=connector-validation&page=0", baseUrl), {
    headers: { accept: "application/json", authorization: `Bearer ${input.apiKey}`, "user-agent": providerUserAgent },
    signal,
  });
  const payload = await readProviderJsonBody(response, {
    emptyBody: {},
    invalidJsonMessage: "TabAPI returned invalid JSON",
  });
  const error = optionalRecord(optionalRecord(payload)?.error);
  const code = optionalString(error?.code) ?? optionalString(optionalRecord(payload)?.code);
  const valid =
    response.ok ||
    (response.status === 400 && code === "invalid_request") ||
    (response.status === 402 && code === "insufficient_credits");
  if (!valid) throw mapError(response.status, payload, "validate");
  return {
    profile: { accountId: "tabapi", displayName: "TabAPI API Key" },
    grantedScopes: [],
    metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/search/google", validationMode: "unbilled_invalid_request" },
  };
}

function domainRequest(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  family: string,
): Promise<unknown> {
  return request(context, { path: `domains/${encodeURIComponent(readInput(input, "domain"))}/${family}` });
}

async function request(context: ApiKeyProviderContext, input: TabapiRequestInput): Promise<unknown> {
  const url = new URL(input.path, baseUrl);
  for (const [key, value] of Object.entries(input.query ?? {}))
    if (value !== undefined) url.searchParams.set(key, String(value));
  const response = await context.fetcher(url, {
    method: input.method ?? "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
    signal: context.signal,
  });
  const payload = await readProviderJsonBody(response, {
    emptyBody: {},
    invalidJsonMessage: "TabAPI returned invalid JSON",
  });
  if (!response.ok) throw mapError(response.status, payload, "execute");
  if (!optionalRecord(payload)) throw new ProviderRequestError(502, "TabAPI returned an invalid JSON object", payload);
  return payload;
}

function mapError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const object = optionalRecord(payload);
  const error = optionalRecord(object?.error);
  const code = optionalString(error?.code) ?? optionalString(object?.code);
  const message =
    optionalString(error?.message) ?? optionalString(object?.message) ?? `TabAPI request failed (${status})`;
  if (status === 402 || code === "insufficient_credits") return new ProviderRequestError(429, message, payload);
  if (status === 401 || status === 403)
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : 400, message, payload);
}

function readInput(input: Record<string, unknown>, fieldName: string): string {
  return requiredString(input[fieldName], fieldName, (message) => new ProviderRequestError(400, message));
}
