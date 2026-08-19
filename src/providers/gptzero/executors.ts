import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBooleanOrNull,
  optionalNumber,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredRecord,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";

const service = "gptzero";
const gptzeroApiBaseUrl = "https://api.gptzero.me";
const gptzeroPredictTextPath = "/v2/predict/text";
const gptzeroDefaultRequestTimeoutMs = 30_000;
const gptzeroValidationDocument = "This is a GPTZero API key validation request.";

type GptzeroRequestPhase = "validate" | "execute";

interface GptzeroJsonRequestOptions {
  apiKey: string;
  document: unknown;
  version?: unknown;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: GptzeroRequestPhase;
}

export const gptzeroActionHandlers: ProviderActionHandlers<"gptzero", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async detect_text(input, context) {
    const payload = await requestGptzeroJson({
      apiKey: context.apiKey,
      document: input.document,
      version: input.version,
      context,
      phase: "execute",
    });
    return normalizeGptzeroPredictionPayload(payload);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, gptzeroActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: gptzeroApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const payload = await requestGptzeroJson({
      apiKey: input.apiKey,
      document: gptzeroValidationDocument,
      context: { fetcher, signal },
      phase: "validate",
    });
    normalizeGptzeroPredictionPayload(payload);

    return {
      profile: {
        displayName: "GPTZero API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: gptzeroApiBaseUrl,
        validationEndpoint: gptzeroPredictTextPath,
      },
    };
  },
};

async function requestGptzeroJson(input: GptzeroJsonRequestOptions): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, gptzeroDefaultRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(new URL(gptzeroPredictTextPath, gptzeroApiBaseUrl), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": input.apiKey,
      },
      body: JSON.stringify(
        compactObject({
          document: input.document,
          version: input.version,
        }),
      ),
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "GPTZero returned invalid JSON",
    });
    if (!response.ok) {
      throw createGptzeroError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "GPTZero request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `GPTZero request failed: ${error.message}` : "GPTZero request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function normalizeGptzeroPredictionPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  const rawDocuments = Array.isArray(record?.documents) ? record.documents : [];
  const documents = rawDocuments.map(normalizeGptzeroDocument);
  if (!record || documents.length === 0) {
    throw new ProviderRequestError(502, "GPTZero response did not include documents");
  }

  return {
    version: optionalRawString(record.version) ?? null,
    scanId: optionalRawString(record.scanId) ?? null,
    documents,
    raw: record,
  };
}

function normalizeGptzeroDocument(value: unknown): Record<string, unknown> {
  const record = requiredRecord(value, "GPTZero document result", (message) => new ProviderRequestError(502, message));
  return {
    documentId: optionalRawString(record.document_id) ?? null,
    version: optionalRawString(record.version) ?? null,
    classification:
      optionalRawString(record.document_classification) ?? optionalRawString(record.predicted_class) ?? null,
    resultMessage: optionalRawString(record.result_message) ?? null,
    averageGeneratedProbability: readNullableProbability(record.average_generated_prob),
    completelyGeneratedProbability: readNullableProbability(record.completely_generated_prob),
    overallBurstiness: optionalNumber(record.overall_burstiness) ?? null,
    classProbabilities: optionalRecord(record.class_probabilities) ?? null,
    confidenceCategory: optionalRawString(record.confidence_category) ?? null,
    confidenceScore: readNullableProbability(record.confidence_score),
    confidenceScoresRaw: optionalRecord(record.confidence_scores_raw) ?? null,
    writingStats: optionalRecord(record.writing_stats) ?? null,
    paragraphs: normalizeGptzeroParagraphs(record.paragraphs),
    sentences: normalizeGptzeroSentences(record.sentences),
    raw: record,
  };
}

function normalizeGptzeroParagraphs(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((paragraph) => {
    const record = requiredRecord(
      paragraph,
      "GPTZero paragraph result",
      (message) => new ProviderRequestError(502, message),
    );
    return {
      completelyGeneratedProbability: readNullableProbability(record.completely_generated_prob),
      sentenceCount: readNullableInteger(record.num_sentences),
      startSentenceIndex: readNullableInteger(record.start_sentence_index),
      raw: record,
    };
  });
}

function normalizeGptzeroSentences(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((sentence) => {
    const record = requiredRecord(
      sentence,
      "GPTZero sentence result",
      (message) => new ProviderRequestError(502, message),
    );
    return {
      sentence: optionalRawString(record.sentence) ?? null,
      generatedProbability: readNullableProbability(record.generated_prob),
      perplexity: optionalNumber(record.perplexity) ?? null,
      highlightedForAi: optionalBooleanOrNull(record.highlight_sentence_for_ai),
      raw: record,
    };
  });
}

function createGptzeroError(status: number, payload: unknown, phase: GptzeroRequestPhase): ProviderRequestError {
  const message = extractGptzeroErrorMessage(payload) ?? `GPTZero request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500 && status !== 401 && status !== 403) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function extractGptzeroErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return record
    ? (optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail))
    : undefined;
}

function readNullableProbability(value: unknown): number | null {
  const probability = optionalNumber(value);
  if (probability === undefined) {
    return null;
  }
  if (probability < 0 || probability > 1) {
    throw new ProviderRequestError(502, "GPTZero returned a probability outside the range from 0 to 1");
  }
  return probability;
}

function readNullableInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}
