import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BidsketchActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const bidsketchApiBaseUrl: string = "https://bidsketch.com/api/v1";
const bidsketchRequestTimeoutMs = 30_000;
const bidsketchValidationPath = "/proposals/stats.json";

type BidsketchPhase = "validate" | "execute";
type BidsketchActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const bidsketchActionHandlers: Record<BidsketchActionName, BidsketchActionHandler> = {
  async list_clients(input, context) {
    const payload = await requestBidsketchJson({
      path: "/clients.json",
      context,
      query: buildPaginationQuery(input),
      phase: "execute",
    });

    return {
      clients: readRecordArray(payload, "BidSketch clients"),
    };
  },
  async get_client(input, context) {
    const clientId = readRequiredPositiveInteger(input.clientId, "clientId");
    const payload = await requestBidsketchJson({
      path: `/clients/${clientId}.json`,
      context,
      phase: "execute",
    });

    return {
      client: normalizeRecord(payload, "BidSketch client"),
    };
  },
  async list_proposals(input, context) {
    const payload = await requestBidsketchJson({
      path: "/proposals.json",
      context,
      query: buildPaginationQuery(input),
      phase: "execute",
    });

    return {
      proposals: readRecordArray(payload, "BidSketch proposals"),
    };
  },
  async list_client_proposals(input, context) {
    const clientId = readRequiredPositiveInteger(input.clientId, "clientId");
    const payload = await requestBidsketchJson({
      path: `/clients/${clientId}/proposals.json`,
      context,
      query: buildPaginationQuery(input),
      phase: "execute",
    });

    return {
      proposals: readRecordArray(payload, "BidSketch client proposals"),
    };
  },
  async get_proposal(input, context) {
    const proposalId = readRequiredPositiveInteger(input.proposalId, "proposalId");
    const payload = await requestBidsketchJson({
      path: `/proposals/${proposalId}.json`,
      context,
      phase: "execute",
    });

    return {
      proposal: normalizeRecord(payload, "BidSketch proposal"),
    };
  },
  async get_proposal_content(input, context) {
    const proposalId = readRequiredPositiveInteger(input.proposalId, "proposalId");
    const payload = await requestBidsketchJson({
      path: `/proposals/${proposalId}/content.json`,
      context,
      phase: "execute",
    });

    return {
      proposal: normalizeRecord(payload, "BidSketch proposal content"),
    };
  },
};

export async function validateBidsketchCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestBidsketchJson({
    path: bidsketchValidationPath,
    context: {
      apiKey,
      fetcher,
      signal,
    },
    phase: "validate",
  });
  const stats = normalizeRecord(payload, "BidSketch proposal stats");
  const proposalTotal =
    typeof stats.total === "number" && Number.isInteger(stats.total) && stats.total >= 0 ? stats.total : undefined;

  return {
    profile: {
      accountId: "bidsketch-api-token",
      displayName: "BidSketch API Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: bidsketchApiBaseUrl,
      validationEndpoint: bidsketchValidationPath,
      proposalTotal,
    }),
  };
}

async function requestBidsketchJson(input: {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: BidsketchPhase;
  query?: Record<string, number | undefined>;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, bidsketchRequestTimeoutMs);

  try {
    const response = await input.context.fetcher(buildBidsketchUrl(input.path, input.query), {
      method: "GET",
      headers: buildBidsketchHeaders(input.context.apiKey),
      signal: timeout.signal,
    });
    const payload = await readBidsketchJson(response);

    if (!response.ok) {
      throw createBidsketchError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error) || isTimeoutLikeError(error)) {
      throw new ProviderRequestError(504, "BidSketch request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `BidSketch request failed: ${error.message}` : "BidSketch request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildPaginationQuery(input: Record<string, unknown>): Record<string, number | undefined> {
  return compactObject({
    page: readOptionalPositiveInteger(input.page, "page"),
    per_page: readOptionalPositiveInteger(input.perPage, "perPage"),
  });
}

function buildBidsketchUrl(path: string, query?: Record<string, number | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${bidsketchApiBaseUrl}/`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url;
}

function buildBidsketchHeaders(apiKey: string): Headers {
  return new Headers({
    accept: "application/json",
    authorization: `Token token="${apiKey}"`,
    "user-agent": providerUserAgent,
  });
}

async function readBidsketchJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "BidSketch returned invalid JSON");
  }
}

function normalizeRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is missing or invalid`);
  }
  return record;
}

function readRecordArray(value: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an array`);
  }

  return value.map((item, index) => normalizeRecord(item, `${label}[${index}]`));
}

function createBidsketchError(status: number, payload: unknown, phase: BidsketchPhase): ProviderRequestError {
  const message = extractBidsketchErrorMessage(payload) ?? `BidSketch request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }

  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractBidsketchErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const topLevelMessage =
    optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.errorMessage);
  if (topLevelMessage) {
    return topLevelMessage;
  }

  if (!Array.isArray(record.errors)) {
    return undefined;
  }

  for (const entry of record.errors) {
    if (typeof entry === "string") {
      const message = optionalString(entry);
      if (message) {
        return message;
      }
    }

    const errorRecord = optionalRecord(entry);
    const nestedMessage =
      optionalString(errorRecord?.message) ?? optionalString(errorRecord?.error) ?? optionalString(errorRecord?.detail);
    if (nestedMessage) {
      return nestedMessage;
    }
  }

  return undefined;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }

  const parsed = optionalInteger(value);
  if (parsed === undefined || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }

  return parsed;
}

function readRequiredPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = readOptionalPositiveInteger(value, fieldName);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function isTimeoutLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}
