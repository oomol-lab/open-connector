import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalRawString,
  optionalRecord,
  requiredRecord,
  requiredStringArray,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, readProviderJsonBody } from "../provider-runtime.ts";

export const honeyhiveApiBaseUrl = "https://api.honeyhive.ai";
export const honeyhiveValidationPath = "/v1/datasets";

type HoneyhiveRequestMode = "validate" | "execute";
interface HoneyhiveRequestOptions extends ApiKeyProviderContext {
  path: string;
  mode: HoneyhiveRequestMode;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | undefined>;
  body?: unknown;
}

export const honeyhiveActionHandlers: ProviderActionHandlers<
  "honeyhive",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async list_datasets(input, context) {
    const payload = await requestHoneyhiveJson({
      ...context,
      path: "/v1/datasets",
      mode: "execute",
      query: {
        dataset_id: optionalRawString(input.datasetId),
        name: optionalRawString(input.name),
      },
    });
    return parseDatasetList(payload);
  },
  async create_dataset(input, context) {
    const payload = await requestHoneyhiveJson({
      ...context,
      path: "/v1/datasets",
      mode: "execute",
      method: "POST",
      body: compactObject({
        name: optionalRawString(input.name),
        description: optionalRawString(input.description),
        datapoints: readOptionalStringArray(input.datapoints, "datapoints"),
      }),
    });
    return parseCreateDataset(payload);
  },
  async update_dataset(input, context) {
    const payload = await requestHoneyhiveJson({
      ...context,
      path: `/v1/datasets/${encodeURIComponent(requiredHoneyhiveId(input.datasetId, "datasetId"))}`,
      mode: "execute",
      method: "PUT",
      body: compactObject({
        name: optionalRawString(input.name),
        description: optionalRawString(input.description),
        datapoints: readOptionalStringArray(input.datapoints, "datapoints"),
      }),
    });
    return parseUpdateDataset(payload);
  },
  async delete_dataset(input, context) {
    const payload = await requestHoneyhiveJson({
      ...context,
      path: `/v1/datasets/${encodeURIComponent(requiredHoneyhiveId(input.datasetId, "datasetId"))}`,
      mode: "execute",
      method: "DELETE",
    });
    return parseDeleteDataset(payload);
  },
  async add_datapoints(input, context) {
    const mapping = requiredRecord(input.mapping, "mapping", providerInputError);
    const payload = await requestHoneyhiveJson({
      ...context,
      path: `/v1/datasets/${encodeURIComponent(requiredHoneyhiveId(input.datasetId, "datasetId"))}/datapoints`,
      mode: "execute",
      method: "POST",
      body: {
        data: input.data,
        mapping: compactObject({
          inputs: readOptionalStringArray(mapping.inputs, "mapping.inputs"),
          history: readOptionalStringArray(mapping.history, "mapping.history"),
          ground_truth: readOptionalStringArray(mapping.groundTruth, "mapping.groundTruth"),
        }),
      },
    });
    return parseAddDatapoints(payload);
  },
  async remove_datapoint(input, context) {
    const datasetId = encodeURIComponent(requiredHoneyhiveId(input.datasetId, "datasetId"));
    const datapointId = encodeURIComponent(requiredHoneyhiveId(input.datapointId, "datapointId"));
    const payload = await requestHoneyhiveJson({
      ...context,
      path: `/v1/datasets/${datasetId}/datapoints/${datapointId}`,
      mode: "execute",
      method: "DELETE",
    });
    return parseRemoveDatapoint(payload);
  },
};

export async function validateHoneyhiveCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestHoneyhiveJson({
    path: honeyhiveValidationPath,
    apiKey,
    fetcher,
    signal,
    mode: "validate",
  });

  return {
    profile: {
      displayName: "HoneyHive Project",
      grantedScopes: [],
    },
    metadata: {
      apiBaseUrl: honeyhiveApiBaseUrl,
      validationEndpoint: honeyhiveValidationPath,
      validationMode: "datasets_probe",
    },
  };
}

async function requestHoneyhiveJson(options: HoneyhiveRequestOptions): Promise<unknown> {
  const url = new URL(options.path, `${honeyhiveApiBaseUrl}/`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${options.apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  try {
    response = await options.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `HoneyHive request failed: ${error.message}` : "HoneyHive request failed",
      error,
    );
  }

  const payload = await readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "HoneyHive returned malformed JSON",
    invalidJsonFallback: (text) => text,
  });

  if (!response.ok) {
    throw mapHoneyhiveError(response.status, payload, options.mode);
  }

  return payload;
}

function parseDatasetList(payload: unknown): Record<string, unknown> {
  const response = requireHoneyhiveObject(payload, "list_datasets response");
  return {
    datasets: requireHoneyhiveArray(response.datasets, "list_datasets.datasets").map((dataset, index) =>
      parseDataset(dataset, `list_datasets.datasets[${index}]`),
    ),
  };
}

function parseCreateDataset(payload: unknown): Record<string, unknown> {
  const response = requireHoneyhiveObject(payload, "create_dataset response");
  const result = requireHoneyhiveObject(response.result, "create_dataset.result");
  return {
    inserted: requireHoneyhiveBoolean(response.inserted, "create_dataset.inserted"),
    result: {
      insertedId: requireHoneyhiveId(result.insertedId, "create_dataset.result.insertedId"),
    },
  };
}

function parseUpdateDataset(payload: unknown): Record<string, unknown> {
  const response = requireHoneyhiveObject(payload, "update_dataset response");
  return {
    result: parseDataset(response.result, "update_dataset.result"),
  };
}

function parseDeleteDataset(payload: unknown): Record<string, unknown> {
  const response = requireHoneyhiveObject(payload, "delete_dataset response");
  const result = requireHoneyhiveObject(response.result, "delete_dataset.result");
  return {
    result: {
      id: requireHoneyhiveId(result.id, "delete_dataset.result.id"),
    },
  };
}

function parseAddDatapoints(payload: unknown): Record<string, unknown> {
  const response = requireHoneyhiveObject(payload, "add_datapoints response");
  return {
    inserted: requireHoneyhiveBoolean(response.inserted, "add_datapoints.inserted"),
    datapoint_ids: requireHoneyhiveIds(response.datapoint_ids, "add_datapoints.datapoint_ids"),
  };
}

function parseRemoveDatapoint(payload: unknown): Record<string, unknown> {
  const response = requireHoneyhiveObject(payload, "remove_datapoint response");
  return {
    dereferenced: requireHoneyhiveBoolean(response.dereferenced, "remove_datapoint.dereferenced"),
    message: requireHoneyhiveString(response.message, "remove_datapoint.message"),
  };
}

function parseDataset(value: unknown, fieldName: string): Record<string, unknown> {
  const dataset = requireHoneyhiveObject(value, fieldName);
  const output: Record<string, unknown> = {
    ...dataset,
    id: requireHoneyhiveId(dataset.id, `${fieldName}.id`),
    name: requireHoneyhiveString(dataset.name, `${fieldName}.name`),
    datapoints: requireHoneyhiveIds(dataset.datapoints, `${fieldName}.datapoints`),
  };
  if (dataset.description !== undefined) {
    output.description = requireHoneyhiveNullableString(dataset.description, `${fieldName}.description`);
  }
  if (dataset.created_at !== undefined) {
    output.created_at = requireHoneyhiveString(dataset.created_at, `${fieldName}.created_at`);
  }
  if (dataset.updated_at !== undefined) {
    output.updated_at = requireHoneyhiveString(dataset.updated_at, `${fieldName}.updated_at`);
  }
  return output;
}

function requireHoneyhiveObject(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(value, fieldName, providerOutputError);
}

function requireHoneyhiveArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw providerOutputError(`${fieldName} must be an array`);
  }
  return value;
}

function requireHoneyhiveString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw providerOutputError(`${fieldName} must be a string`);
  }
  return value;
}

function requireHoneyhiveNullableString(value: unknown, fieldName: string): string | null {
  return value === null ? null : requireHoneyhiveString(value, fieldName);
}

function requireHoneyhiveId(value: unknown, fieldName: string): string {
  const id = requireHoneyhiveString(value, fieldName);
  if (id.length === 0) {
    throw providerOutputError(`${fieldName} must be a non-empty string`);
  }
  return id;
}

function requireHoneyhiveIds(value: unknown, fieldName: string): string[] {
  return requireHoneyhiveArray(value, fieldName).map((item, index) =>
    requireHoneyhiveId(item, `${fieldName}[${index}]`),
  );
}

function requireHoneyhiveBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw providerOutputError(`${fieldName} must be a boolean`);
  }
  return value;
}

function providerOutputError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `HoneyHive returned an invalid response: ${message}`);
}

function mapHoneyhiveError(status: number, payload: unknown, mode: HoneyhiveRequestMode): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `HoneyHive API request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return mode === "validate"
      ? new ProviderRequestError(400, message, payload)
      : new ProviderRequestError(401, message, payload);
  }
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  for (const key of ["detail", "message", "error"]) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    const nested = optionalRecord(value);
    if (typeof nested?.message === "string" && nested.message.trim()) {
      return nested.message;
    }
  }
  return undefined;
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  return value === undefined ? undefined : requiredStringArray(value, fieldName, providerInputError);
}

function requiredHoneyhiveId(value: unknown, fieldName: string): string {
  const id = optionalRawString(value);
  if (id === undefined || id.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return id;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
