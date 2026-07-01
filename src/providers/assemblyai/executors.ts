import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { AssemblyaiActionName } from "./actions.ts";

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
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
  setSearchParams,
} from "../provider-runtime.ts";

const service = "assemblyai";
const assemblyaiApiBaseUrl = "https://api.assemblyai.com/v2";

type AssemblyaiPhase = "validate" | "execute";
type AssemblyaiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const assemblyaiActionHandlers: Record<AssemblyaiActionName, AssemblyaiActionHandler> = {
  async create_transcript(input, context) {
    const payload = await requestAssemblyaiJson({
      path: "/transcript",
      method: "POST",
      context,
      body: buildCreateTranscriptBody(input),
      phase: "execute",
    });

    return {
      transcript: normalizeTranscript(payload),
    };
  },

  async get_transcript(input, context) {
    const payload = await requestAssemblyaiJson({
      path: `/transcript/${encodeURIComponent(requiredString(input.transcriptId, "transcriptId", invalidInputError))}`,
      method: "GET",
      context,
      phase: "execute",
    });

    return {
      transcript: normalizeTranscript(payload),
    };
  },

  async list_transcripts(input, context) {
    const payload = await requestAssemblyaiJson({
      path: "/transcript",
      method: "GET",
      context,
      params: compactStringObject({
        limit: readOptionalIntegerString(input.limit, "limit"),
        status: optionalString(input.status),
        created_on: optionalString(input.createdOn),
        before_id: optionalString(input.beforeId),
        after_id: optionalString(input.afterId),
      }),
      phase: "execute",
    });

    return normalizeTranscriptList(payload);
  },

  async delete_transcript(input, context) {
    const payload = await requestAssemblyaiJson({
      path: `/transcript/${encodeURIComponent(requiredString(input.transcriptId, "transcriptId", invalidInputError))}`,
      method: "DELETE",
      context,
      phase: "execute",
    });

    return {
      transcript: normalizeTranscript(payload),
    };
  },

  async get_transcript_sentences(input, context) {
    const payload = await requestAssemblyaiJson({
      path: `/transcript/${encodeURIComponent(requiredString(input.transcriptId, "transcriptId", invalidInputError))}/sentences`,
      method: "GET",
      context,
      phase: "execute",
    });

    return normalizeTranscriptSegments(payload, "sentences");
  },

  async get_transcript_paragraphs(input, context) {
    const payload = await requestAssemblyaiJson({
      path: `/transcript/${encodeURIComponent(requiredString(input.transcriptId, "transcriptId", invalidInputError))}/paragraphs`,
      method: "GET",
      context,
      phase: "execute",
    });

    return normalizeTranscriptSegments(payload, "paragraphs");
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ApiKeyProviderContext>({
  service,
  handlers: assemblyaiActionHandlers,
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
    await requestAssemblyaiJson({
      path: "/transcript",
      method: "GET",
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      params: { limit: "1" },
      phase: "validate",
    });

    return {
      profile: {
        displayName: "AssemblyAI API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/transcript",
      },
    };
  },
};

async function requestAssemblyaiJson(input: {
  path: string;
  method: "DELETE" | "GET" | "POST";
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  params?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  phase: AssemblyaiPhase;
}): Promise<unknown> {
  let response: Response;
  try {
    response = await input.context.fetcher(buildAssemblyaiUrl(input), {
      method: input.method,
      headers: buildAssemblyaiHeaders(input.context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      isAbortError(error) ? 504 : 502,
      error instanceof Error ? `AssemblyAI request failed: ${error.message}` : "AssemblyAI request failed",
    );
  }

  const payload = await readAssemblyaiPayload(response);
  if (!response.ok) {
    throw createAssemblyaiError(response.status, payload, input.phase);
  }

  return payload;
}

function buildAssemblyaiHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return compactObject({
    accept: "application/json",
    authorization: apiKey,
    "content-type": hasBody ? "application/json" : undefined,
    "user-agent": providerUserAgent,
  }) as Record<string, string>;
}

function buildAssemblyaiUrl(input: { path: string; params?: Record<string, string | undefined> }): URL {
  const normalizedPath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(normalizedPath, `${assemblyaiApiBaseUrl}/`);
  setSearchParams(url, input.params ?? {});
  return url;
}

async function readAssemblyaiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "AssemblyAI returned invalid JSON");
  }
}

function createAssemblyaiError(status: number, payload: unknown, phase: AssemblyaiPhase): ProviderRequestError {
  const message = extractAssemblyaiErrorMessage(payload) ?? `AssemblyAI request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractAssemblyaiErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  return optionalString(object.error) ?? optionalString(object.message) ?? optionalString(object.detail);
}

function buildCreateTranscriptBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    audio_url: requiredString(input.audioUrl, "audioUrl", invalidInputError),
    speech_model: optionalString(input.speechModel),
    language_code: optionalString(input.languageCode),
    language_detection: optionalBoolean(input.languageDetection),
    punctuate: optionalBoolean(input.punctuate),
    format_text: optionalBoolean(input.formatText),
    speaker_labels: optionalBoolean(input.speakerLabels),
    speakers_expected: optionalInteger(input.speakersExpected),
    multichannel: optionalBoolean(input.multichannel),
    audio_start_from: optionalInteger(input.audioStartFrom),
    audio_end_at: optionalInteger(input.audioEndAt),
    filter_profanity: optionalBoolean(input.filterProfanity),
    auto_highlights: optionalBoolean(input.autoHighlights),
    sentiment_analysis: optionalBoolean(input.sentimentAnalysis),
    entity_detection: optionalBoolean(input.entityDetection),
    webhook_url: optionalString(input.webhookUrl),
    webhook_auth_header_name: optionalString(input.webhookAuthHeaderName),
    webhook_auth_header_value: optionalString(input.webhookAuthHeaderValue),
  });
}

function normalizeTranscript(payload: unknown): Record<string, unknown> {
  const object = optionalRecord(payload) ?? {};

  return {
    ...object,
    id: readNullableString(object.id),
    status: readNullableString(object.status),
    text: readNullableString(object.text),
    audio_url: readNullableString(object.audio_url),
    error: readNullableString(object.error),
    confidence: readNullableNumber(object.confidence),
    audio_duration: readNullableNumber(object.audio_duration),
    language_code: readNullableString(object.language_code),
    created: readNullableString(object.created),
    completed: readNullableString(object.completed),
  };
}

function normalizeTranscriptList(payload: unknown): Record<string, unknown> {
  const object = optionalRecord(payload) ?? {};
  const transcripts = Array.isArray(object.transcripts) ? object.transcripts.map(normalizeTranscript) : [];

  return {
    transcripts,
    pageDetails: normalizePageDetails(object.page_details),
    raw: object,
  };
}

function normalizePageDetails(payload: unknown): Record<string, unknown> {
  const object = optionalRecord(payload) ?? {};

  return {
    ...object,
    limit: nullableInteger(object.limit),
    result_count: nullableInteger(object.result_count),
    current_url: readNullableString(object.current_url),
    prev_url: readNullableString(object.prev_url),
    next_url: readNullableString(object.next_url),
  };
}

function normalizeTranscriptSegments(payload: unknown, key: "paragraphs" | "sentences"): Record<string, unknown> {
  const object = optionalRecord(payload) ?? {};
  const segments = Array.isArray(object[key]) ? object[key].map(normalizeTextSegment) : [];

  return {
    id: readNullableString(object.id),
    confidence: readNullableNumber(object.confidence),
    audioDuration: readNullableNumber(object.audio_duration),
    [key]: segments,
    raw: object,
  };
}

function normalizeTextSegment(payload: unknown): Record<string, unknown> {
  const object = optionalRecord(payload) ?? {};

  return {
    ...object,
    text: readNullableString(object.text),
    start: nullableInteger(object.start),
    end: nullableInteger(object.end),
    confidence: readNullableNumber(object.confidence),
    speaker: readNullableString(object.speaker),
    words: Array.isArray(object.words) ? object.words.map(normalizeWord) : [],
  };
}

function normalizeWord(payload: unknown): Record<string, unknown> {
  const object = optionalRecord(payload) ?? {};

  return {
    ...object,
    text: readNullableString(object.text),
    start: nullableInteger(object.start),
    end: nullableInteger(object.end),
    confidence: readNullableNumber(object.confidence),
    speaker: readNullableString(object.speaker),
  };
}

function readNullableString(value: unknown): string | null {
  return optionalString(value) ?? null;
}

function readNullableNumber(value: unknown): number | null {
  return optionalNumber(value) ?? null;
}

function nullableInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function readOptionalIntegerString(value: unknown, fieldName: string): string | undefined {
  const integer = optionalInteger(value);
  if (integer === undefined) {
    return undefined;
  }
  if (integer <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }

  return String(integer);
}

function compactStringObject(input: Record<string, string | undefined>): Record<string, string> {
  return compactObject(input) as Record<string, string>;
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
