import type { HeygenActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

const heygenApiBaseUrl = "https://api.heygen.com";
const heygenOAuthApiBaseUrl = "https://api2.heygen.com";
const heygenUploadBaseUrl = "https://upload.heygen.com";

export interface HeygenAuth {
  apiBaseUrl: string;
  headerName: "Authorization" | "X-Api-Key";
  headerValue: string;
}

export interface HeygenActionContext {
  auth: HeygenAuth;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type HeygenActionHandler = (input: Record<string, unknown>, context: HeygenActionContext) => Promise<unknown>;
type HeygenRequestMode = "validate" | "execute";

interface HeygenRequestInput {
  auth: HeygenAuth;
  baseUrl?: string;
  path: string;
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  rawBody?: BodyInit;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export const heygenActionHandlers: Record<HeygenActionName, HeygenActionHandler> = {
  get_current_user(_input, context) {
    return heygenGetCurrentUser(context);
  },
  get_remaining_quota(_input, context) {
    return heygenGetRemainingQuota(context);
  },
  list_avatars(_input, context) {
    return heygenListAvatars(context);
  },
  get_avatar(input, context) {
    return heygenGetAvatar(input, context);
  },
  list_voices(_input, context) {
    return heygenListVoices(context);
  },
  list_templates(_input, context) {
    return heygenListTemplates(context);
  },
  get_template(input, context) {
    return heygenGetTemplate(input, context);
  },
  generate_video(input, context) {
    return heygenGenerateVideo(input, context);
  },
  generate_template_video(input, context) {
    return heygenGenerateTemplateVideo(input, context);
  },
  get_video_status(input, context) {
    return heygenGetVideoStatus(input, context);
  },
  get_shareable_video_url(input, context) {
    return heygenGetShareableVideoUrl(input, context);
  },
  upload_asset(input, context) {
    return heygenUploadAsset(input, context);
  },
  list_assets(input, context) {
    return heygenListAssets(input, context);
  },
  delete_asset(input, context) {
    return heygenDeleteAsset(input, context);
  },
  list_videos(input, context) {
    return heygenListVideos(input, context);
  },
  delete_video(input, context) {
    return heygenDeleteVideo(input, context);
  },
  list_folders(input, context) {
    return heygenListFolders(input, context);
  },
};

export async function validateHeygenCredential(
  auth: HeygenAuth,
  options: { fetcher: typeof fetch; signal?: AbortSignal },
  credential: { grantedScopes?: string[] } = {},
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const data = await heygenRequest<Record<string, unknown>>(
    {
      auth,
      fetcher: options.fetcher,
      signal: options.signal,
      path: "/v1/user/me",
    },
    "validate",
  );

  const label = readAccountLabel(data);
  return {
    profile: {
      accountId:
        optionalString(data.email) ??
        optionalString(data.username) ??
        (auth.headerName === "Authorization" ? "oauth2" : "api_key"),
      displayName: label,
    },
    grantedScopes: credential.grantedScopes ?? [],
    metadata: {
      apiBaseUrl: auth.apiBaseUrl,
      authHeaderName: auth.headerName,
      validationEndpoint: "/v1/user/me",
    },
  };
}

export function createHeygenApiKeyAuth(apiKey: string): HeygenAuth {
  return {
    apiBaseUrl: heygenApiBaseUrl,
    headerName: "X-Api-Key",
    headerValue: apiKey,
  };
}

export function createHeygenOAuthAuth(accessToken: string, tokenType: string): HeygenAuth {
  return {
    apiBaseUrl: heygenOAuthApiBaseUrl,
    headerName: "Authorization",
    headerValue: `${tokenType} ${accessToken}`,
  };
}

async function heygenGetCurrentUser(context: HeygenActionContext): Promise<unknown> {
  const data = await heygenRequest<Record<string, unknown>>(
    {
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/v1/user/me",
    },
    "execute",
  );

  return {
    user: data,
    raw: data,
  };
}

async function heygenGetRemainingQuota(context: HeygenActionContext): Promise<unknown> {
  const data = await heygenRequest<Record<string, unknown>>(
    {
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/v2/user/remaining_quota",
    },
    "execute",
  );

  return {
    quota: data,
    raw: data,
  };
}

async function heygenListAvatars(context: HeygenActionContext): Promise<unknown> {
  const data = await heygenRequest<Record<string, unknown>>(
    {
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/v2/avatars",
    },
    "execute",
  );

  return {
    avatars: readObjectArray(data.avatars),
    talkingPhotos: readObjectArray(data.talking_photos),
    raw: data,
  };
}

async function heygenGetAvatar(input: Record<string, unknown>, context: HeygenActionContext): Promise<unknown> {
  const avatarId = readInputString(input.avatarId, "avatarId");
  const data = await heygenRequest<Record<string, unknown>>(
    {
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
      path: `/v2/avatar/${encodeURIComponent(avatarId)}/details`,
    },
    "execute",
  );

  return {
    avatar: data,
    raw: data,
  };
}

async function heygenListVoices(context: HeygenActionContext): Promise<unknown> {
  const data = await heygenRequest<Record<string, unknown>>(
    {
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/v2/voices",
    },
    "execute",
  );

  return {
    voices: readObjectArray(data.voices),
    totalCount: optionalInteger(data.total_count) ?? null,
    raw: data,
  };
}

async function heygenListTemplates(context: HeygenActionContext): Promise<unknown> {
  const data = await heygenRequest<Record<string, unknown>>(
    {
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/v2/templates",
    },
    "execute",
  );

  return {
    templates: readObjectArray(data.templates),
    raw: data,
  };
}

async function heygenGetTemplate(input: Record<string, unknown>, context: HeygenActionContext): Promise<unknown> {
  const templateId = readInputString(input.templateId, "templateId");
  const data = await heygenRequest<Record<string, unknown>>(
    {
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
      path: `/v3/template/${encodeURIComponent(templateId)}`,
    },
    "execute",
  );

  return {
    template: data,
    raw: data,
  };
}

async function heygenGenerateVideo(input: Record<string, unknown>, context: HeygenActionContext): Promise<unknown> {
  const data = await heygenRequest<Record<string, unknown>>(
    {
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/v2/video/generate",
      method: "POST",
      body: compactObject({
        video_inputs: readVideoInputs(input.videoInputs),
        title: input.title,
        test: input.test,
        caption: input.caption,
        callback_id: input.callbackId,
        callback_url: input.callbackUrl,
        aspect_ratio: input.aspectRatio,
        dimension: input.dimension,
        folder_id: input.folderId,
      }),
    },
    "execute",
  );

  return normalizeVideoIdOutput(data);
}

async function heygenGenerateTemplateVideo(
  input: Record<string, unknown>,
  context: HeygenActionContext,
): Promise<unknown> {
  const templateId = readInputString(input.templateId, "templateId");
  const data = await heygenRequest<Record<string, unknown>>(
    {
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
      path: `/v2/template/${encodeURIComponent(templateId)}/generate`,
      method: "POST",
      body: compactObject({
        title: input.title,
        test: input.test,
        caption: input.caption,
        dimension: input.dimension,
        include_gif: input.includeGif,
        enable_sharing: input.enableSharing,
        folder_id: input.folderId,
        brand_voice_id: input.brandVoiceId,
        callback_url: input.callbackUrl,
        keep_text_vertically_centered: input.keepTextVerticallyCentered,
        variables: input.variables,
      }),
    },
    "execute",
  );

  return normalizeVideoIdOutput(data);
}

async function heygenGetVideoStatus(input: Record<string, unknown>, context: HeygenActionContext): Promise<unknown> {
  const data = await heygenRequest<Record<string, unknown>>(
    {
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/v1/video_status.get",
      query: {
        video_id: input.videoId,
      },
    },
    "execute",
  );

  return {
    videoId: optionalString(data.id) ?? optionalString(data.video_id) ?? null,
    status: optionalString(data.status) ?? null,
    videoUrl: optionalString(data.video_url) ?? null,
    thumbnailUrl: optionalString(data.thumbnail_url) ?? null,
    duration: typeof data.duration === "number" ? data.duration : null,
    raw: data,
  };
}

async function heygenGetShareableVideoUrl(
  input: Record<string, unknown>,
  context: HeygenActionContext,
): Promise<unknown> {
  const data = await heygenRequest<unknown>(
    {
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/v1/video/share",
      method: "POST",
      body: {
        video_id: input.videoId,
      },
    },
    "execute",
  );

  return {
    shareableUrl: optionalString(data) ?? null,
    raw: data,
  };
}

async function heygenUploadAsset(input: Record<string, unknown>, context: HeygenActionContext): Promise<unknown> {
  const data = await heygenRequest<Record<string, unknown>>(
    {
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
      baseUrl: context.auth.headerName === "Authorization" ? context.auth.apiBaseUrl : heygenUploadBaseUrl,
      path: "/v1/asset",
      method: "POST",
      rawBody: toArrayBuffer(Buffer.from(readInputString(input.contentBase64, "contentBase64"), "base64")),
      headers: {
        "content-type": readInputString(input.mimeType, "mimeType"),
      },
    },
    "execute",
  );

  const assetId = optionalString(data.id) ?? optionalString(data.asset_id);
  if (!assetId) {
    throw new ProviderRequestError(502, "HeyGen response did not include asset id", data);
  }

  return {
    assetId,
    url: optionalString(data.url) ?? null,
    asset: data,
    raw: data,
  };
}

async function heygenListAssets(input: Record<string, unknown>, context: HeygenActionContext): Promise<unknown> {
  const data = await heygenRequest<Record<string, unknown>>(
    {
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/v1/asset/list",
      query: {
        limit: input.limit,
        token: input.token,
        file_type: input.fileType,
        folder_id: input.folderId,
      },
    },
    "execute",
  );

  return {
    assets: readObjectArray(data.assets),
    totalCount: optionalInteger(data.total) ?? null,
    nextToken: optionalString(data.token) ?? null,
    raw: data,
  };
}

async function heygenDeleteAsset(input: Record<string, unknown>, context: HeygenActionContext): Promise<unknown> {
  const assetId = readInputString(input.assetId, "assetId");
  const data = await heygenRequest<Record<string, unknown>>(
    {
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
      path: `/v1/asset/${encodeURIComponent(assetId)}/delete`,
      method: "POST",
    },
    "execute",
  );

  return {
    assetId: optionalString(data.id) ?? assetId,
    deleted: true,
    asset: optionalRecord(data) ?? null,
    raw: data,
  };
}

async function heygenListVideos(input: Record<string, unknown>, context: HeygenActionContext): Promise<unknown> {
  const data = await heygenRequest<Record<string, unknown>>(
    {
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/v1/video.list",
      query: {
        limit: input.limit,
        token: input.token,
        folder_id: input.folderId,
        title: input.title,
      },
    },
    "execute",
  );

  return {
    videos: readObjectArray(data.videos),
    totalCount: optionalInteger(data.total) ?? null,
    nextToken: optionalString(data.token) ?? null,
    raw: data,
  };
}

async function heygenDeleteVideo(input: Record<string, unknown>, context: HeygenActionContext): Promise<unknown> {
  const videoId = readInputString(input.videoId, "videoId");
  const data = await heygenRequest<Record<string, unknown>>(
    {
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/v1/video.delete",
      method: "DELETE",
      query: {
        video_id: videoId,
        type: input.type,
      },
    },
    "execute",
  );
  const deletedVideoIds = readStringArray(data.Deleted ?? data.deleted);
  const failedVideoIds = readStringArray(data.Failed ?? data.failed);

  return {
    videoId,
    deleted: deletedVideoIds.includes(videoId) || (deletedVideoIds.length === 0 && !failedVideoIds.includes(videoId)),
    deletedVideoIds,
    failedVideoIds,
    raw: data,
  };
}

async function heygenListFolders(input: Record<string, unknown>, context: HeygenActionContext): Promise<unknown> {
  const data = await heygenRequest<Record<string, unknown>>(
    {
      auth: context.auth,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/v1/folders",
      query: {
        limit: input.limit,
        parent_id: input.parentId,
        name_filter: input.nameFilter,
        is_trash: input.isTrash,
        token: input.token,
      },
    },
    "execute",
  );

  return {
    folders: readObjectArray(data.folders),
    totalCount: optionalInteger(data.total) ?? null,
    nextToken: optionalString(data.token) ?? null,
    raw: data,
  };
}

async function heygenRequest<T>(
  input: HeygenRequestInput & { fetcher: typeof fetch },
  mode: HeygenRequestMode,
): Promise<T> {
  const url = new URL(input.path, input.baseUrl ?? input.auth.apiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        [input.auth.headerName]: input.auth.headerValue,
        ...(input.body ? { "content-type": "application/json" } : {}),
        ...input.headers,
      },
      body: input.rawBody ?? (input.body ? JSON.stringify(input.body) : undefined),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `HeyGen request failed: ${error.message}` : "HeyGen request failed",
    );
  }

  const payload = await readJson(response);
  if (!response.ok) {
    throw createHeygenResponseError(response, payload, mode);
  }

  return unwrapHeygenData(payload) as T;
}

function readVideoInputs(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "videoInputs must be an array");
  }

  return value.map((item) => {
    const input = readInputObject(item);
    return compactObject({
      character: normalizeCharacter(input.character),
      voice: normalizeVoice(input.voice),
      background: input.background === undefined ? undefined : normalizeBackground(input.background),
    });
  });
}

function normalizeCharacter(value: unknown): Record<string, unknown> {
  const character = readInputObject(value);
  return compactObject({
    type: character.type,
    avatar_id: character.avatarId,
    avatar_style: character.avatarStyle,
    talking_photo_id: character.talkingPhotoId,
    scale: character.scale,
  });
}

function normalizeVoice(value: unknown): Record<string, unknown> {
  const voice = readInputObject(value);
  return compactObject({
    type: voice.type,
    voice_id: voice.voiceId,
    input_text: voice.inputText,
    audio_url: voice.audioUrl,
    audio_asset_id: voice.audioAssetId,
    speed: voice.speed,
    pitch: voice.pitch,
  });
}

function normalizeBackground(value: unknown): Record<string, unknown> {
  const background = readInputObject(value);
  return compactObject({
    type: background.type,
    value: background.value,
    url: background.url,
    image_asset_id: background.imageAssetId,
    video_asset_id: background.videoAssetId,
    fit: background.fit,
    play_style: background.playStyle,
  });
}

function normalizeVideoIdOutput(data: Record<string, unknown>): { videoId: string; raw: Record<string, unknown> } {
  const videoId = optionalString(data.video_id);
  if (!videoId) {
    throw new ProviderRequestError(502, "HeyGen response did not include video_id", data);
  }

  return {
    videoId,
    raw: data,
  };
}

function unwrapHeygenData(payload: unknown): unknown {
  const object = optionalRecord(payload);
  if (object && "data" in object) {
    return object.data;
  }

  return payload;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createHeygenResponseError(
  response: Response,
  payload: unknown,
  mode: HeygenRequestMode,
): ProviderRequestError {
  const message = readHeygenErrorMessage(payload) ?? `HeyGen request failed with ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (mode === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function readHeygenErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.length > 0) {
    return payload;
  }
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  return (
    optionalString(object.message) ??
    optionalString(object.error) ??
    optionalString(optionalRecord(object.error)?.message)
  );
}

function readAccountLabel(data: Record<string, unknown>): string {
  return optionalString(data.email) ?? optionalString(data.username) ?? optionalString(data.name) ?? "HeyGen API Key";
}

function readInputObject(value: unknown): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(400, "object input is required", value);
  }
  return object;
}

function readInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const object = optionalRecord(item);
    return object ? [object] : [];
  });
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}
