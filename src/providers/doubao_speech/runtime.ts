import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { randomUUIDv7 } from "../../core/uuid-v7.ts";
import {
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

export const doubaoSpeechApiBaseUrl = "https://openspeech.bytedance.com/api/v3";
const ttsResourceId = "seed-tts-2.0";
const sttResourceId = "volc.seedasr.auc";
const successCode = 20000000;

export const doubaoSpeechActionHandlers: ProviderActionHandlers<
  "doubao_speech",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async submit_tts(input, context): Promise<unknown> {
    const requestId = randomUUIDv7();
    const payload = await requestJson(
      context,
      "tts/submit",
      {
        req_params: {
          text: requiredInputString(input.text, "text"),
          speaker: requiredInputString(input.voice, "voice"),
          audio_params: { format: optionalString(input.format) ?? "mp3" },
        },
      },
      { requestId, resourceId: ttsResourceId },
    );
    const response = requireRecord(payload, "TTS submit response");
    handleTtsCode(response);
    const data = requireRecord(response.data, "TTS submit data");
    return { taskId: requiredString(data.task_id, "data.task_id", providerResponseError) };
  },
  async get_tts(input, context): Promise<unknown> {
    const taskId = requiredInputString(input.taskId, "taskId");
    const payload = await requestJson(
      context,
      "tts/query",
      { task_id: taskId },
      { requestId: randomUUIDv7(), resourceId: ttsResourceId },
    );
    const response = requireRecord(payload, "TTS query response");
    handleTtsCode(response);
    const data = requireRecord(response.data, "TTS query data");
    if (optionalInteger(data.task_status) !== 2) return { taskId, state: "processing" };
    return compactObject({
      taskId,
      state: "succeeded",
      audioUrl: requiredString(data.audio_url, "data.audio_url", providerResponseError),
      urlExpiresAt: optionalInteger(data.url_expire_time),
      requestedTextLength: optionalInteger(data.req_text_length),
      synthesizedTextLength: optionalInteger(data.synthesize_text_length),
    });
  },
  async submit_stt(input, context): Promise<unknown> {
    const taskId = randomUUIDv7();
    await requestStt(
      context,
      "auc/bigmodel/submit",
      {
        user: { uid: "oomol-connector" },
        audio: {
          url: requiredInputString(input.audioUrl, "audioUrl"),
          format: requiredInputString(input.format, "format"),
        },
        request: compactObject({
          model_name: "bigmodel",
          enable_itn: true,
          enable_punc: true,
          enable_ddc: true,
          show_utterances: true,
          enable_speaker_info: input.enableSpeakerInfo === true,
          language: optionalString(input.language),
        }),
      },
      { requestId: taskId, resourceId: sttResourceId, sequence: "-1" },
    );
    return { taskId };
  },
  async get_stt(input, context): Promise<unknown> {
    const taskId = requiredInputString(input.taskId, "taskId");
    const response = await requestStt(
      context,
      "auc/bigmodel/query",
      {},
      { requestId: taskId, resourceId: sttResourceId },
    );
    if (response.statusCode === 20000001 || response.statusCode === 20000002) return { taskId, state: "processing" };
    const body = requireRecord(response.payload, "STT query response");
    const result = requireRecord(body.result, "STT query result");
    const utterances = Array.isArray(result.utterances)
      ? result.utterances.map((item) => {
          const utterance = requireRecord(item, "STT utterance");
          return {
            text: requiredString(utterance.text, "utterance.text", providerResponseError),
            startTime: optionalInteger(utterance.start_time) ?? 0,
            endTime: optionalInteger(utterance.end_time) ?? 0,
          };
        })
      : undefined;
    const audioInfo = optionalRecord(body.audio_info);
    return compactObject({
      taskId,
      state: "succeeded",
      text: requiredString(result.text, "result.text", providerResponseError),
      utterances,
      duration: optionalInteger(audioInfo?.duration),
    });
  },
};

export async function validateDoubaoSpeechCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = { apiKey, fetcher, signal };
  await requestStt(
    context,
    "auc/bigmodel/query",
    {},
    {
      requestId: randomUUIDv7(),
      resourceId: sttResourceId,
    },
  ).catch((error: unknown) => {
    if (!(error instanceof ProviderRequestError) || error.code !== "invalid_input") throw error;
  });
  return {
    profile: { accountId: "doubao_speech:app_key", displayName: "Doubao Speech APP Key" },
    grantedScopes: [],
    metadata: { apiBaseUrl: doubaoSpeechApiBaseUrl },
  };
}

interface RequestHeaders {
  requestId: string;
  resourceId: string;
  sequence?: string;
}

async function requestJson(
  context: ApiKeyProviderContext,
  path: string,
  body: Record<string, unknown>,
  headers: RequestHeaders,
): Promise<unknown> {
  const { response, payload } = await requestAndReadJson(context, path, body, headers);
  if (!response.ok) throw httpError(response.status, payload);
  return payload;
}

async function requestStt(
  context: ApiKeyProviderContext,
  path: string,
  body: Record<string, unknown>,
  headers: RequestHeaders,
): Promise<{ payload: unknown; statusCode: number }> {
  const { response, payload } = await requestAndReadJson(context, path, body, headers);
  if (!response.ok) throw httpError(response.status, payload);
  const statusCode = Number(response.headers.get("x-api-status-code"));
  if (!Number.isInteger(statusCode)) throw providerResponseError("Doubao Speech returned no X-Api-Status-Code header");
  if (statusCode < successCode || statusCode > 20000002)
    throw speechCodeError(statusCode, response.headers.get("x-api-message") ?? "Doubao Speech request failed");
  return { payload, statusCode };
}

async function requestAndReadJson(
  context: ApiKeyProviderContext,
  path: string,
  body: Record<string, unknown>,
  headers: RequestHeaders,
): Promise<{ response: Response; payload: unknown }> {
  context.signal?.throwIfAborted();
  return runProviderRequest({ label: "Doubao Speech", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(new URL(path, `${doubaoSpeechApiBaseUrl}/`), {
      method: "POST",
      headers: compactHeaders({
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
        "x-api-resource-id": headers.resourceId,
        "x-api-request-id": headers.requestId,
        "x-api-sequence": headers.sequence,
      }),
      body: JSON.stringify(body),
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "Doubao Speech returned an invalid JSON response",
    });
    return { response, payload };
  });
}

function handleTtsCode(response: Record<string, unknown>): void {
  const code = optionalInteger(response.code);
  if (code === successCode) return;
  throw speechCodeError(code, optionalString(response.message) ?? "Doubao Speech TTS request failed");
}

function speechCodeError(code: number | undefined, message: string): ProviderRequestError {
  const details = compactObject({ code });
  if (
    code === 40000000 ||
    code === 40000001 ||
    code === 40000002 ||
    code === 45000001 ||
    code === 45000002 ||
    code === 45000151
  )
    return new ProviderRequestError(400, message, details, "invalid_input");
  if (code === 55000031) return new ProviderRequestError(429, message, details);
  return new ProviderRequestError(502, message, details);
}

function httpError(status: number, payload: unknown): ProviderRequestError {
  const record = optionalRecord(payload);
  const message = optionalString(record?.message) ?? `Doubao Speech request failed with HTTP ${status}`;
  if (status === 400 || status === 404 || status === 422)
    return new ProviderRequestError(status === 404 ? 404 : 400, message, { status }, "invalid_input");
  if (status === 429) return new ProviderRequestError(429, message, { status });
  return new ProviderRequestError(status >= 500 ? 502 : status, message, { status });
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw providerResponseError(`${label} must be an object`);
  return record;
}

function compactHeaders(input: Record<string, string | undefined>): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(input)) if (value !== undefined) headers.set(key, value);
  return headers;
}
