import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { StabilityAiActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "stabilityai";
const stabilityAiApiBaseUrl = "https://api.stability.ai";
const stabilityAiValidationPath = "/v1/user/account";
const stabilityAiTextToAudioPath = "/v2beta/audio/stable-audio-2/text-to-audio";
const stabilityAiDefaultRequestTimeoutMs = 30_000;

type StabilityAiPhase = "validate" | "execute";
type StabilityAiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface StabilityAiRequestInput {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: StabilityAiPhase;
  method?: "GET" | "POST";
  body?: string | FormData;
  accept?: string;
}

export const stabilityaiActionHandlers: Record<StabilityAiActionName, StabilityAiActionHandler> = {
  text_to_audio(input, context) {
    return stabilityAiTextToAudio(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, stabilityaiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const account = normalizeAccount(
      await requestStabilityAiJson({
        apiKey: input.apiKey,
        path: stabilityAiValidationPath,
        fetcher,
        signal,
        phase: "validate",
      }),
    );
    const defaultOrganization = account.organizations.find((organization) => organization.isDefault);

    return {
      profile: {
        accountId: account.id ?? account.email ?? "stabilityai-api-key",
        displayName: account.email ?? "Stability AI API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: stabilityAiValidationPath,
        apiBaseUrl: stabilityAiApiBaseUrl,
        accountId: account.id,
        email: account.email,
        defaultOrganizationId: defaultOrganization?.id,
        organizationCount: account.organizations.length,
      }),
    };
  },
};

async function stabilityAiTextToAudio(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "stabilityai text_to_audio requires local transit file storage.");
  }

  validateTextToAudioSteps(input);
  const outputFormat = optionalString(input.outputFormat) ?? "mp3";
  const model = optionalString(input.model) ?? "stable-audio-2";
  const response = await requestStabilityAiResponse({
    apiKey: context.apiKey,
    path: stabilityAiTextToAudioPath,
    method: "POST",
    body: buildTextToAudioBody(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    accept: "audio/*",
  });

  const bytes = Buffer.from(
    await readBoundedResponseBytes(response, {
      maxBytes: context.transitFiles.maxBytes,
      fieldName: "Stability AI audio output",
      createError: (message) => new ProviderRequestError(413, message),
    }),
  );
  const contentType = response.headers.get("content-type") ?? inferContentType(outputFormat);
  const extension = inferStabilityAiAudioExtension(contentType, outputFormat);
  const name = `stabilityai-text-to-audio.${extension}`;
  const upload = await context.transitFiles.create(new File([bytes], name, { type: contentType }));

  return compactObject({
    file: upload,
    model,
    outputFormat,
    contentType,
    seed: parseOptionalIntegerString(response.headers.get("seed")),
    finishReason: response.headers.get("finish-reason") ?? undefined,
  });
}

function validateTextToAudioSteps(input: Record<string, unknown>): void {
  if (input.steps == null) {
    return;
  }
  if (typeof input.steps !== "number" || !Number.isInteger(input.steps)) {
    throw new ProviderRequestError(400, "steps must be an integer.");
  }
  const model = optionalString(input.model) ?? "stable-audio-2";
  if (model === "stable-audio-2" && (input.steps < 30 || input.steps > 100)) {
    throw new ProviderRequestError(400, "steps must be between 30 and 100 when model is stable-audio-2.");
  }
  if (model === "stable-audio-2.5" && (input.steps < 4 || input.steps > 8)) {
    throw new ProviderRequestError(400, "steps must be between 4 and 8 when model is stable-audio-2.5.");
  }
}

function buildTextToAudioBody(input: Record<string, unknown>): FormData {
  const body = new FormData();
  body.append("prompt", String(input.prompt));
  appendOptionalFormField(body, "duration", input.duration);
  appendOptionalFormField(body, "seed", input.seed);
  appendOptionalFormField(body, "steps", input.steps);
  appendOptionalFormField(body, "cfg_scale", input.cfgScale);
  appendOptionalFormField(body, "model", input.model);
  appendOptionalFormField(body, "output_format", input.outputFormat);
  return body;
}

function appendOptionalFormField(formData: FormData, key: string, value: unknown): void {
  if (value != null) {
    formData.append(key, String(value));
  }
}

interface StabilityAiOrganization {
  id?: string;
  name?: string;
  role?: string;
  isDefault?: boolean;
}

interface StabilityAiAccount {
  id?: string;
  email?: string;
  organizations: StabilityAiOrganization[];
}

function normalizeAccount(payload: unknown): StabilityAiAccount {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Stability AI account response must be an object.", payload);
  }
  return {
    id: optionalString(record.id),
    email: optionalString(record.email),
    organizations: Array.isArray(record.organizations) ? record.organizations.map(normalizeOrganization) : [],
  };
}

function normalizeOrganization(value: unknown): StabilityAiOrganization {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "Stability AI organization entry must be an object.", value);
  }
  return compactObject({
    id: optionalString(record.id),
    name: optionalString(record.name),
    role: optionalString(record.role),
    isDefault:
      typeof record.is_default === "boolean"
        ? record.is_default
        : typeof record.isDefault === "boolean"
          ? record.isDefault
          : undefined,
  });
}

async function requestStabilityAiJson(input: StabilityAiRequestInput): Promise<unknown> {
  const response = await requestStabilityAiResponse({
    ...input,
    accept: "application/json",
  });
  return readStabilityAiPayload(response);
}

async function requestStabilityAiResponse(input: StabilityAiRequestInput): Promise<Response> {
  const timeout = createProviderTimeout(input.signal, stabilityAiDefaultRequestTimeoutMs);
  try {
    const response = await input.fetcher(new URL(input.path, stabilityAiApiBaseUrl), {
      method: input.method ?? "GET",
      headers: buildStabilityAiHeaders({
        apiKey: input.apiKey,
        accept: input.accept ?? "application/json",
        hasJsonBody: typeof input.body === "string",
      }),
      body: input.body,
      signal: timeout.signal,
    });

    if (!response.ok) {
      const payload = await readStabilityAiPayload(response);
      throw createStabilityAiError(response.status, payload, input.phase);
    }

    return response;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Stability AI request timed out.");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Stability AI request failed: ${error.message}` : "Stability AI request failed.",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildStabilityAiHeaders(input: {
  apiKey: string;
  accept: string;
  hasJsonBody: boolean;
}): Record<string, string> {
  return {
    Authorization: `Bearer ${input.apiKey}`,
    Accept: input.accept,
    "User-Agent": providerUserAgent,
    ...(input.hasJsonBody ? { "Content-Type": "application/json" } : {}),
  };
}

async function readStabilityAiPayload(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (raw.length === 0) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function createStabilityAiError(status: number, payload: unknown, phase: StabilityAiPhase): ProviderRequestError {
  const message = readStabilityAiErrorMessage(payload) ?? defaultStabilityAiErrorMessage(status, phase);
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 400 || status === 403 || status === 422)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function readStabilityAiErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  if (Array.isArray(record.errors)) {
    const messages = record.errors.filter((item): item is string => typeof item === "string" && item.trim() !== "");
    if (messages.length > 0) {
      return messages.join("; ");
    }
  }
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.description) ??
    optionalString(record.name)
  );
}

function defaultStabilityAiErrorMessage(status: number, phase: StabilityAiPhase): string {
  if (phase === "validate") {
    return status === 429
      ? "Stability AI rate limit exceeded."
      : status >= 400 && status < 500
        ? "Stability AI API key is invalid."
        : "Stability AI credential validation failed.";
  }
  switch (status) {
    case 400:
    case 422:
      return "Stability AI rejected the request input.";
    case 401:
      return "Stability AI rejected the API key.";
    case 403:
      return "Stability AI rejected the audio prompt.";
    case 429:
      return "Stability AI rate limit exceeded.";
    default:
      return "Stability AI request failed.";
  }
}

function parseOptionalIntegerString(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function inferContentType(outputFormat: string): string {
  return outputFormat === "wav" ? "audio/wav" : "audio/mpeg";
}

function inferStabilityAiAudioExtension(contentType: string, outputFormat: string): string {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("wav")) {
    return "wav";
  }
  if (normalized.includes("mpeg") || normalized.includes("mp3")) {
    return "mp3";
  }
  return outputFormat === "wav" ? "wav" : "mp3";
}
