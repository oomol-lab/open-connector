import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const mezmoApiBaseUrl = "https://api.mezmo.com";
const mezmoDefaultTimeoutMs = 30_000;

type MezmoPhase = "validate" | "execute";
type MezmoActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type MezmoActionHandler = (input: Record<string, unknown>, context: MezmoActionContext) => Promise<unknown>;

const usageListPaths: Record<"list_app_usages" | "list_host_usages" | "list_tag_usages", string> = {
  list_app_usages: "/v1/usage/apps",
  list_host_usages: "/v1/usage/hosts",
  list_tag_usages: "/v1/usage/tags",
};

export const mezmoActionHandlers: ProviderActionHandlers<"mezmo", MezmoActionHandler> = {
  get_ingestion_status(_input, context) {
    return requestMezmoIngestionStatus(context, "execute");
  },
  async get_usage_summary(input, context) {
    const payload = await requestMezmoJson({
      path: "/v2/usage",
      params: {
        from: requiredInputString(input.from, "from"),
        to: requiredInputString(input.to, "to"),
      },
      context,
      phase: "execute",
    });

    return {
      usage: normalizeUsageSummary(payload),
    };
  },
  async list_app_usages(input, context) {
    return {
      usages: await requestDimensionUsage("list_app_usages", input, context),
    };
  },
  async list_host_usages(input, context) {
    return {
      usages: await requestDimensionUsage("list_host_usages", input, context),
    };
  },
  async list_tag_usages(input, context) {
    return {
      usages: await requestDimensionUsage("list_tag_usages", input, context),
    };
  },
};

export async function validateMezmoCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = {
    apiKey: requiredInputString(apiKey, "apiKey"),
    fetcher,
    signal,
  };
  const payload = await requestMezmoIngestionStatus(context, "validate");

  return {
    profile: {
      accountId: "mezmo",
      displayName: "Mezmo Access Token",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: mezmoApiBaseUrl,
      validationEndpoint: "/v1/config/ingestion/status",
      isIngesting: payload.isIngesting,
    },
  };
}

async function requestDimensionUsage(
  actionName: keyof typeof usageListPaths,
  input: Record<string, unknown>,
  context: MezmoActionContext,
): Promise<Array<Record<string, unknown>>> {
  const payload = await requestMezmoJson({
    path: usageListPaths[actionName],
    params: {
      from: requiredInputString(input.from, "from"),
      to: requiredInputString(input.to, "to"),
      limit: readOptionalIntegerString(input.limit),
    },
    context,
    phase: "execute",
  });

  return normalizeUsageEntries(payload);
}

async function requestMezmoIngestionStatus(
  context: MezmoActionContext,
  phase: MezmoPhase,
): Promise<{ isIngesting: boolean }> {
  const payload = await requestMezmoJson({
    path: "/v1/config/ingestion/status",
    params: {},
    context,
    phase,
  });
  const record = optionalRecord(payload);
  if (!record || typeof record.isIngesting !== "boolean") {
    throw new ProviderRequestError(502, "Mezmo returned an invalid ingestion status");
  }

  return {
    isIngesting: record.isIngesting,
  };
}

async function requestMezmoJson(input: {
  path: string;
  params: Record<string, string | undefined>;
  context: MezmoActionContext;
  phase: MezmoPhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, mezmoDefaultTimeoutMs);

  try {
    const response = await input.context.fetcher(buildMezmoUrl(input.path, input.params), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Token ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readMezmoPayload(response);

    if (!response.ok) {
      throw createMezmoError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Mezmo request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Mezmo request failed: ${error.message}` : "Mezmo request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildMezmoUrl(path: string, params: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${mezmoApiBaseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readMezmoPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createMezmoError(status: number, payload: unknown, phase: MezmoPhase): ProviderRequestError {
  const message = extractMezmoErrorMessage(payload) ?? `Mezmo request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 502, message, payload);
}

function extractMezmoErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage =
    optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.errorMessage);
  if (directMessage) {
    return directMessage;
  }

  const nestedError = optionalRecord(record.error);
  return optionalString(nestedError?.message);
}

function normalizeUsageSummary(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Mezmo returned an invalid usage summary");
  }

  return optionalRecord(record.data) ?? record;
}

function normalizeUsageEntries(payload: unknown): Array<Record<string, unknown>> {
  const entries = Array.isArray(payload) ? payload : readCandidateUsageList(optionalRecord(payload));
  if (!Array.isArray(entries)) {
    throw new ProviderRequestError(502, "Mezmo returned an invalid usage list");
  }

  return entries.map((entry) => {
    const record = optionalRecord(entry);
    if (!record) {
      throw new ProviderRequestError(502, "Mezmo returned an invalid usage entry");
    }
    return record;
  });
}

function readCandidateUsageList(record: Record<string, unknown> | undefined): unknown[] | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of ["data", "usages", "items", "results", "apps", "hosts", "tags"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return undefined;
}

function readOptionalIntegerString(value: unknown): string | undefined {
  const integer = optionalInteger(value);
  return integer === undefined ? undefined : String(integer);
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}
