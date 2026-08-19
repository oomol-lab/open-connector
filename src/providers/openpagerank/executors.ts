import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "openpagerank";
const openPageRankApiBaseUrl = "https://openpagerank.com/api/v1.0";
const openPageRankLookupPath = "/getPageRank";
const openPageRankValidationDomain = "google.com";

type OpenPageRankRequestPhase = "validate" | "execute";
type OpenPageRankActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const openPageRankActionHandlers: ProviderActionHandlers<"openpagerank", OpenPageRankActionHandler> = {
  async get_page_rank(input, context) {
    const payload = await openPageRankGetJson(readDomains(input.domains), context, "execute");
    return normalizeOpenPageRankPayload(payload);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, openPageRankActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await openPageRankGetJson(
      [openPageRankValidationDomain],
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );

    return {
      profile: {
        displayName: "OpenPageRank API Key",
        grantedScopes: [],
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: openPageRankApiBaseUrl,
        validationEndpoint: openPageRankLookupPath,
        validatedDomain: openPageRankValidationDomain,
      },
    };
  },
};

function readDomains(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "domains must be an array");
  }

  return value.map((item) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw new ProviderRequestError(400, "domains must contain non-empty strings");
    }
    return item.trim();
  });
}

async function openPageRankGetJson(
  domains: string[],
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: OpenPageRankRequestPhase,
): Promise<unknown> {
  const url = new URL(`${openPageRankApiBaseUrl}${openPageRankLookupPath}`);
  domains.forEach((domain, index) => {
    url.searchParams.set(`domains[${index}]`, domain);
  });

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        "API-OPR": context.apiKey,
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `OpenPageRank request failed: ${error.message}` : "OpenPageRank request failed",
    );
  }

  const payload = await readOpenPageRankPayload(response);
  const payloadError = readOpenPageRankPayloadError(payload);
  if (!response.ok || payloadError) {
    throw createOpenPageRankError(response.status, payloadError, payload, phase);
  }

  return payload;
}

async function readOpenPageRankPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "OpenPageRank returned invalid JSON");
  }
}

function readOpenPageRankPayloadError(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record || record.status !== false) {
    return undefined;
  }

  return optionalString(record.error) ?? optionalString(record.message) ?? "OpenPageRank request failed";
}

function createOpenPageRankError(
  status: number,
  payloadError: string | undefined,
  payload: unknown,
  phase: OpenPageRankRequestPhase,
): ProviderRequestError {
  const message = payloadError ?? extractOpenPageRankErrorMessage(payload) ?? "OpenPageRank request failed";

  if (status === 429 || message.toLowerCase().includes("rate limit")) {
    return new ProviderRequestError(429, message, payload);
  }

  if (isOpenPageRankAuthError(status, message)) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }

  return new ProviderRequestError(status >= 400 && status < 500 ? 400 : 502, message, payload);
}

function isOpenPageRankAuthError(status: number, message: string): boolean {
  const normalizedMessage = message.toLowerCase();
  return (
    status === 401 ||
    status === 403 ||
    normalizedMessage.includes("invalid api key") ||
    normalizedMessage.includes("api key")
  );
}

function extractOpenPageRankErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.error) ?? optionalString(record.message);
}

function normalizeOpenPageRankPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "OpenPageRank returned empty or non-object payload");
  }

  const response = record.response;
  if (!Array.isArray(response)) {
    throw new ProviderRequestError(502, "OpenPageRank response missing response array");
  }

  return compactObject({
    statusCode: readRequiredInteger(record.status_code, "status_code"),
    results: response.map((item) => normalizeOpenPageRankResult(readRequiredObject(item, "response item"))),
  });
}

function normalizeOpenPageRankResult(record: Record<string, unknown>): Record<string, unknown> {
  return {
    domain: readRequiredString(record.domain, "domain"),
    statusCode: readRequiredInteger(record.status_code, "status_code"),
    error: optionalString(record.error) ?? "",
    pageRankInteger: readRequiredInteger(record.page_rank_integer, "page_rank_integer"),
    pageRankDecimal: readRequiredNumber(record.page_rank_decimal, "page_rank_decimal"),
    rank: record.rank === null ? null : readRequiredString(record.rank, "rank"),
  };
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `OpenPageRank response missing object field: ${fieldName}`);
  }
  return record;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value === "") {
    throw new ProviderRequestError(502, `OpenPageRank response missing string field: ${fieldName}`);
  }
  return value;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  const parsed = optionalNumber(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `OpenPageRank response missing numeric field: ${fieldName}`);
  }
  return parsed;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const parsed = readRequiredNumber(value, fieldName);
  if (!Number.isInteger(parsed)) {
    throw new ProviderRequestError(502, `OpenPageRank response missing integer field: ${fieldName}`);
  }
  return parsed;
}
