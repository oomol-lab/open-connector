import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  readTransitFileInput,
} from "../provider-runtime.ts";

const service = "platerecognizer";
const apiBaseUrl = "https://api.platerecognizer.com";
const plateReaderPath = "/v1/plate-reader/";
const statisticsPath = "/v1/statistics/";

type PlateRecognizerPhase = "validate" | "execute";
type PlateRecognizerActionHandler = (
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
) => Promise<unknown>;

export const platerecognizerActionHandlers: ProviderActionHandlers<"platerecognizer", PlateRecognizerActionHandler> = {
  async read_number_plates(input, context) {
    return normalizePlateReaderPayload(
      await requestPlateRecognizerJson({
        context,
        method: "POST",
        path: plateReaderPath,
        phase: "execute",
        body: await buildPlateReaderFormData(input, context),
      }),
    );
  },
  async get_statistics(_input, context) {
    return normalizeStatisticsPayload(
      await requestPlateRecognizerJson({ context, method: "GET", path: statisticsPath, phase: "execute" }),
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, platerecognizerActionHandlers);

export async function validatePlaterecognizerCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const stats = normalizeStatisticsPayload(
    await requestPlateRecognizerJson({
      context: { apiKey, fetcher },
      method: "GET",
      path: statisticsPath,
      phase: "validate",
    }),
  );

  return {
    profile: { accountId: "platerecognizer-api-token", displayName: "Plate Recognizer API Token", grantedScopes: [] },
    metadata: compactObject({
      apiBaseUrl,
      validationEndpoint: statisticsPath,
      usageCalls: stats.usage.calls,
      totalCalls: stats.totalCalls,
    }),
  };
}

async function requestPlateRecognizerJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  method: "GET" | "POST";
  path: string;
  phase: PlateRecognizerPhase;
  body?: FormData;
}): Promise<unknown> {
  let response: Response;
  try {
    response = await input.context.fetcher(new URL(input.path, apiBaseUrl), {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Token ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      body: input.body,
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Plate Recognizer request failed: ${error.message}` : "Plate Recognizer request failed",
    );
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    throw createPlateRecognizerError(response.status, payload, input.phase);
  }
  if (!optionalRecord(payload)) {
    throw new ProviderRequestError(502, "Plate Recognizer returned invalid JSON", payload);
  }
  return payload;
}

async function buildPlateReaderFormData(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<FormData> {
  const uploadUrl = optionalString(input.uploadUrl);
  const uploadBase64 = optionalString(input.uploadBase64);
  const hasFile = optionalRecord(input.file) !== undefined;
  const sourceCount = Number(uploadUrl !== undefined) + Number(uploadBase64 !== undefined) + Number(hasFile);
  if (sourceCount !== 1) {
    throw new ProviderRequestError(400, "Exactly one of uploadUrl, uploadBase64, or file is required.");
  }
  if (input.direction === true && input.mmc !== true) {
    throw new ProviderRequestError(400, "direction requires mmc=true.");
  }
  const config = optionalRecord(input.config);
  if (config?.detection_mode === "vehicle") {
    throw new ProviderRequestError(400, "config.detection_mode=vehicle is not supported.");
  }

  const formData = new FormData();
  if (uploadUrl) {
    formData.set("upload_url", uploadUrl);
  }
  if (uploadBase64) {
    formData.set("upload", uploadBase64);
  }
  if (hasFile) {
    const transitFile = await readTransitFileInput(input.file, context);
    formData.set("upload", transitFile.file);
  }
  if (Array.isArray(input.regions)) {
    for (const region of input.regions) {
      const value = optionalString(region);
      if (value) {
        formData.append("regions", value);
      }
    }
  }
  appendString(formData, "camera_id", optionalString(input.cameraId));
  appendString(formData, "timestamp", optionalString(input.timestamp));
  appendBoolean(formData, "mmc", input.mmc);
  appendBoolean(formData, "direction", input.direction);
  if (config) {
    formData.set("config", JSON.stringify(config));
  }
  return formData;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createPlateRecognizerError(
  status: number,
  payload: unknown,
  phase: PlateRecognizerPhase,
): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Plate Recognizer request failed with HTTP ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if ((status === 401 || status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 400 || status === 413) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function normalizePlateReaderPayload(payload: unknown): Record<string, unknown> {
  const record = requiredRecord(payload, "Plate Recognizer plate-reader response", providerResponseError);
  const processingTime = optionalNumber(record.processing_time);
  if (processingTime === undefined) {
    throw new ProviderRequestError(502, "Plate Recognizer response missing processing_time", payload);
  }
  const results = record.results;
  if (!Array.isArray(results)) {
    throw new ProviderRequestError(502, "Plate Recognizer response missing results", payload);
  }
  return {
    processingTime,
    filename: optionalString(record.filename) ?? null,
    cameraId: optionalString(record.camera_id) ?? null,
    timestamp: optionalString(record.timestamp) ?? null,
    results: results.map(normalizePlateResult),
  };
}

function normalizePlateResult(value: unknown): Record<string, unknown> {
  const record = requiredRecord(value, "Plate Recognizer result", providerResponseError);
  return compactObject({
    box: requiredRecord(record.box, "result.box", providerResponseError),
    plate: requiredString(record.plate, "result.plate", providerResponseError),
    region: requiredRecord(record.region, "result.region", providerResponseError),
    score: readRequiredNumber(record.score, "result.score"),
    dscore: readRequiredNumber(record.dscore, "result.dscore"),
    vehicle: optionalRecord(record.vehicle),
    candidates: Array.isArray(record.candidates) ? record.candidates : [],
    model_make: Array.isArray(record.model_make) ? record.model_make : undefined,
    color: Array.isArray(record.color) ? record.color : undefined,
    orientation: Array.isArray(record.orientation) ? record.orientation : undefined,
    year: optionalRecord(record.year),
    direction: optionalNumber(record.direction),
    direction_score: optionalNumber(record.direction_score),
  });
}

function normalizeStatisticsPayload(payload: unknown): {
  usage: { month: number; calls: number; year: number; resetsOn: string };
  totalCalls: number;
} {
  const record = requiredRecord(payload, "Plate Recognizer statistics response", providerResponseError);
  const usage = requiredRecord(record.usage, "statistics.usage", providerResponseError);
  return {
    usage: {
      month: readRequiredInteger(usage.month, "usage.month"),
      calls: readRequiredInteger(usage.calls, "usage.calls"),
      year: readRequiredInteger(usage.year, "usage.year"),
      resetsOn: requiredString(usage.resets_on, "usage.resets_on", providerResponseError),
    },
    totalCalls: readRequiredInteger(record.total_calls, "total_calls"),
  };
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return record
    ? (optionalString(record.error) ??
        optionalString(record.message) ??
        (Array.isArray(record.detail) ? optionalString(record.detail[0]) : optionalString(record.detail)))
    : undefined;
}

function appendString(formData: FormData, key: string, value: string | undefined): void {
  if (value !== undefined) {
    formData.set(key, value);
  }
}

function appendBoolean(formData: FormData, key: string, value: unknown): void {
  if (typeof value === "boolean") {
    formData.set(key, String(value));
  }
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  const numberValue = optionalNumber(value);
  if (numberValue === undefined) {
    throw new ProviderRequestError(502, `${fieldName} must be a number`);
  }
  return numberValue;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  throw new ProviderRequestError(502, `${fieldName} must be an integer`);
}

function providerResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
