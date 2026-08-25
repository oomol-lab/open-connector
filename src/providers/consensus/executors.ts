import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "consensus";
const apiBaseUrl = "https://api.consensus.app";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  service,
  {
    async search_papers(input, context) {
      validateRange(input, "year_min", "year_max");
      validateRange(input, "duration_min", "duration_max");
      validateRange(input, "sjr_min", "sjr_max");
      validateMonth(input, "month_min", "year_min");
      validateMonth(input, "month_max", "year_max");
      return parseSearchResponse(await search(input, context, "execute"));
    },
  },
  { skipDnsValidation: true },
);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, context) {
    const response = parseSearchResponse(
      await search({ query: "scientific research", page_size: 1 }, { ...context, apiKey: input.apiKey }, "validate"),
    );
    return {
      profile: { accountId: "consensus", displayName: "Consensus API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl, validationEndpoint: "/v1/search", pageSize: response.page_size },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
  skipDnsValidation: true,
});

async function search(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  phase: "validate" | "execute",
): Promise<unknown> {
  const url = new URL("/v1/search", apiBaseUrl);
  for (const [name, value] of Object.entries(input)) {
    if (value != null) url.searchParams.set(name, Array.isArray(value) ? value.join(",") : String(value));
  }
  const timeout = createProviderTimeout(context.signal, 30_000);
  try {
    const response = await context.fetcher(url, {
      headers: { accept: "application/json", "user-agent": providerUserAgent, "x-api-key": context.apiKey },
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) throw responseError(response.status, payload, phase);
    return payload;
  } finally {
    timeout.cleanup();
  }
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Consensus returned invalid JSON");
  }
}

function parseSearchResponse(payload: unknown): {
  results: unknown[];
  page: number;
  page_size: number;
  is_end: boolean;
  next_page: number | null;
} {
  const response = optionalRecord(payload);
  const page = optionalInteger(response?.page);
  const pageSize = optionalInteger(response?.page_size);
  if (
    !response ||
    !Array.isArray(response.results) ||
    page == null ||
    pageSize == null ||
    typeof response.is_end != "boolean"
  ) {
    throw new ProviderRequestError(502, "Consensus search response did not include valid results and pagination");
  }
  const nextPage = response.next_page == null ? null : optionalInteger(response.next_page);
  if (response.next_page != null && nextPage == null)
    throw new ProviderRequestError(502, "Consensus search response included invalid next_page");
  return { results: response.results, page, page_size: pageSize, is_end: response.is_end, next_page: nextPage ?? null };
}

function responseError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = optionalString(optionalRecord(payload)?.detail) ?? `Consensus request failed with status ${status}`;
  if (status == 429) return new ProviderRequestError(429, message, payload);
  if (phase == "validate" && 400 <= status && status < 500) return new ProviderRequestError(400, message, payload);
  if (status == 401 || status == 403) return new ProviderRequestError(401, message, payload);
  return new ProviderRequestError(status, message, payload);
}

function validateRange(input: Record<string, unknown>, minimumName: string, maximumName: string): void {
  const minimum = optionalInteger(input[minimumName]);
  const maximum = optionalInteger(input[maximumName]);
  if (minimum != null && maximum != null && minimum > maximum)
    throw new ProviderRequestError(400, `${minimumName} must be less than or equal to ${maximumName}`);
}

function validateMonth(input: Record<string, unknown>, monthName: string, yearName: string): void {
  if (input[monthName] != null && input[yearName] == null)
    throw new ProviderRequestError(400, `${monthName} requires ${yearName}`);
}
