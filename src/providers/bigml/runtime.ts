import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";

export interface BigmlContext {
  apiKey: string;
  username: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface BigmlStatus {
  code: number;
  message: string | null;
  progress: number | null;
}

export const bigmlApiBaseUrl = "https://bigml.io/andromeda";
export const bigmlActionHandlers: ProviderActionHandlers<"bigml", ProviderRuntimeHandler<BigmlContext>> = {
  async list_models(input, context) {
    const payload = await request("/model", "GET", buildListQuery(input), undefined, context, "execute");
    const result = normalizeList(payload, "model");
    return {
      models: result.objects.map((item, index) => normalizeModel(object(item, `models[${index}]`))),
      pagination: result.pagination,
    };
  },
  async get_model(input, context) {
    const resource = normalizeResource(input.modelId, "model", "modelId");
    const payload = object(
      await request(
        `/${resource}`,
        "GET",
        compactObject({ limit: optionalInteger(input.fieldLimit), offset: optionalInteger(input.fieldOffset) }),
        undefined,
        context,
        "execute",
      ),
      "model",
    );
    return {
      model: {
        ...normalizeModel(payload),
        objectiveField: nullableString(payload.objective_field),
        objectiveFieldName: nullableString(payload.objective_field_name),
        inputFields: stringArray(payload.input_fields),
        fields: optionalRecord(payload.fields) ?? {},
        fieldPagination: normalizeFieldPagination(payload.fields_meta),
      },
    };
  },
  async create_prediction(input, context) {
    const inputData = optionalRecord(input.inputData);
    if (!inputData) throw new ProviderRequestError(400, "inputData must be an object");
    const payload = object(
      await request(
        "/prediction",
        "POST",
        undefined,
        compactObject({
          model: normalizeResource(input.modelId, "model", "modelId"),
          input_data: inputData,
          name: trimmed(input.name),
          description: optionalString(input.description),
          project: input.project === undefined ? undefined : normalizeResource(input.project, "project", "project"),
          tags: trimmedArray(input.tags),
          missing_strategy: optionalInteger(input.missingStrategy),
          operating_kind: trimmed(input.operatingKind),
          explain: optionalBoolean(input.explain),
        }),
        context,
        "execute",
      ),
      "prediction",
    );
    return { prediction: normalizePrediction(payload) };
  },
  async get_prediction(input, context) {
    const resource = normalizeResource(input.predictionId, "prediction", "predictionId");
    return {
      prediction: normalizePrediction(
        object(await request(`/${resource}`, "GET", undefined, undefined, context, "execute"), "prediction"),
      ),
    };
  },
  async list_predictions(input, context) {
    const payload = await request("/prediction", "GET", buildListQuery(input), undefined, context, "execute");
    const result = normalizeList(payload, "prediction");
    return {
      predictions: result.objects.map((item, index) => normalizePrediction(object(item, `predictions[${index}]`))),
      pagination: result.pagination,
    };
  },
  async delete_prediction(input, context) {
    const resource = normalizeResource(input.predictionId, "prediction", "predictionId");
    await request(`/${resource}`, "DELETE", undefined, undefined, context, "execute");
    return { deleted: true, resource };
  },
};
export async function validateBigmlCredential(
  apiKey: string,
  usernameInput: unknown,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const username = inputString(usernameInput, "username");
  await request("/model", "GET", { limit: 1 }, undefined, { apiKey, username, fetcher, signal }, "validate");
  return {
    profile: { accountId: `bigml:${username}`, displayName: `BigML ${username}` },
    grantedScopes: [],
    metadata: { username, apiBaseUrl: bigmlApiBaseUrl, validationEndpoint: "/model" },
  };
}
async function request(
  path: string,
  method: "GET" | "POST" | "DELETE",
  query: Record<string, unknown> | undefined,
  body: unknown,
  context: BigmlContext,
  phase: "validate" | "execute",
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal);
  try {
    const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${bigmlApiBaseUrl}/`);
    url.searchParams.set("username", context.username);
    url.searchParams.set("api_key", context.apiKey);
    for (const [key, value] of Object.entries(query ?? {}))
      if (value !== undefined) url.searchParams.set(key, String(value));
    const response = await context.fetcher(url, {
      method,
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "BigML returned invalid JSON",
    });
    if (!response.ok) {
      const record = optionalRecord(payload);
      const error = optionalRecord(record?.error);
      const status = optionalRecord(record?.status);
      const message =
        trimmed(error?.message) ??
        trimmed(record?.message) ??
        trimmed(status?.message) ??
        `BigML request failed with HTTP ${response.status}`;
      throw new ProviderRequestError(
        phase === "validate" && response.status < 500 ? 400 : response.status,
        message,
        payload,
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) throw new ProviderRequestError(504, "BigML request timed out");
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `BigML request failed: ${error.message}` : "BigML request failed",
    );
  } finally {
    timeout.cleanup();
  }
}
function buildListQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    limit: optionalInteger(input.limit),
    offset: optionalInteger(input.offset),
    order_by: trimmed(input.orderBy),
    project: input.project === undefined ? undefined : normalizeResource(input.project, "project", "project"),
    name__icontains: trimmed(input.nameContains),
  });
}
function normalizeList(payload: unknown, name: string): { objects: unknown[]; pagination: Record<string, unknown> } {
  const record = object(payload, `${name} list`);
  if (!Array.isArray(record.objects))
    throw new ProviderRequestError(502, `BigML ${name} list response did not include objects`);
  const meta = object(record.meta, `${name} list meta`);
  const totalCount = nonNegative(meta.total_count, "meta.total_count");
  const limit = positive(meta.limit, "meta.limit");
  const offset = nonNegative(meta.offset, "meta.offset");
  return {
    objects: record.objects,
    pagination: {
      totalCount,
      limit,
      offset,
      nextOffset: trimmed(meta.next) ? offset + limit : null,
      previousOffset: trimmed(meta.previous) ? Math.max(0, offset - limit) : null,
    },
  };
}
function normalizeModel(payload: Record<string, unknown>): Record<string, unknown> {
  const status = normalizeStatus(payload.status);
  return {
    resource: resourceString(payload.resource, "model", "model.resource"),
    name: nullableString(payload.name),
    created: nullableString(payload.created),
    updated: nullableString(payload.updated),
    project: nullableString(payload.project),
    state: normalizeState(status.code),
    status,
  };
}
function normalizePrediction(payload: Record<string, unknown>): Record<string, unknown> {
  const status = normalizeStatus(payload.status);
  const output = payload.output;
  if (output != null && typeof output !== "string" && typeof output !== "number")
    throw new ProviderRequestError(502, "BigML prediction output was not scalar");
  return {
    resource: resourceString(payload.resource, "prediction", "prediction.resource"),
    name: nullableString(payload.name),
    created: nullableString(payload.created),
    updated: nullableString(payload.updated),
    model: nullableString(payload.model),
    project: nullableString(payload.project),
    inputData: optionalRecord(payload.input_data) ?? {},
    output: output ?? null,
    prediction: optionalRecord(payload.prediction) ?? {},
    confidence: optionalNumber(payload.confidence) ?? null,
    objectiveFieldName: nullableString(payload.objective_field_name),
    state: normalizeState(status.code),
    status,
  };
}
function normalizeStatus(value: unknown): BigmlStatus {
  const status = object(value, "status");
  const code = optionalInteger(status.code);
  if (code === undefined) throw new ProviderRequestError(502, "BigML status did not include an integer code");
  return { code, message: nullableString(status.message), progress: optionalNumber(status.progress) ?? null };
}
function normalizeState(code: number): string {
  if (code === 0) return "waiting";
  if (code === 1) return "queued";
  if (code === 2) return "started";
  if (code === 3) return "in_progress";
  if (code === 4) return "summarized";
  if (code === 5) return "finished";
  if (code === -1) return "faulty";
  return "unknown";
}
function normalizeFieldPagination(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  const meta = object(value, "fields_meta");
  return {
    count: nullableNonNegative(meta.count, "fields_meta.count"),
    limit: nullableNonNegative(meta.limit, "fields_meta.limit"),
    offset: nullableNonNegative(meta.offset, "fields_meta.offset"),
    total: nullableNonNegative(meta.total, "fields_meta.total"),
  };
}
function normalizeResource(value: unknown, kind: "model" | "prediction" | "project", field: string): string {
  const resource = inputString(value, field);
  const parts = resource.split("/");
  if (parts.length === 1) return `${kind}/${safeId(parts[0]!, field)}`;
  if (parts.length === 2 && parts[0] === kind) return `${kind}/${safeId(parts[1]!, field)}`;
  throw new ProviderRequestError(400, `${field} must be ${kind}/ID or a bare ID`);
}
function safeId(value: string, field: string): string {
  if (!value || value === "." || value === ".." || encodeURIComponent(value) !== value)
    throw new ProviderRequestError(400, `${field} contains invalid URL path characters`);
  return value;
}
function resourceString(value: unknown, kind: string, field: string): string {
  const text = trimmed(value);
  if (!text?.startsWith(`${kind}/`)) throw new ProviderRequestError(502, `BigML ${field} was invalid`);
  return text;
}
function object(value: unknown, field: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `BigML ${field} must be an object`);
  return record;
}
function nonNegative(value: unknown, field: string): number {
  const number = optionalInteger(value);
  if (number === undefined || number < 0) throw new ProviderRequestError(502, `BigML ${field} must be non-negative`);
  return number;
}
function positive(value: unknown, field: string): number {
  const number = nonNegative(value, field);
  if (number === 0) throw new ProviderRequestError(502, `BigML ${field} must be positive`);
  return number;
}
function nullableNonNegative(value: unknown, field: string): number | null {
  return value == null ? null : nonNegative(value, field);
}
function trimmed(value: unknown): string | undefined {
  return optionalString(value)?.trim() || undefined;
}
function inputString(value: unknown, field: string): string {
  return requiredString(value, field, (message) => new ProviderRequestError(400, message)).trim();
}
function nullableString(value: unknown): string | null {
  return optionalString(value) ?? null;
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
function trimmedArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ProviderRequestError(400, "tags must be an array");
  return value.map((item) => inputString(item, "tag"));
}
