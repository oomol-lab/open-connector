import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

const aivoovApiBaseUrl = "https://aivoov.com/api/v8";

type AivoovActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const aivoovActionHandlers: ProviderActionHandlers<"aivoov", AivoovActionHandler> = {
  list_voices(input, context) {
    return listVoices(input, context);
  },
  create_audio(input, context) {
    return createAudio(input, context);
  },
};

export async function validateAivoovCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const response = await fetcher(`${aivoovApiBaseUrl}/voices`, {
    method: "GET",
    headers: aivoovHeaders(apiKey),
    signal,
  });

  await assertAivoovResponse(response, "validate");
  const payload = await readJson(response);
  const voices = Array.isArray(payload) ? payload : [];

  return {
    profile: {
      displayName: "AiVOOV API Key",
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/voices",
      voicesCount: voices.length,
    },
  };
}

async function listVoices(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const url = new URL(`${aivoovApiBaseUrl}/voices`);
  const languageCode = optionalString(input.languageCode);
  if (languageCode) {
    url.searchParams.set("language_code", languageCode);
  }

  const response = await context.fetcher(url, {
    method: "GET",
    headers: aivoovHeaders(context.apiKey),
    signal: context.signal,
  });

  await assertAivoovResponse(response, "execute");
  return readJson(response);
}

async function createAudio(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const body = new URLSearchParams();

  for (const segment of readSegments(input.segments)) {
    body.append("voice_id[]", segment.voiceId);
    body.append("transcribe_text[]", segment.text);
    body.append("transcribe_ssml_pitch_rate[]", formatSsmlControl(segment.pitchRate));
    body.append("transcribe_ssml_spk_rate[]", formatSsmlControl(segment.speakingRate));
    body.append("transcribe_ssml_volume[]", formatSsmlControl(segment.volume));
  }

  const response = await context.fetcher(`${aivoovApiBaseUrl}/create`, {
    method: "POST",
    headers: {
      ...aivoovHeaders(context.apiKey),
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    signal: context.signal,
  });

  await assertAivoovResponse(response, "execute");
  return readJson(response);
}

interface AivoovSegment {
  voiceId: string;
  text: string;
  pitchRate: unknown;
  speakingRate: unknown;
  volume: unknown;
}

function readSegments(value: unknown): AivoovSegment[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, "segments must be a non-empty array");
  }

  return value.map((segment) => {
    if (!segment || typeof segment !== "object") {
      throw new ProviderRequestError(400, "segment must be an object");
    }

    const payload = segment as Record<string, unknown>;
    const voiceId = optionalString(payload.voiceId);
    const text = optionalString(payload.text);
    if (!voiceId || !text) {
      throw new ProviderRequestError(400, "segment.voiceId and segment.text are required");
    }

    return {
      voiceId,
      text,
      pitchRate: payload.pitchRate,
      speakingRate: payload.speakingRate,
      volume: payload.volume,
    };
  });
}

function formatSsmlControl(value: unknown): string {
  if (value === undefined || value === "default") {
    return "default";
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }
  throw new ProviderRequestError(400, "ssml controls must be integer or default");
}

function aivoovHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    accept: "application/json",
  };
}

async function assertAivoovResponse(response: Response, mode: "validate" | "execute"): Promise<void> {
  if (response.ok) {
    return;
  }

  const message = await readAivoovError(response);
  if (response.status === 429) {
    throw new ProviderRequestError(429, message);
  }
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, message);
  }
  if (mode === "execute" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(401, message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    throw new ProviderRequestError(400, message);
  }

  throw new ProviderRequestError(response.status, message);
}

async function readAivoovError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return `aivoov request failed with ${response.status}`;
  }

  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    return (
      optionalString(payload.message) ??
      optionalString(payload.error) ??
      `aivoov request failed with ${response.status}`
    );
  } catch {
    return text;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ProviderRequestError(502, "aivoov returned invalid JSON");
  }
}
