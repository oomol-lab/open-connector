import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";
import type { SpeechmaticsBatchRegion } from "./constants.ts";

import { optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
  readProviderTextBody,
} from "../provider-runtime.ts";
import { speechmaticsBatchHosts } from "./constants.ts";

const speechmaticsDiscoveryPath = "/v1/discovery/features";
const speechmaticsRequestTimeoutMs = 60_000;

export interface SpeechmaticsActionContext extends ApiKeyProviderContext {
  defaultRegion?: string;
}

interface SpeechmaticsCredentialInput {
  apiKey: string;
  defaultRegion?: string;
}

interface SpeechmaticsRequestOptions {
  method?: "GET" | "POST";
  body?: BodyInit;
  authenticated?: boolean;
  phase?: "validate" | "execute";
  accept?: string;
}

interface SpeechmaticsDeployment {
  mode: "batch" | "realtime";
  region: SpeechmaticsBatchRegion | "global";
  location: string;
  customerType: "all" | "enterprise";
  endpoint: string;
  protocol: "https" | "wss";
  apiVersion: string;
}

type SpeechmaticsActionHandler = (
  input: Record<string, unknown>,
  context: SpeechmaticsActionContext,
) => Promise<unknown>;

const speechmaticsDeployments: readonly SpeechmaticsDeployment[] = [
  {
    mode: "batch",
    region: "eu1",
    location: "Europe",
    customerType: "all",
    endpoint: speechmaticsBatchHosts.eu1,
    protocol: "https",
    apiVersion: "v2",
  },
  {
    mode: "batch",
    region: "eu2",
    location: "Europe",
    customerType: "enterprise",
    endpoint: speechmaticsBatchHosts.eu2,
    protocol: "https",
    apiVersion: "v2",
  },
  {
    mode: "batch",
    region: "us1",
    location: "USA",
    customerType: "all",
    endpoint: speechmaticsBatchHosts.us1,
    protocol: "https",
    apiVersion: "v2",
  },
  {
    mode: "batch",
    region: "us2",
    location: "USA",
    customerType: "enterprise",
    endpoint: speechmaticsBatchHosts.us2,
    protocol: "https",
    apiVersion: "v2",
  },
  {
    mode: "batch",
    region: "au1",
    location: "Australia",
    customerType: "all",
    endpoint: speechmaticsBatchHosts.au1,
    protocol: "https",
    apiVersion: "v2",
  },
  {
    mode: "realtime",
    region: "global",
    location: "Nearest available region",
    customerType: "all",
    endpoint: "global.rt.speechmatics.com",
    protocol: "wss",
    apiVersion: "v2",
  },
  {
    mode: "realtime",
    region: "eu1",
    location: "Europe",
    customerType: "all",
    endpoint: "eu.rt.speechmatics.com",
    protocol: "wss",
    apiVersion: "v2",
  },
  {
    mode: "realtime",
    region: "us1",
    location: "USA",
    customerType: "all",
    endpoint: "us.rt.speechmatics.com",
    protocol: "wss",
    apiVersion: "v2",
  },
];

export const speechmaticsActionHandlers: ProviderActionHandlers<"speechmatics", SpeechmaticsActionHandler> = {
  async submit_transcription(input, context): Promise<unknown> {
    const region = readBatchRegion(input.region, context.defaultRegion);
    const formData = new FormData();
    formData.set("config", JSON.stringify(buildTranscriptionConfig(input)));
    const payload = await speechmaticsRequest(batchUrl(region, "/v2/jobs"), context, {
      method: "POST",
      body: formData,
    });
    return requireSpeechmaticsObject(payload, "job submission response");
  },
  async get_transcription_job(input, context): Promise<unknown> {
    const region = readBatchRegion(input.region, context.defaultRegion);
    const jobId = readRequiredString(input.jobId, "jobId");
    const payload = await speechmaticsRequest(batchUrl(region, `/v2/jobs/${encodeURIComponent(jobId)}`), context);
    const response = requireSpeechmaticsObject(payload, "job response");
    requireSpeechmaticsObject(response.job, "job");
    return response;
  },
  async get_transcript(input, context): Promise<unknown> {
    const region = readBatchRegion(input.region, context.defaultRegion);
    const jobId = readRequiredString(input.jobId, "jobId");
    const format = readTranscriptFormat(input.format);
    const url = batchUrl(region, `/v2/jobs/${encodeURIComponent(jobId)}/transcript`);
    url.searchParams.set("format", format);
    const transcript = await speechmaticsRequest(url, context, {
      accept: format === "json-v2" ? "application/json" : "text/plain",
    });
    return { format, transcript };
  },
  async get_service_capabilities(input, context): Promise<unknown> {
    const region = readBatchRegion(input.region, context.defaultRegion);
    const endpoint = batchUrl(region, speechmaticsDiscoveryPath);
    const payload = await speechmaticsRequest(endpoint, context, { authenticated: false });
    return {
      region,
      endpoint: endpoint.toString(),
      capabilities: requireSpeechmaticsObject(payload, "Discovery API response"),
    };
  },
  async list_deployments(input): Promise<unknown> {
    const mode = readProcessingMode(input.mode);
    return {
      deployments: mode
        ? speechmaticsDeployments.filter((deployment) => deployment.mode === mode)
        : speechmaticsDeployments,
    };
  },
};

export async function validateSpeechmaticsCredential(
  credential: SpeechmaticsCredentialInput,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const region = readBatchRegion(undefined, credential.defaultRegion);
  await speechmaticsRequest(
    batchUrl(region, "/v2/jobs?limit=1"),
    { apiKey: credential.apiKey, defaultRegion: region, fetcher, signal },
    { phase: "validate" },
  );
  return {
    profile: {
      accountId: `speechmatics-api-key:${region}`,
      displayName: `Speechmatics API Key (${region})`,
    },
    grantedScopes: [],
    metadata: {
      defaultRegion: region,
      apiBaseUrl: `https://${speechmaticsBatchHosts[region]}/v2`,
      validationEndpoint: "/jobs?limit=1",
    },
  };
}

function buildTranscriptionConfig(input: Record<string, unknown>) {
  const additionalVocabulary = Array.isArray(input.additionalVocabulary)
    ? input.additionalVocabulary.map((item) => {
        const vocabulary = requireSpeechmaticsObject(item, "additional vocabulary item");
        return {
          content: readRequiredString(vocabulary.content, "additionalVocabulary.content"),
          sounds_like: Array.isArray(vocabulary.soundsLike) ? vocabulary.soundsLike : undefined,
        };
      })
    : undefined;
  return {
    type: "transcription",
    fetch_data: {
      url: readRequiredString(input.mediaUrl, "mediaUrl"),
      auth_headers: Array.isArray(input.mediaAuthHeaders) ? input.mediaAuthHeaders : undefined,
    },
    transcription_config: {
      language: readRequiredString(input.language, "language"),
      model: optionalString(input.model),
      domain: optionalString(input.domain),
      output_locale: optionalString(input.outputLocale),
      diarization: optionalString(input.diarization),
      enable_entities: optionalBoolean(input.enableEntities),
      additional_vocab: additionalVocabulary,
    },
    tracking: optionalRecord(input.tracking),
  };
}

async function speechmaticsRequest(
  url: URL,
  context: SpeechmaticsActionContext,
  options: SpeechmaticsRequestOptions = {},
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, speechmaticsRequestTimeoutMs);
  const headers = new Headers({
    accept: options.accept ?? "application/json",
    "user-agent": providerUserAgent,
  });
  if (options.authenticated !== false) {
    headers.set("authorization", `Bearer ${context.apiKey}`);
  }

  try {
    const response = await context.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body,
      signal: timeout.signal,
    });
    const payload = await readSpeechmaticsPayload(response);
    if (!response.ok) {
      throw createSpeechmaticsError(response, payload, options.phase ?? "execute");
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Speechmatics request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Speechmatics request failed: ${error.message}` : "Speechmatics request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readSpeechmaticsPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Speechmatics response");
  if (!text.trim()) {
    return null;
  }
  if ((response.headers.get("content-type") ?? "").includes("json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ProviderRequestError(502, "Speechmatics returned invalid JSON");
    }
  }
  return text;
}

function createSpeechmaticsError(
  response: Response,
  payload: unknown,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message =
    extractSpeechmaticsErrorMessage(payload) ??
    response.statusText ??
    `Speechmatics request failed with status ${response.status}`;
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractSpeechmaticsErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const object = optionalRecord(payload);
  return object
    ? (optionalString(object.detail) ?? optionalString(object.error) ?? optionalString(object.message))
    : undefined;
}

function requireSpeechmaticsObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `Speechmatics ${label} must be an object`);
  }
  return object;
}

function readProcessingMode(value: unknown): "batch" | "realtime" | undefined {
  const mode = optionalString(value);
  if (!mode) {
    return undefined;
  } else if (mode === "batch" || mode === "realtime") {
    return mode;
  } else {
    throw new ProviderRequestError(400, `Unsupported Speechmatics mode: ${mode}`);
  }
}

function batchUrl(region: SpeechmaticsBatchRegion, path: string) {
  return new URL(`https://${speechmaticsBatchHosts[region]}${path}`);
}

function readBatchRegion(value: unknown, fallback?: string): SpeechmaticsBatchRegion {
  const region = optionalString(value) ?? fallback ?? "eu1";
  if (isSpeechmaticsBatchRegion(region)) {
    return region;
  }
  throw new ProviderRequestError(400, `Unsupported Speechmatics region: ${region}`);
}

function isSpeechmaticsBatchRegion(value: string): value is SpeechmaticsBatchRegion {
  return Object.hasOwn(speechmaticsBatchHosts, value);
}

function readTranscriptFormat(value: unknown): "json-v2" | "txt" | "srt" {
  const format = optionalString(value) ?? "json-v2";
  if (format === "json-v2" || format === "txt" || format === "srt") {
    return format;
  }
  throw new ProviderRequestError(400, `Unsupported Speechmatics transcript format: ${format}`);
}

function readRequiredString(value: unknown, fieldName: string) {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}
