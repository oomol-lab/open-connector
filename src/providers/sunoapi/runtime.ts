import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

export const sunoApiBaseUrl = "https://api.sunoapi.org";

type SunoApiActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type SunoApiActionHandler = (input: Record<string, unknown>, context: SunoApiActionContext) => Promise<unknown>;

export const sunoapiActionHandlers: ProviderActionHandlers<"sunoapi", SunoApiActionHandler> = {
  get_remaining_credits(_input, context) {
    return getRemainingCredits(context);
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
  const credits = await getRemainingCredits({ apiKey, fetcher, signal });
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

async function getRemainingCredits(context: SunoApiActionContext): Promise<{ credits: number }> {
  const payload = await requestSunoApiJson({
    ...context,
    method: "GET",
    path: "/api/v1/generate/credit",
  });
  const data = readSunoApiData(payload);
  const credits = optionalNumber(data);
  if (credits === undefined) {
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
      taskId: requiredInputString(input.taskId, "taskId"),
    },
  });
  return readSunoApiObjectData(payload, label);
}

async function submitSunoApiTask(
  input: Record<string, unknown>,
  context: SunoApiActionContext,
  path: string,
  label: string,
): Promise<{ taskId: string }> {
  if (input.callBackUrl === "") {
    throw new ProviderRequestError(
      400,
      "An empty callBackUrl requires a Marketplace connection; supply a callback URL for a SunoAPI API key connection",
    );
  }
  const payload = await requestSunoApiJson({
    ...context,
    method: "POST",
    path,
    body: input,
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
    body: input,
  });
  return readSunoApiObjectData(payload, label);
}

interface SunoApiRequest {
  apiKey: string;
  fetcher: ProviderFetch;
  method: "GET" | "POST";
  path: string;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}

async function requestSunoApiJson(input: SunoApiRequest): Promise<unknown> {
  return runProviderRequest({ label: "sunoapi", signal: input.signal }, async (signal) => {
    const response = await input.fetcher(buildSunoApiUrl(input.path, input.query), {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
        "content-type": "application/json",
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
    const code = optionalNumber(optionalRecord(payload)?.code);
    if (!response.ok || (code !== undefined && code !== 200)) {
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `${extractSunoApiErrorMessage(payload) ?? response.statusText ?? "sunoapi request failed"}${code === undefined ? ` (HTTP ${response.status})` : ` (SunoAPI code ${code}, HTTP ${response.status})`}`,
        payload,
      );
    }
    if (typeof payload === "string") {
      throw new ProviderRequestError(502, "sunoapi returned invalid JSON", payload);
    }
    return payload;
  });
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
