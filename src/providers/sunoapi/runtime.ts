import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  pickOptionalInteger,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const sunoApiBaseUrl = "https://api.sunoapi.org";

type SunoApiRequestPhase = "validate" | "execute";
type SunoApiActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type SunoApiActionHandler = (input: Record<string, unknown>, context: SunoApiActionContext) => Promise<unknown>;

export const sunoapiActionHandlers: ProviderActionHandlers<"sunoapi", SunoApiActionHandler> = {
  get_remaining_credits(_input, context) {
    return getRemainingCredits(context, "execute");
  },
  generate_music(input, context) {
    return submitSunoApiTask(input, context, "/api/v1/generate", "sunoapi music generation");
  },
  get_music_generation_details(input, context) {
    return getSunoApiRecordInfo(input, context, "/api/v1/generate/record-info", "sunoapi music generation details");
  },
  generate_lyrics(input, context) {
    return submitSunoApiTask(input, context, "/api/v1/lyrics", "sunoapi lyrics generation");
  },
  get_lyrics_generation_details(input, context) {
    return getSunoApiRecordInfo(input, context, "/api/v1/lyrics/record-info", "sunoapi lyrics generation details");
  },
  get_timestamped_lyrics(input, context) {
    return submitSunoApiObject(input, context, "/api/v1/generate/get-timestamped-lyrics", "sunoapi timestamped lyrics");
  },
  generate_persona(input, context) {
    return submitSunoApiObject(input, context, "/api/v1/generate/generate-persona", "sunoapi persona generation");
  },
  separate_vocals_from_music(input, context) {
    return submitSunoApiTask(input, context, "/api/v1/vocal-removal/generate", "sunoapi vocal removal");
  },
  get_vocal_separation_details(input, context) {
    return getSunoApiRecordInfo(
      input,
      context,
      "/api/v1/vocal-removal/record-info",
      "sunoapi vocal separation details",
    );
  },
  extend_music(input, context) {
    return submitSunoApiTask(input, context, "/api/v1/generate/extend", "sunoapi music extension");
  },
  upload_and_cover_audio(input, context) {
    return submitSunoApiTask(input, context, "/api/v1/generate/upload-cover", "sunoapi upload and cover audio");
  },
  upload_and_extend_audio(input, context) {
    return submitSunoApiTask(input, context, "/api/v1/generate/upload-extend", "sunoapi upload and extend audio");
  },
  add_vocals(input, context) {
    return submitSunoApiTask(input, context, "/api/v1/generate/add-vocals", "sunoapi add vocals");
  },
  add_instrumental(input, context) {
    return submitSunoApiTask(input, context, "/api/v1/generate/add-instrumental", "sunoapi add instrumental");
  },
  boost_music_style(input, context) {
    return submitSunoApiObject(input, context, "/api/v1/style/generate", "sunoapi style boost");
  },
  replace_music_section(input, context) {
    return submitSunoApiTask(input, context, "/api/v1/generate/replace-section", "sunoapi replace music section");
  },
  generate_mashup(input, context) {
    return submitSunoApiTask(input, context, "/api/v1/generate/mashup", "sunoapi mashup");
  },
  generate_sounds(input, context) {
    return submitSunoApiTask(input, context, "/api/v1/generate/sounds", "sunoapi sounds");
  },
  generate_music_cover(input, context) {
    return submitSunoApiTask(input, context, "/api/v1/suno/cover/generate", "sunoapi music cover generation");
  },
  get_music_cover_details(input, context) {
    return getSunoApiRecordInfo(input, context, "/api/v1/suno/cover/record-info", "sunoapi music cover details");
  },
  create_music_video(input, context) {
    return submitSunoApiTask(input, context, "/api/v1/mp4/generate", "sunoapi music video");
  },
  get_music_video_details(input, context) {
    return getSunoApiRecordInfo(input, context, "/api/v1/mp4/record-info", "sunoapi music video details");
  },
  convert_to_wav_format(input, context) {
    return submitSunoApiTask(input, context, "/api/v1/wav/generate", "sunoapi WAV conversion");
  },
  get_wav_conversion_details(input, context) {
    return getSunoApiRecordInfo(input, context, "/api/v1/wav/record-info", "sunoapi WAV conversion details");
  },
  generate_midi(input, context) {
    return submitSunoApiTask(input, context, "/api/v1/midi/generate", "sunoapi MIDI generation");
  },
  get_midi_generation_details(input, context) {
    return getSunoApiRecordInfo(input, context, "/api/v1/midi/record-info", "sunoapi MIDI generation details");
  },
};

export async function validateSunoApiCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const credits = await getRemainingCredits({ apiKey, fetcher, signal }, "validate");
  return {
    profile: {
      accountId: "api_key",
      displayName: "SunoAPI API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: sunoApiBaseUrl,
      validationEndpoint: "/api/v1/generate/credit",
      remainingCredits: credits.credits,
    },
  };
}

async function getRemainingCredits(
  context: SunoApiActionContext,
  phase: SunoApiRequestPhase,
): Promise<{ credits: number }> {
  const payload = await requestSunoApiJson({
    ...context,
    method: "GET",
    path: "/api/v1/generate/credit",
    phase,
  });
  const data = readSunoApiData(payload);
  const credits = optionalNumber(data);
  if (credits === undefined || !Number.isInteger(credits)) {
    throw new ProviderRequestError(502, "sunoapi credit response did not include credits", payload);
  }
  return { credits };
}

async function getSunoApiRecordInfo(
  input: Record<string, unknown>,
  context: SunoApiActionContext,
  path: string,
  label: string,
): Promise<Record<string, unknown>> {
  const payload = await requestSunoApiJson({
    ...context,
    method: "GET",
    path,
    query: {
      taskId: requireString(input.taskId, "taskId"),
    },
    phase: "execute",
  });
  return readSunoApiObjectData(payload, label);
}

async function submitSunoApiTask(
  input: Record<string, unknown>,
  context: SunoApiActionContext,
  path: string,
  label: string,
): Promise<{ taskId: string }> {
  const body = buildTaskBody(input, path);
  const payload = await requestSunoApiJson({
    ...context,
    method: "POST",
    path,
    body,
    phase: "execute",
  });
  const data = readSunoApiObjectData(payload, `${label} submission`);
  const taskId = optionalString(data.taskId);
  if (!taskId) {
    throw new ProviderRequestError(502, `${label} response did not include taskId`, payload);
  }
  return { taskId };
}

async function submitSunoApiObject(
  input: Record<string, unknown>,
  context: SunoApiActionContext,
  path: string,
  label: string,
): Promise<Record<string, unknown>> {
  const payload = await requestSunoApiJson({
    ...context,
    method: "POST",
    path,
    body: buildTaskBody(input, path),
    phase: "execute",
  });
  return readSunoApiObjectData(payload, label);
}

function buildTaskBody(input: Record<string, unknown>, path: string): Record<string, unknown> {
  switch (path) {
    case "/api/v1/generate":
      return compactObject({
        prompt: optionalString(input.prompt),
        style: optionalString(input.style),
        title: optionalString(input.title),
        customMode: optionalBoolean(input.customMode),
        instrumental: optionalBoolean(input.instrumental),
        personaId: optionalString(input.personaId),
        personaModel: optionalString(input.personaModel),
        model: optionalString(input.model),
        negativeTags: optionalString(input.negativeTags),
        vocalGender: optionalString(input.vocalGender),
        styleWeight: optionalNumber(input.styleWeight),
        weirdnessConstraint: optionalNumber(input.weirdnessConstraint),
        audioWeight: optionalNumber(input.audioWeight),
        callBackUrl: optionalString(input.callBackUrl),
      });
    case "/api/v1/lyrics":
      return compactObject({
        prompt: optionalString(input.prompt),
        callBackUrl: optionalString(input.callBackUrl),
      });
    case "/api/v1/generate/extend":
      return compactObject({
        defaultParamFlag: optionalBoolean(input.defaultParamFlag),
        audioId: optionalString(input.audioId),
        prompt: optionalString(input.prompt),
        style: optionalString(input.style),
        title: optionalString(input.title),
        continueAt: optionalNumber(input.continueAt),
        personaId: optionalString(input.personaId),
        personaModel: optionalString(input.personaModel),
        model: optionalString(input.model),
        negativeTags: optionalString(input.negativeTags),
        vocalGender: optionalString(input.vocalGender),
        styleWeight: optionalNumber(input.styleWeight),
        weirdnessConstraint: optionalNumber(input.weirdnessConstraint),
        audioWeight: optionalNumber(input.audioWeight),
        callBackUrl: optionalString(input.callBackUrl),
      });
    case "/api/v1/generate/upload-cover":
      return compactObject({
        uploadUrl: requireString(input.uploadUrl, "uploadUrl"),
        customMode: optionalBoolean(input.customMode),
        instrumental: optionalBoolean(input.instrumental),
        callBackUrl: optionalString(input.callBackUrl),
        model: optionalString(input.model),
        prompt: optionalString(input.prompt),
        style: optionalString(input.style),
        title: optionalString(input.title),
        personaId: optionalString(input.personaId),
        personaModel: optionalString(input.personaModel),
        negativeTags: optionalString(input.negativeTags),
        vocalGender: optionalString(input.vocalGender),
        styleWeight: optionalNumber(input.styleWeight),
        weirdnessConstraint: optionalNumber(input.weirdnessConstraint),
        audioWeight: optionalNumber(input.audioWeight),
      });
    case "/api/v1/generate/upload-extend":
      return compactObject({
        uploadUrl: requireString(input.uploadUrl, "uploadUrl"),
        defaultParamFlag: optionalBoolean(input.defaultParamFlag),
        callBackUrl: optionalString(input.callBackUrl),
        model: optionalString(input.model),
        instrumental: optionalBoolean(input.instrumental),
        prompt: optionalString(input.prompt),
        style: optionalString(input.style),
        title: optionalString(input.title),
        personaId: optionalString(input.personaId),
        personaModel: optionalString(input.personaModel),
        negativeTags: optionalString(input.negativeTags),
        vocalGender: optionalString(input.vocalGender),
        styleWeight: optionalNumber(input.styleWeight),
        weirdnessConstraint: optionalNumber(input.weirdnessConstraint),
        audioWeight: optionalNumber(input.audioWeight),
      });
    case "/api/v1/generate/add-vocals":
      return pickAudioEditBody(input, ["prompt", "title", "negativeTags", "style"]);
    case "/api/v1/generate/add-instrumental":
      return pickAudioEditBody(input, ["title", "negativeTags", "tags"]);
    case "/api/v1/generate/replace-section":
      return compactObject({
        taskId: optionalString(input.taskId),
        audioId: optionalString(input.audioId),
        prompt: optionalString(input.prompt),
        tags: optionalString(input.tags),
        title: optionalString(input.title),
        infillStartS: optionalNumber(input.infillStartS),
        infillEndS: optionalNumber(input.infillEndS),
        negativeTags: optionalString(input.negativeTags),
        callBackUrl: optionalString(input.callBackUrl),
      });
    case "/api/v1/generate/mashup":
      return compactObject({
        uploadUrlList: Array.isArray(input.uploadUrlList)
          ? input.uploadUrlList.map((value) => String(value))
          : undefined,
        customMode: optionalBoolean(input.customMode),
        prompt: optionalString(input.prompt),
        style: optionalString(input.style),
        title: optionalString(input.title),
        instrumental: optionalBoolean(input.instrumental),
        model: optionalString(input.model),
        vocalGender: optionalString(input.vocalGender),
        styleWeight: optionalNumber(input.styleWeight),
        weirdnessConstraint: optionalNumber(input.weirdnessConstraint),
        audioWeight: optionalNumber(input.audioWeight),
        callBackUrl: optionalString(input.callBackUrl),
      });
    case "/api/v1/generate/sounds":
      return compactObject({
        prompt: optionalString(input.prompt),
        model: optionalString(input.model),
        soundLoop: optionalBoolean(input.soundLoop),
        soundTempo: pickOptionalInteger(input, "soundTempo"),
        soundKey: optionalString(input.soundKey),
        grabLyrics: optionalBoolean(input.grabLyrics),
        callBackUrl: optionalString(input.callBackUrl),
      });
    case "/api/v1/suno/cover/generate":
    case "/api/v1/wav/generate":
    case "/api/v1/midi/generate":
      return compactObject({
        taskId: optionalString(input.taskId),
        audioId: optionalString(input.audioId),
        callBackUrl: optionalString(input.callBackUrl),
      });
    case "/api/v1/mp4/generate":
      return compactObject({
        taskId: optionalString(input.taskId),
        audioId: optionalString(input.audioId),
        callBackUrl: optionalString(input.callBackUrl),
        author: optionalString(input.author),
        domainName: optionalString(input.domainName),
      });
    case "/api/v1/generate/generate-persona":
      return compactObject({
        taskId: optionalString(input.taskId),
        audioId: optionalString(input.audioId),
        name: optionalString(input.name),
        description: optionalString(input.description),
        vocalStart: optionalNumber(input.vocalStart),
        vocalEnd: optionalNumber(input.vocalEnd),
        style: optionalString(input.style),
      });
    case "/api/v1/generate/get-timestamped-lyrics":
      return compactObject({
        taskId: optionalString(input.taskId),
        audioId: optionalString(input.audioId),
      });
    case "/api/v1/style/generate":
      return compactObject({
        content: optionalString(input.content),
      });
    default:
      return compactObject({ ...input });
  }
}

function pickAudioEditBody(input: Record<string, unknown>, requiredTextFields: string[]): Record<string, unknown> {
  const body: Record<string, unknown> = {
    uploadUrl: optionalString(input.uploadUrl),
    callBackUrl: optionalString(input.callBackUrl),
    vocalGender: optionalString(input.vocalGender),
    styleWeight: optionalNumber(input.styleWeight),
    weirdnessConstraint: optionalNumber(input.weirdnessConstraint),
    audioWeight: optionalNumber(input.audioWeight),
    model: optionalString(input.model),
  };
  for (const key of requiredTextFields) {
    body[key] = optionalString(input[key]);
  }
  return compactObject(body);
}

async function requestSunoApiJson(input: {
  apiKey: string;
  fetcher: ProviderFetch;
  method: "GET" | "POST";
  path: string;
  phase: SunoApiRequestPhase;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(buildSunoApiUrl(input.path, input.query), {
      method: input.method,
      headers: buildSunoApiHeaders(input.apiKey, Boolean(input.body)),
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      signal: input.signal,
    });
    payload = await readSunoApiPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `sunoapi request failed: ${error.message}` : "sunoapi request failed",
    );
  }

  if (!response.ok) {
    throw createSunoApiError(response, payload, input.phase);
  }
  if (payload === undefined || typeof payload === "string") {
    throw new ProviderRequestError(502, "sunoapi returned invalid JSON", payload);
  }

  const code = optionalNumber(optionalRecord(payload)?.code);
  if (code !== undefined && code !== 200) {
    throw createSunoApiBusinessError(payload, input.phase);
  }

  return payload;
}

function buildSunoApiUrl(path: string, query: Record<string, string | number | boolean | undefined> = {}): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${sunoApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildSunoApiHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
    ...(hasBody ? { "content-type": "application/json" } : {}),
  };
}

async function readSunoApiPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readSunoApiData(payload: unknown): unknown {
  const root = optionalRecord(payload);
  if (!root || !Object.hasOwn(root, "data")) {
    throw new ProviderRequestError(502, "sunoapi response did not include data", payload);
  }
  return root.data;
}

function readSunoApiObjectData(payload: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(readSunoApiData(payload));
  if (!object) {
    throw new ProviderRequestError(502, `${label} response did not include object data`, payload);
  }
  return object;
}

function createSunoApiBusinessError(payload: unknown, phase: SunoApiRequestPhase): ProviderRequestError {
  const message = extractSunoApiErrorMessage(payload) ?? "sunoapi request failed";
  return new ProviderRequestError(phase === "validate" ? 400 : 502, message, payload);
}

function createSunoApiError(response: Response, payload: unknown, phase: SunoApiRequestPhase): ProviderRequestError {
  const message = extractSunoApiErrorMessage(payload) ?? response.statusText ?? "sunoapi request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if ((response.status === 401 || response.status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if ((response.status === 401 || response.status === 403) && phase === "execute") {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractSunoApiErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const root = optionalRecord(payload);
  if (!root) {
    return undefined;
  }
  const error = optionalRecord(root.error);
  return (
    optionalString(root.msg) ??
    optionalString(root.message) ??
    optionalString(error?.message) ??
    optionalString(root.error)
  );
}

function requireString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}
