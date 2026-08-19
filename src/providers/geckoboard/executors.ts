import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { compactJson, jsonObject } from "../../core/request.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "geckoboard";
const geckoboardApiBaseUrl = "https://api.geckoboard.com";
const geckoboardDefaultRequestTimeoutMs = 30_000;

type GeckoboardPhase = "validate" | "execute";
type GeckoboardActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type GeckoboardActionHandler = (input: Record<string, unknown>, context: GeckoboardActionContext) => Promise<unknown>;

export const geckoboardActionHandlers: ProviderActionHandlers<"geckoboard", GeckoboardActionHandler> = {
  async find_or_create_dataset(input, context) {
    const datasetId = readInputString(input.datasetId, "datasetId");
    const payload = await requestGeckoboardJson({
      path: `/datasets/${encodeURIComponent(datasetId)}`,
      method: "PUT",
      body: jsonObject({
        fields: input.fields,
        unique_by: input.uniqueBy,
      }),
      context,
      phase: "execute",
    });

    return {
      dataset: normalizeDatasetPayload(payload),
    };
  },

  append_dataset_data(input, context) {
    const datasetId = readInputString(input.datasetId, "datasetId");
    return requestGeckoboardJson({
      path: `/datasets/${encodeURIComponent(datasetId)}/data`,
      method: "POST",
      body: jsonObject({
        data: input.records,
        delete_by: input.deleteBy,
      }),
      context,
      phase: "execute",
    });
  },

  replace_dataset_data(input, context) {
    const datasetId = readInputString(input.datasetId, "datasetId");
    return requestGeckoboardJson({
      path: `/datasets/${encodeURIComponent(datasetId)}/data`,
      method: "PUT",
      body: {
        data: input.records,
      },
      context,
      phase: "execute",
    });
  },

  delete_dataset(input, context) {
    const datasetId = readInputString(input.datasetId, "datasetId");
    return requestGeckoboardJson({
      path: `/datasets/${encodeURIComponent(datasetId)}`,
      method: "DELETE",
      context,
      phase: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, geckoboardActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestGeckoboardJson({
      path: "/",
      method: "GET",
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });

    return {
      profile: {
        accountId: "geckoboard-api-key",
        displayName: "Geckoboard API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: geckoboardApiBaseUrl,
        validationEndpoint: "/",
      },
    };
  },
};

async function requestGeckoboardJson(input: {
  path: string;
  method: "DELETE" | "GET" | "POST" | "PUT";
  body?: Record<string, unknown>;
  context: GeckoboardActionContext;
  phase: GeckoboardPhase;
}): Promise<Record<string, unknown>> {
  const timeoutSignal = AbortSignal.timeout(geckoboardDefaultRequestTimeoutMs);
  const signal = input.context.signal ? AbortSignal.any([input.context.signal, timeoutSignal]) : timeoutSignal;

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(new URL(input.path, geckoboardApiBaseUrl), {
      method: input.method,
      headers: geckoboardHeaders(input.context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(compactJson(input.body)),
      signal,
    });
    payload = await readGeckoboardPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutSignal.aborted && !input.context.signal?.aborted && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Geckoboard request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Geckoboard request failed: ${error.message}` : "Geckoboard request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createGeckoboardError(response.status, payload, input.phase);
  }

  if (payload === null) {
    return {};
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Geckoboard returned an invalid payload", payload);
  }

  return record;
}

function geckoboardHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readGeckoboardPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Geckoboard returned invalid JSON", text);
  }
}

function createGeckoboardError(status: number, payload: unknown, phase: GeckoboardPhase): ProviderRequestError {
  const message = extractGeckoboardErrorMessage(payload) ?? `Geckoboard request failed with status ${status}`;

  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }

  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(502, message, payload);
}

function extractGeckoboardErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const errors = Array.isArray(record.errors) ? record.errors : undefined;
  const firstError = errors ? optionalRecord(errors[0]) : undefined;
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.error_message) ??
    optionalString(firstError?.message) ??
    optionalString(firstError?.detail)
  );
}

function normalizeDatasetPayload(payload: unknown): Record<string, unknown> {
  const record = readResponseObject(payload, "Geckoboard dataset response");
  return {
    id: readResponseString(record.id, "id"),
    fields: readResponseObject(record.fields, "fields"),
    unique_by: normalizeOptionalStringArray(record.unique_by),
    raw: record,
  };
}

function normalizeOptionalStringArray(value: unknown): string[] | null {
  if (value == null || !Array.isArray(value)) {
    return null;
  }

  return value.map((item) => String(item));
}

function readInputString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function readResponseString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `Geckoboard response is missing ${fieldName}`);
  }
  return parsed;
}

function readResponseObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Geckoboard response is missing ${fieldName}`, value);
  }
  return record;
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
