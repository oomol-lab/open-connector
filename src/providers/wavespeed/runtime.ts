import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";

import {
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import {
  providerInputError,
  ProviderRequestError,
  runProviderRequest,
  providerResponseError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const wavespeedApiBaseUrl = "https://api.wavespeed.ai";

const balancePath = "/api/v3/balance";
const modelsPath = "/api/v3/models";
const defaultModelLimit = 20;
// A model id is its API path: lower-case segments separated by slashes.
const modelIdPattern = /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)+$/;

type WavespeedActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface WavespeedRequestOptions {
  method?: "GET" | "POST";
  timeoutMs?: number;
  path: string;
  body?: Record<string, unknown>;
  context: ApiKeyProviderContext;
}

export const wavespeedActionHandlers: ProviderActionHandlers<"wavespeed", WavespeedActionHandler> = {
  get_balance(_input, context) {
    return getBalance(context);
  },
  list_models(input, context) {
    return listModels(input, context);
  },
  get_model(input, context) {
    return getModel(input, context);
  },
  run_model(input, context) {
    return runModel(input, context);
  },
  get_prediction(input, context) {
    return getPrediction(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("wavespeed", wavespeedActionHandlers);

export async function validateWavespeedCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await wavespeedRequest({ path: balancePath, context: { apiKey, fetcher, signal } });

  return {
    profile: { accountId: "wavespeed-api-key", displayName: "WaveSpeedAI API Key" },
    metadata: { validationEndpoint: balancePath },
  };
}

async function getBalance(context: ApiKeyProviderContext): Promise<unknown> {
  const data = readDataObject(await wavespeedRequest({ path: balancePath, context }), "balance");
  const balance = optionalNumber(data.balance);
  if (balance === undefined) {
    throw providerResponseError("WaveSpeedAI balance response must include a numeric balance");
  }
  return { balance };
}

async function listModels(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const words = (optionalString(input.query) ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const type = optionalString(input.type)?.toLowerCase();
  const limit = optionalInteger(input.limit) ?? defaultModelLimit;

  const matches = (await fetchModels(context)).filter((model) => {
    if (type && optionalString(model.type)?.toLowerCase() !== type) {
      return false;
    }
    const haystack =
      `${optionalString(model.model_id) ?? ""} ${optionalString(model.name) ?? ""} ${optionalString(model.description) ?? ""}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });

  return { models: matches.slice(0, limit).map(summarizeModel), total: matches.length };
}

async function getModel(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const modelId = readModelId(input.modelId);
  const model = (await fetchModels(context)).find((candidate) => candidate.model_id === modelId);
  if (!model) {
    throw new ProviderRequestError(404, `WaveSpeedAI model ${modelId} was not found`);
  }
  return { model: summarizeModel(model), inputSchema: readInputSchema(model) };
}

async function runModel(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const modelId = readModelId(input.modelId);
  const body = requiredRecord(input.input, "input", providerInputError);
  const data = readDataObject(
    await wavespeedRequest({
      method: "POST",
      path: `/api/v3/${modelId}`,
      body,
      context,
      timeoutMs: body.enable_sync_mode === true ? 120_000 : undefined,
    }),
    "prediction",
  );
  return { prediction: normalizePrediction(data) };
}

async function getPrediction(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const predictionId = encodeURIComponent(requiredString(input.predictionId, "predictionId", providerInputError));
  const data = readDataObject(
    await wavespeedRequest({ path: `/api/v3/predictions/${predictionId}/result`, context }),
    "prediction",
  );
  return { prediction: normalizePrediction(data) };
}

async function fetchModels(context: ApiKeyProviderContext): Promise<Record<string, unknown>[]> {
  const payload = optionalRecord(await wavespeedRequest({ path: modelsPath, context }));
  if (!payload || !Array.isArray(payload.data)) {
    throw providerResponseError("WaveSpeedAI models response must include a data array");
  }
  return payload.data.flatMap((item) => {
    const model = optionalRecord(item);
    return model ? [model] : [];
  });
}

function summarizeModel(model: Record<string, unknown>): Record<string, unknown> {
  return {
    modelId: optionalString(model.model_id) ?? "",
    name: optionalString(model.name) ?? "",
    type: optionalString(model.type) ?? "",
    description: optionalString(model.description) ?? "",
    basePrice: optionalNumber(model.base_price) ?? null,
  };
}

// The catalog nests the request schema as api_schema.api_schemas[].request_schema; the model_run entry is the run input.
function readInputSchema(model: Record<string, unknown>): Record<string, unknown> | null {
  const schemas = optionalRecord(model.api_schema)?.api_schemas;
  if (!Array.isArray(schemas)) {
    return null;
  }
  const entries = schemas.flatMap((item) => {
    const entry = optionalRecord(item);
    return entry ? [entry] : [];
  });
  const run = entries.find((entry) => entry.type === "model_run") ?? entries[0];
  return optionalRecord(run?.request_schema) ?? null;
}

function normalizePrediction(data: Record<string, unknown>): Record<string, unknown> {
  const id = optionalString(data.id);
  if (!id) {
    throw providerResponseError("WaveSpeedAI prediction response must include an id");
  }
  return {
    ...data,
    id,
    status: optionalString(data.status) ?? "",
    outputs: Array.isArray(data.outputs) ? data.outputs : [],
    error: optionalString(data.error) ?? null,
  };
}

function readModelId(value: unknown): string {
  const modelId = requiredString(value, "modelId", providerInputError);
  if (!modelIdPattern.test(modelId)) {
    throw providerInputError(
      "modelId must be a WaveSpeedAI model path such as bytedance/seedream-v5.0-pro or google/veo3.1-fast/text-to-video",
    );
  }
  return modelId;
}

async function wavespeedRequest(options: WavespeedRequestOptions): Promise<unknown> {
  return runProviderRequest(
    { label: "WaveSpeedAI", signal: options.context.signal, timeoutMs: options.timeoutMs },
    async (signal) => {
      const headers = new Headers({
        "accept": "application/json",
        "authorization": `Bearer ${options.context.apiKey}`,
        "user-agent": providerUserAgent,
      });
      const init: RequestInit = {
        method: options.method ?? "GET",
        headers,
        signal,
      };
      if (options.body) {
        headers.set("content-type", "application/json");
        init.body = JSON.stringify(options.body);
      }

      const response = await options.context.fetcher(new URL(options.path, wavespeedApiBaseUrl), init);

      const payload = await readWavespeedResponse(response);
      // The API reports some failures as HTTP 200 with a non-200 code in the JSON envelope.
      const envelopeCode = optionalInteger(optionalRecord(payload)?.code);
      const status = response.ok && envelopeCode !== undefined && envelopeCode !== 200 ? envelopeCode : response.status;
      if (status < 200 || status >= 300) {
        throw mapWavespeedError(status, payload);
      }
      return payload;
    },
  );
}

async function readWavespeedResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function mapWavespeedError(status: number, payload: unknown): ProviderRequestError {
  const message =
    optionalString(optionalRecord(payload)?.message) ?? `WaveSpeedAI request failed with status ${status}`;
  return new ProviderRequestError(
    status >= 400 && status <= 599 ? status : 502,
    message,
    payload,
    status === 401 || status === 403 ? "provider_error" : undefined,
  );
}

function readDataObject(value: unknown, label: string): Record<string, unknown> {
  const data = optionalRecord(optionalRecord(value)?.data);
  if (!data) {
    throw providerResponseError(`WaveSpeedAI ${label} response must include a data object`);
  }
  return data;
}
