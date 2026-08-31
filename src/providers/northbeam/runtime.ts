import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalInteger,
  optionalObjectArray,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const northbeamApiBaseUrl = "https://api.northbeam.io/v1";

type NorthbeamPhase = "validate" | "execute";
type NorthbeamActionHandler = ProviderRuntimeHandler<NorthbeamContext>;

export interface NorthbeamContext {
  apiKey: string;
  clientId: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface NorthbeamRequestOptions {
  context: NorthbeamContext;
  path: string;
  params?: Record<string, unknown>;
  phase: NorthbeamPhase;
}

export const northbeamActionHandlers: ProviderActionHandlers<"northbeam", NorthbeamActionHandler> = {
  async list_metrics(_input, context) {
    const payload = await requestNorthbeamJson({
      context,
      path: "/exports/metrics",
      phase: "execute",
    });
    return { metrics: optionalObjectArray(payload.metrics) };
  },
  async list_attribution_models(_input, context) {
    const payload = await requestNorthbeamJson({
      context,
      path: "/exports/attribution-models",
      phase: "execute",
    });
    return { attribution_models: optionalObjectArray(payload.attribution_models) };
  },
  async list_breakdowns(_input, context) {
    const payload = await requestNorthbeamJson({
      context,
      path: "/exports/breakdowns",
      phase: "execute",
    });
    return { breakdowns: normalizeBreakdowns(payload.breakdowns) };
  },
  list_spend(input, context) {
    return listSpend(input, context, "/spend");
  },
  list_hourly_spend(input, context) {
    return listSpend(input, context, "/spend_hourly");
  },
};

export function resolveNorthbeamCredentialContext(
  apiKey: string,
  values: Record<string, string>,
  metadata: Record<string, unknown> | undefined,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): NorthbeamContext {
  return {
    apiKey: requiredString(apiKey, "apiKey", providerInputError),
    clientId: readClientId(values, metadata),
    fetcher,
    signal,
  };
}

export async function validateNorthbeamCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = resolveNorthbeamCredentialContext(apiKey, values, undefined, fetcher, signal);
  const payload = await requestNorthbeamJson({
    context,
    path: "/exports/metrics",
    phase: "validate",
  });
  const metrics = optionalObjectArray(payload.metrics);

  return {
    profile: {
      accountId: context.clientId,
      displayName: `Northbeam ${context.clientId}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      clientId: context.clientId,
      metricCount: metrics.length,
      validationEndpoint: "/exports/metrics",
      apiBaseUrl: northbeamApiBaseUrl,
    }),
  };
}

async function listSpend(input: Record<string, unknown>, context: NorthbeamContext, path: string): Promise<unknown> {
  const payload = await requestNorthbeamJson({
    context,
    path,
    params: input,
    phase: "execute",
  });

  return {
    records: optionalObjectArray(payload.data),
    page: readRequiredInteger(payload.page, "page"),
    page_size: readRequiredInteger(payload.page_size, "page_size"),
    total_pages: readRequiredInteger(payload.total_pages, "total_pages"),
    total_count: readRequiredInteger(payload.total_count, "total_count"),
  };
}

async function requestNorthbeamJson(options: NorthbeamRequestOptions): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(options.context.signal);
  try {
    let response: Response;
    try {
      response = await options.context.fetcher(buildNorthbeamUrl(options.path, options.params), {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: options.context.apiKey,
          "data-client-id": options.context.clientId,
          "user-agent": providerUserAgent,
        },
        signal: timeout.signal,
      });
    } catch (error) {
      const message =
        timeout.didTimeout() || isAbortLikeError(error)
          ? "Northbeam request timed out"
          : error instanceof Error
            ? `Northbeam request failed: ${error.message}`
            : "Northbeam request failed";
      throw new ProviderRequestError(timeout.didTimeout() || isAbortLikeError(error) ? 504 : 502, message);
    }

    const payload = await readNorthbeamJson(response);
    if (!response.ok) {
      throw mapNorthbeamError(response.status, payload, options.phase);
    }

    const payloadRecord = optionalRecord(payload);
    if (!payloadRecord) {
      throw new ProviderRequestError(502, "Northbeam returned invalid JSON");
    }
    return payloadRecord;
  } finally {
    timeout.cleanup();
  }
}

function buildNorthbeamUrl(path: string, params: Record<string, unknown> | undefined): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${northbeamApiBaseUrl}/`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function readNorthbeamJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Northbeam returned invalid JSON");
  }
}

function mapNorthbeamError(status: number, payload: unknown, phase: NorthbeamPhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Northbeam request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message);
  }

  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 500, message);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message = optionalString(record.message) ?? optionalString(record.error);
  if (message) {
    return message;
  }

  const errors = Array.isArray(record.errors) ? record.errors : [];
  const firstError = optionalRecord(errors[0]);
  return optionalString(firstError?.msg);
}

function readClientId(values: Record<string, string>, metadata?: Record<string, unknown>): string {
  const value = optionalString(values.clientId) ?? optionalString(metadata?.clientId);
  if (!value) {
    throw new ProviderRequestError(400, "Northbeam Data-Client-ID is required");
  }
  return value;
}

function normalizeBreakdowns(value: unknown): Array<{ key: string; values: string[] }> {
  return optionalObjectArray(value).map((item) => ({
    key: optionalString(item.key) ?? "",
    values: Array.isArray(item.values) ? item.values.filter((entry): entry is string => typeof entry === "string") : [],
  }));
}

function readRequiredInteger(value: unknown, field: string): number {
  const result = optionalInteger(value);
  if (result !== undefined) {
    return result;
  }
  throw new ProviderRequestError(502, `Northbeam returned an invalid ${field}`);
}
