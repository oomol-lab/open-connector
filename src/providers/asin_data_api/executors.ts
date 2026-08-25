import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
  stringArray,
} from "../../core/cast.ts";
import {
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
  setSearchParams,
} from "../provider-runtime.ts";

const service = "asin_data_api";
const asinDataApiBaseUrl = "https://api.asindataapi.com";

type AsinDataApiRequestPhase = "validate" | "execute";
type AsinDataApiRequestMethod = "GET" | "PUT" | "DELETE";
type AsinDataApiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const updateDestinationFieldNames = [
  "name",
  "enabled",
  "oss_region_id",
  "gcs_access_key",
  "gcs_secret_key",
  "oss_access_key",
  "oss_secret_key",
  "s3_bucket_name",
  "s3_path_prefix",
  "gcs_bucket_name",
  "gcs_path_prefix",
  "oss_bucket_name",
  "oss_path_prefix",
  "s3_access_key_id",
  "azure_account_key",
  "azure_path_prefix",
  "azure_account_name",
  "azure_container_name",
  "s3_secret_access_key",
];

export const asinDataApiActionHandlers: ProviderActionHandlers<"asin_data_api", AsinDataApiActionHandler> = {
  async clear_collection_requests(input, context) {
    const collectionId = requiredString(input.collection_id, "collection_id", invalidInputError);
    const requestIds = stringArray(input.request_ids, "request_ids", invalidInputError).map((requestId, index) =>
      requiredString(requestId, `request_ids[${index}]`, invalidInputError),
    );
    const deletedRequests = [];
    const failedRequestIds = [];

    for (const requestId of requestIds) {
      const payload = await requestAsinDataApiJson({
        path: `/collections/${encodeURIComponent(collectionId)}/${encodeURIComponent(requestId)}`,
        method: "DELETE",
        context,
        phase: "execute",
      });
      deletedRequests.push({
        request_id: requestId,
        response: payload,
      });
      if (!isAsinDataApiPayloadSuccessful(payload)) {
        failedRequestIds.push(requestId);
      }
    }

    return compactObject({
      data: {
        collection_id: collectionId,
        deleted_count: deletedRequests.length - failedRequestIds.length,
        deleted_requests: deletedRequests,
      },
      error: failedRequestIds.length > 0 ? `Failed to delete request IDs: ${failedRequestIds.join(", ")}` : undefined,
      successful: failedRequestIds.length === 0,
    });
  },

  async delete_destination(input, context) {
    const payload = await requestAsinDataApiJson({
      path: `/destinations/${encodeURIComponent(requiredString(input.destination_id, "destination_id", invalidInputError))}`,
      method: "DELETE",
      context,
      phase: "execute",
    });

    return wrapAsinDataApiPayload(payload);
  },

  async get_collection(input, context) {
    const payload = await requestAsinDataApiJson({
      path: `/collections/${encodeURIComponent(requiredString(input.collection_id, "collection_id", invalidInputError))}`,
      method: "GET",
      context,
      phase: "execute",
    });

    return wrapAsinDataApiPayload(payload);
  },

  async list_collection_requests(input, context) {
    const collectionId = requiredString(input.collection_id, "collection_id", invalidInputError);
    const page = optionalInteger(input.page) ?? 1;
    const payload = await requestAsinDataApiJson({
      path: `/collections/${encodeURIComponent(collectionId)}/requests/${encodeURIComponent(String(page))}`,
      method: "GET",
      context,
      phase: "execute",
    });

    return wrapAsinDataApiPayload(payload);
  },

  async list_destinations(input, context) {
    const payload = await requestAsinDataApiJson({
      path: "/destinations",
      method: "GET",
      context,
      params: compactStringObject({
        page: optionalStringValue(input.page),
        sort_by: optionalString(input.sort_by),
        search_term: optionalString(input.search_term),
        sort_direction: optionalString(input.sort_direction),
      }),
      phase: "execute",
    });

    return wrapAsinDataApiPayload(payload);
  },

  async update_destination(input, context) {
    const payload = await requestAsinDataApiJson({
      path: `/destinations/${encodeURIComponent(requiredString(input.destination_id, "destination_id", invalidInputError))}`,
      method: "PUT",
      context,
      body: pickUpdateDestinationBody(input),
      phase: "execute",
    });

    return wrapAsinDataApiPayload(payload);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ApiKeyProviderContext>({
  service,
  handlers: asinDataApiActionHandlers,
  async createContext(context, fetcher): Promise<ApiKeyProviderContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
      transitFiles: context.transitFiles,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestAsinDataApiJson({
      path: "/account",
      method: "GET",
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });
    if (!isAsinDataApiPayloadSuccessful(payload)) {
      throw new ProviderRequestError(
        400,
        extractAsinDataApiMessage(payload) ?? "ASIN Data API credential validation failed",
      );
    }

    const accountInfo = optionalRecord(payload.account_info);
    return {
      profile: {
        displayName: optionalString(accountInfo?.email) ?? optionalString(accountInfo?.name) ?? "ASIN Data API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: asinDataApiBaseUrl,
        validationEndpoint: "/account",
        plan: optionalString(accountInfo?.plan),
        monthlyCreditsRemaining:
          typeof accountInfo?.monthly_credits_remaining === "number"
            ? accountInfo.monthly_credits_remaining
            : undefined,
        collectionsAvailable:
          typeof accountInfo?.collections_available === "number" ? accountInfo.collections_available : undefined,
        destinationsAvailable:
          typeof accountInfo?.destinations_available === "number" ? accountInfo.destinations_available : undefined,
      }),
    };
  },
};

async function requestAsinDataApiJson(input: {
  path: string;
  method: AsinDataApiRequestMethod;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: AsinDataApiRequestPhase;
  params?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  let response: Response;
  let payload: unknown;

  try {
    response = await input.context.fetcher(buildAsinDataApiUrl(input.path, input.context.apiKey, input.params), {
      method: input.method,
      headers: compactHeaders({
        accept: "application/json",
        "content-type": input.body ? "application/json" : undefined,
        "user-agent": providerUserAgent,
      }),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
    payload = await readAsinDataApiPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    throw new ProviderRequestError(
      isAbortError(error) ? 504 : 502,
      error instanceof Error ? `ASIN Data API request failed: ${error.message}` : "ASIN Data API request failed",
    );
  }

  if (!response.ok) {
    throw createAsinDataApiError(response, payload, input.phase);
  }

  return normalizePayloadObject(payload);
}

function buildAsinDataApiUrl(path: string, apiKey: string, params: Record<string, string | undefined> = {}): URL {
  const url = new URL(path, asinDataApiBaseUrl);
  setSearchParams(url, {
    api_key: apiKey,
    ...params,
  });
  return url;
}

async function readAsinDataApiPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function normalizePayloadObject(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (record) {
    return record;
  }

  if (typeof payload === "string") {
    return {
      message: payload,
    };
  }

  return {};
}

function wrapAsinDataApiPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const requestInfo = optionalRecord(payload.request_info);
  const successful = requestInfo?.success !== false;
  const error = successful ? undefined : extractAsinDataApiMessage(payload);

  return compactObject({
    data: payload,
    error,
    successful,
  });
}

function createAsinDataApiError(
  response: Response,
  payload: unknown,
  phase: AsinDataApiRequestPhase,
): ProviderRequestError {
  const message = extractAsinDataApiMessage(payload) ?? `ASIN Data API request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (phase === "execute" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function isAsinDataApiPayloadSuccessful(payload: Record<string, unknown>): boolean {
  return optionalRecord(payload.request_info)?.success !== false;
}

function extractAsinDataApiMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(optionalRecord(record.request_info)?.message) ??
    optionalString(record.message) ??
    optionalString(record.error)
  );
}

function optionalStringValue(value: unknown): string | undefined {
  if (value == null || value === "") {
    return undefined;
  }

  return String(value);
}

function pickUpdateDestinationBody(input: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const fieldName of updateDestinationFieldNames) {
    if (input[fieldName] !== undefined) {
      body[fieldName] = input[fieldName];
    }
  }

  if (Object.keys(body).length === 0) {
    throw new ProviderRequestError(400, "at least one destination field is required");
  }

  return body;
}

function compactStringObject(input: Record<string, string | undefined>): Record<string, string> {
  return compactObject(input) as Record<string, string>;
}

function compactHeaders(input: Record<string, string | undefined>): Headers {
  return new Headers(compactObject(input) as Record<string, string>);
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
