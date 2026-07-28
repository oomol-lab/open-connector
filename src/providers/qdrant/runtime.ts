import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalInteger,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, encodePathSegment } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortSignalError,
  parseProviderJsonBodyText,
  ProviderRequestError,
  providerUserAgent,
  readProviderTextBody,
} from "../provider-runtime.ts";
import { qdrantUuidPattern } from "./actions.ts";

const service = "qdrant";
const requestTimeoutMs = 30_000;
const qdrantHostnameSuffix = ".cloud.qdrant.io";

type QdrantRequestPhase = "validate" | "execute";
type QdrantHttpMethod = "GET" | "POST" | "PUT";

export interface QdrantContext {
  clusterUrl: URL;
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export const qdrantActionHandlers: Record<string, ProviderRuntimeHandler<QdrantContext>> = {
  async list_collections(_input, context) {
    const payload = await requestQdrantJson(context, "/collections", "GET", undefined, "execute");
    const result = requireObjectResult(payload, "Qdrant collections response");
    const collections = Array.isArray(result.collections) ? result.collections : [];
    return { collections };
  },

  async get_collection(input, context) {
    const collectionName = readCollectionName(input);
    const payload = await requestQdrantJson(
      context,
      `/collections/${encodePathSegment(collectionName)}`,
      "GET",
      undefined,
      "execute",
    );
    return { collection: requireObjectResult(payload, "Qdrant collection response") };
  },

  async create_collection(input, context) {
    const collectionName = readCollectionName(input);
    const vectorSize = readRequiredPositiveInteger(input.vectorSize, "vectorSize");
    const distance = requiredString(input.distance, "distance", providerInputError);
    if (!isDistance(distance)) {
      throw providerInputError("distance must be Cosine, Euclid, Dot, or Manhattan");
    }
    const payload = await requestQdrantJson(
      context,
      `/collections/${encodePathSegment(collectionName)}`,
      "PUT",
      { vectors: { size: vectorSize, distance } },
      "execute",
    );
    return { created: readBooleanResult(payload, "create collection") };
  },

  async upsert_points(input, context) {
    const collectionName = readCollectionName(input);
    const points = readPoints(input.points);
    const payload = await requestQdrantJson(
      context,
      `/collections/${encodePathSegment(collectionName)}/points?wait=true`,
      "PUT",
      { points },
      "execute",
    );
    const result = requireObjectResult(payload, "Qdrant upsert response");
    return {
      operationId: readNullableInteger(result.operation_id, "operation_id"),
      status: readWriteStatus(result.status),
    };
  },

  async get_point(input, context) {
    const collectionName = readCollectionName(input);
    const id = readPointId(input.id);
    const payload = await requestQdrantJson(
      context,
      `/collections/${encodePathSegment(collectionName)}/points/${encodePathSegment(id)}`,
      "GET",
      undefined,
      "execute",
    );
    const point = requireObjectResult(payload, "Qdrant point response");
    if (!isPointId(point.id)) {
      throw providerResponseError("Qdrant returned an invalid point ID");
    }
    return { point };
  },

  async query_points(input, context) {
    const collectionName = readCollectionName(input);
    const body = {
      query: readVector(input.vector, "vector"),
      filter: optionalRecord(input.filter),
      score_threshold: readOptionalNumber(input.scoreThreshold, "scoreThreshold"),
      limit: readOptionalLimit(input.limit),
      offset: readOptionalNonNegativeInteger(input.offset, "offset"),
      with_payload: input.withPayload,
      with_vector: input.withVector,
    };
    const payload = await requestQdrantJson(
      context,
      `/collections/${encodePathSegment(collectionName)}/points/query`,
      "POST",
      compactObject(body),
      "execute",
    );
    const result = requireObjectResult(payload, "Qdrant query response");
    return { points: readPointRecords(result.points, "query") };
  },

  async scroll_points(input, context) {
    const collectionName = readCollectionName(input);
    const offset = input.offset === undefined ? undefined : readPointId(input.offset);
    const body = {
      offset,
      filter: optionalRecord(input.filter),
      limit: readOptionalLimit(input.limit),
      with_payload: input.withPayload,
      with_vector: input.withVector,
    };
    const payload = await requestQdrantJson(
      context,
      `/collections/${encodePathSegment(collectionName)}/points/scroll`,
      "POST",
      compactObject(body),
      "execute",
    );
    const result = requireObjectResult(payload, "Qdrant scroll response");
    const nextOffset = readNullablePointId(result.next_page_offset);
    return {
      points: readPointRecords(result.points, "scroll"),
      nextOffset,
      complete: nextOffset === null,
    };
  },
};

export function createQdrantContext(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): QdrantContext {
  return {
    clusterUrl: normalizeQdrantClusterUrl(values.clusterUrl),
    apiKey: requiredString(values.apiKey, "apiKey", providerInputError),
    fetcher,
    signal,
  };
}

export async function validateQdrantCredential(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createQdrantContext(values, fetcher, signal);
  const payload = await requestQdrantJson(context, "/collections", "GET", undefined, "validate");
  const result = requireObjectResult(payload, "Qdrant collections response");
  const collections = Array.isArray(result.collections) ? result.collections : [];

  return {
    profile: {
      accountId: `${service}:${context.clusterUrl.hostname}`,
      displayName: `Qdrant Cloud - ${context.clusterUrl.hostname}`,
    },
    grantedScopes: [],
    metadata: {
      clusterUrl: context.clusterUrl.origin,
      validationEndpoint: "/collections",
      collectionCount: collections.length,
    },
  };
}

async function requestQdrantJson(
  context: QdrantContext,
  path: string,
  method: QdrantHttpMethod,
  body: object | undefined,
  phase: QdrantRequestPhase,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);
  try {
    const response = await context.fetcher(new URL(path, `${context.clusterUrl.origin}/`), {
      method,
      headers: {
        accept: "application/json",
        "api-key": context.apiKey,
        "user-agent": providerUserAgent,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: timeout.signal,
    });
    const text = await readProviderTextBody(response, "Qdrant response");
    const payload = parseProviderJsonBodyText(text, {
      emptyBody: response.ok ? undefined : {},
      invalidJsonMessage: "Qdrant returned invalid JSON",
      invalidJsonFallback: response.ok ? undefined : (bodyText) => ({ error: bodyText }),
    });
    if (!response.ok) {
      throw createQdrantError(response.status, payload, phase);
    }
    return readQdrantEnvelope(payload);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Qdrant request timed out", error);
    }
    if (isAbortSignalError(context.signal, error)) {
      throw new ProviderRequestError(499, "Qdrant request was cancelled", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Qdrant request failed: ${error.message}` : "Qdrant request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function normalizeQdrantClusterUrl(value: string | undefined): URL {
  const url = assertPublicHttpUrl(requiredString(value, "clusterUrl", providerInputError), {
    fieldName: "clusterUrl",
    createError: providerInputError,
  });
  if (url.protocol !== "https:") {
    throw providerInputError("clusterUrl must use https");
  }
  if (url.username || url.password) {
    throw providerInputError("clusterUrl must not include credentials");
  }
  if (url.port !== "" && url.port !== "6333") {
    throw providerInputError("clusterUrl must use port 443 or 6333");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw providerInputError("clusterUrl must not include a path, query, or fragment");
  }
  if (!url.hostname.endsWith(qdrantHostnameSuffix) || url.hostname === qdrantHostnameSuffix.slice(1)) {
    throw providerInputError("clusterUrl must use an official cloud.qdrant.io endpoint");
  }
  return url;
}

function readQdrantEnvelope(payload: unknown): unknown {
  const record = optionalRecord(payload);
  if (!record) {
    throw providerResponseError("Qdrant response must be an object");
  }
  const status = optionalRecord(record.status);
  const error = optionalString(status?.error) ?? optionalString(record.error);
  if (error !== undefined) {
    throw providerResponseError(error);
  }
  if (!Object.hasOwn(record, "result")) {
    throw providerResponseError("Qdrant response is missing result");
  }
  return record.result;
}

function createQdrantError(status: number, payload: unknown, phase: QdrantRequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const errorStatus = optionalRecord(record?.status);
  const message =
    optionalString(errorStatus?.error) ??
    optionalString(record?.error) ??
    optionalString(record?.message) ??
    `Qdrant request failed with status ${status}`;
  if ((status === 401 || status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message);
}

function readCollectionName(input: Record<string, unknown>): string {
  const collectionName = optionalRawString(input.collectionName);
  if (collectionName === undefined || collectionName.length === 0) {
    throw providerInputError("collectionName is required");
  }
  if (collectionName === "." || collectionName === "..") {
    throw providerInputError("collectionName must not be . or ..");
  }
  return collectionName;
}

function readPoints(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 1000) {
    throw providerInputError("points must contain between 1 and 1000 points");
  }
  return value.map((point) => {
    const record = optionalRecord(point);
    if (!record) {
      throw providerInputError("each point must be an object");
    }
    const unsupportedFields = Object.keys(record).filter(
      (key) => key !== "id" && key !== "vector" && key !== "payload",
    );
    if (unsupportedFields.length > 0) {
      throw providerInputError(`point contains unsupported fields: ${unsupportedFields.join(", ")}`);
    }
    const payload = record.payload;
    if (payload !== undefined && !optionalRecord(payload)) {
      throw providerInputError("point.payload must be a JSON object");
    }
    return compactObject({
      id: readPointId(record.id),
      vector: readVector(record.vector, "point.vector"),
      payload,
    });
  });
}

function readPointId(value: unknown): number | string {
  if (isPointId(value)) {
    return value;
  }
  throw providerInputError("id must be a non-negative safe integer or UUID");
}

function readNullablePointId(value: unknown): number | string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (isPointId(value)) {
    return value;
  }
  throw providerResponseError("Qdrant returned an invalid next_page_offset");
}

function isPointId(value: unknown): value is number | string {
  return (
    (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) ||
    (typeof value === "string" && uuidPattern.test(value))
  );
}

function readPointRecords(value: unknown, operation: string): unknown[] {
  const points = Array.isArray(value) ? value : [];
  if (points.some((point) => !isPointId(optionalRecord(point)?.id))) {
    throw providerResponseError(`Qdrant returned an invalid ${operation} point ID`);
  }
  return points;
}

function readVector(value: unknown, fieldName: string): number[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((component) => typeof component !== "number" || !Number.isFinite(component))
  ) {
    throw providerInputError(`${fieldName} must be a non-empty numeric array`);
  }
  return value as number[];
}

function readRequiredPositiveInteger(value: unknown, fieldName: string): number {
  const integer = optionalInteger(value);
  if (integer === undefined || integer < 1) {
    throw providerInputError(`${fieldName} must be a positive integer`);
  }
  return integer;
}

function readOptionalLimit(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const limit = readRequiredPositiveInteger(value, "limit");
  if (limit > 1000) throw providerInputError("limit must be between 1 and 1000");
  return limit;
}

function readOptionalNonNegativeInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) return undefined;
  const integer = optionalInteger(value);
  if (integer === undefined || integer < 0) throw providerInputError(`${fieldName} must be non-negative`);
  return integer;
}

function readOptionalNumber(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw providerInputError(`${fieldName} must be a number`);
  return value;
}

function readNullableInteger(value: unknown, fieldName: string): number | null {
  if (value === null || value === undefined) return null;
  const integer = optionalInteger(value);
  if (integer === undefined || !Number.isSafeInteger(integer) || integer < 0) {
    throw providerResponseError(`Qdrant returned an invalid ${fieldName}`);
  }
  return integer;
}

function readBooleanResult(payload: unknown, operation: string): boolean {
  if (typeof payload !== "boolean") throw providerResponseError(`Qdrant returned an invalid ${operation} result`);
  return payload;
}

function readWriteStatus(value: unknown): "acknowledged" | "completed" | "wait_timeout" {
  if (value === "acknowledged" || value === "completed" || value === "wait_timeout") return value;
  throw providerResponseError("Qdrant returned an invalid write status");
}

function requireObjectResult(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) throw providerResponseError(`${label} must be an object`);
  return record;
}

function isDistance(value: string): value is "Cosine" | "Euclid" | "Dot" | "Manhattan" {
  return value === "Cosine" || value === "Euclid" || value === "Dot" || value === "Manhattan";
}

const uuidPattern = new RegExp(qdrantUuidPattern);

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
