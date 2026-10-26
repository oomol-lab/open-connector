import { optionalRecord, optionalString, recordOrEmpty } from "../../core/cast.ts";
import { randomUUIDv7 } from "../../core/uuid-v7.ts";
import {
  ProviderRequestError,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { anyapiOperations } from "./actions.ts";
export const anyapiBaseUrl = "https://api.getanyapi.com";
const operationsByName = new Map(anyapiOperations.map((operation) => [operation.name, operation]));
export async function requestAnyapi(
  path: string,
  apiKey: string,
  fetcher: typeof fetch,
  options: {
    body?: Record<string, unknown>;
    query?: Record<string, unknown>;
    idempotencyKey?: string;
    durable?: boolean;
    signal?: AbortSignal;
  } = {},
): Promise<{
  payload: Record<string, unknown>;
  status: number;
  idempotencyReplayed: boolean | null;
  requestId: string | undefined;
}> {
  return runProviderRequest({ label: "AnyAPI", signal: options.signal }, async (signal) => {
    const url = new URL(path, anyapiBaseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const headers = new Headers({
      accept: "application/json",
      "user-agent": providerUserAgent,
      "X-API-Key": apiKey,
    });
    if (options.body) headers.set("content-type", "application/json");
    if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
    if (options.durable) headers.set("Prefer", "respond-async");
    const response = await fetcher(url, {
      method: options.body ? "POST" : "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal,
    });
    const replayHeader = response.headers.get("Idempotency-Replayed");
    const idempotencyReplayed = replayHeader === "true" ? true : replayHeader === "false" ? false : null;
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      if (response.ok) {
        throw providerResponseError("AnyAPI returned invalid JSON");
      }
    }
    const record = response.ok ? requiredResponseRecord(payload, "AnyAPI response") : recordOrEmpty(payload);
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status,
        optionalString(record.error) ?? `AnyAPI request failed with status ${response.status}`,
        {
          upstreamStatus: response.status,
          upstreamCode: optionalString(record.code),
          requestId: optionalString(record.requestId) ?? response.headers.get("X-Anyapi-Request-Id") ?? undefined,
          payment: optionalRecord(record.payment),
          alternatives: Array.isArray(record.alternatives) ? record.alternatives : undefined,
          idempotencyReplayed,
          retryAfter: response.headers.get("Retry-After") ?? undefined,
          idempotencyKey: options.idempotencyKey,
        },
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    return {
      payload: record,
      status: response.status,
      idempotencyReplayed,
      requestId: response.headers.get("X-Anyapi-Request-Id") ?? undefined,
    };
  });
}
export async function executeAnyapiAction(
  name: string,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  if (name === "get_balance") return (await requestAnyapi("/v1/balance", apiKey, fetcher, { signal })).payload;
  if (name === "get_request")
    return (
      await requestAnyapi(`/v1/requests/${encodeURIComponent(String(input.requestId))}`, apiKey, fetcher, { signal })
    ).payload;
  if (name === "get_result") {
    const { resultId, ...query } = input;
    return (
      await requestAnyapi(`/v1/results/${encodeURIComponent(String(resultId))}`, apiKey, fetcher, {
        query,
        signal,
      })
    ).payload;
  }
  const operation = operationsByName.get(name);
  if (!operation) throw providerInputError(`Unknown AnyAPI action: ${name}`);
  const { requestOptions, ...body } = input;
  const { idempotencyKey: requestedKey, ...query } = optionalRecord(requestOptions) ?? {};
  const idempotencyKey = optionalString(requestedKey) ?? randomUUIDv7();
  try {
    const response = await requestAnyapi(`/v1/run/${operation.sku}`, apiKey, fetcher, {
      body,
      signal,
      query,
      idempotencyKey,
      durable: operation.durable,
    });
    if (operation.durable) {
      if (response.status === 202) {
        if (!optionalString(response.payload.requestId))
          throw providerResponseError("AnyAPI accepted a request without its requestId");
        return {
          ...response.payload,
          idempotencyKey,
          idempotencyReplayed: response.idempotencyReplayed,
        };
      }
      return {
        requestId: response.requestId,
        sku: operation.sku,
        status: "succeeded",
        result: response.payload,
        idempotencyKey,
        idempotencyReplayed: response.idempotencyReplayed,
      };
    }
    return {
      ...response.payload,
      requestId: optionalString(response.payload.requestId) ?? response.requestId,
      idempotencyKey,
      idempotencyReplayed: response.idempotencyReplayed,
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw new ProviderRequestError(
        error.status,
        error.message,
        {
          idempotencyReplayed: null,
          ...optionalRecord(error.details),
          idempotencyKey,
        },
        error.code,
      );
    }
    throw error;
  }
}
