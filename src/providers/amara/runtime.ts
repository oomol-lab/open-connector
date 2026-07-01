import type { CredentialValidationResult } from "../../core/types.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

export const amaraApiBaseUrl = "https://amara.org/api";

type JsonRecord = Record<string, unknown>;

type AmaraRequestInput = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  responseType?: "json" | "text" | "empty";
};

interface AmaraActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type AmaraActionHandler = (input: Record<string, unknown>, context: AmaraActionContext) => Promise<unknown>;

export const amaraActionHandlers: Record<string, AmaraActionHandler> = {
  list_languages(_input, context) {
    return amaraListAvailableLanguages(context);
  },
  list_available_languages(_input, context) {
    return amaraListAvailableLanguages(context);
  },
  list_videos(input, context) {
    return amaraListVideos(input, context);
  },
  get_video(input, context) {
    return amaraViewVideoDetails(input, context);
  },
  view_video_details(input, context) {
    return amaraViewVideoDetails(input, context);
  },
  create_video(input, context) {
    return amaraCreateVideo(input, context);
  },
  update_video(input, context) {
    return amaraUpdateVideo(input, context);
  },
  list_video_activity(input, context) {
    return amaraListVideoActivity(input, context);
  },
  list_video_urls(input, context) {
    return amaraListVideoUrls(input, context);
  },
  get_video_url(input, context) {
    return amaraGetVideoUrl(input, context);
  },
  add_video_url(input, context) {
    return amaraAddVideoUrl(input, context);
  },
  delete_video_url(input, context) {
    return amaraDeleteVideoUrl(input, context);
  },
  make_video_url_primary(input, context) {
    return amaraMakeVideoUrlPrimary(input, context);
  },
  get_video_url_details(input, context) {
    return amaraGetVideoUrlDetails(input, context);
  },
  list_subtitle_languages(input, context) {
    return amaraListSubtitleLanguages(input, context);
  },
  create_subtitle_language(input, context) {
    return amaraCreateSubtitleLanguage(input, context);
  },
  get_subtitle_language_details(input, context) {
    return amaraGetSubtitleLanguageDetails(input, context);
  },
  update_subtitle_language(input, context) {
    return amaraUpdateSubtitleLanguage(input, context);
  },
  fetch_subtitles_data(input, context) {
    return amaraFetchSubtitlesData(input, context);
  },
  create_subtitles(input, context) {
    return amaraCreateSubtitles(input, context);
  },
  list_subtitle_actions(input, context) {
    return amaraListSubtitleActions(input, context);
  },
  perform_subtitle_action(input, context) {
    return amaraPerformSubtitleAction(input, context);
  },
  list_subtitle_notes(input, context) {
    return amaraListSubtitleNotes(input, context);
  },
  add_subtitle_note(input, context) {
    return amaraAddSubtitleNote(input, context);
  },
  list_activity(input, context) {
    return amaraListActivity(input, context);
  },
  get_activity(input, context) {
    return amaraGetActivity(input, context);
  },
  get_user(input, context) {
    return amaraGetUser(input, context);
  },
  get_user_data(input, context) {
    return amaraGetUserData(input, context);
  },
  get_user_activity(input, context) {
    return amaraGetUserActivity(input, context);
  },
  list_teams(input, context) {
    return amaraListTeams(input, context);
  },
  get_team_details(input, context) {
    return amaraGetTeamDetails(input, context);
  },
  get_team_languages(input, context) {
    return amaraGetTeamLanguages(input, context);
  },
  send_message(input, context) {
    return amaraSendMessage(input, context);
  },
};

export async function validateAmaraCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = {
    apiKey: requireString(input, "apiKey"),
    fetcher,
    signal,
  };
  const payload = await amaraRequestJson<{ languages?: Record<string, string> }>(
    { path: "/languages/" },
    context,
    "validate",
  );

  return {
    profile: {
      accountId: "amara_api_key",
      displayName: "Amara API Key",
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/languages/",
      languageCount: Object.keys(payload.languages ?? {}).length,
    },
  };
}

async function amaraListAvailableLanguages(context: AmaraActionContext) {
  const payload = await amaraRequestJson<{ languages?: Record<string, string> }>(
    { path: "/languages/" },
    context,
    "execute",
  );

  return {
    languages: Object.entries(payload.languages ?? {}).map(([code, name]) => ({
      code,
      name,
    })),
  };
}

async function amaraListVideos(input: JsonRecord, context: AmaraActionContext) {
  const payload = await amaraRequestJson<{ meta?: JsonRecord; objects?: JsonRecord[] }>(
    {
      path: "/videos/",
      query: compactObject({
        sort: optionalString(input.sort),
        team: optionalString(input.team),
        owner: optionalString(input.owner),
        project: optionalString(input.project),
        language: optionalString(input.language),
        archive: optionalBoolean(input.archive),
        video_id: optionalString(input.videoId),
        video_url: optionalString(input.videoUrl),
        offset: optionalInteger(input.offset),
        limit: optionalInteger(input.limit),
      }),
    },
    context,
    "execute",
  );

  return {
    videos: (payload.objects ?? []).map((video) => normalizeVideoSummary(video)),
    pagination: normalizePagination(payload.meta),
  };
}

async function amaraViewVideoDetails(input: JsonRecord, context: AmaraActionContext) {
  const videoId = requireString(input, "videoId");
  const video = await amaraRequestJson<JsonRecord>(
    { path: `/videos/${videoId}/` },
    context,
    "execute",
  );

  return { video };
}

async function amaraCreateVideo(input: JsonRecord, context: AmaraActionContext) {
  const video = await amaraRequestJson<JsonRecord>(
    {
      method: "POST",
      path: "/videos/",
      body: compactObject({
        video_url: requireString(input, "videoUrl"),
        title: requireString(input, "title"),
        team: optionalString(input.team),
        project: optionalString(input.project),
        duration: optionalInteger(input.duration),
        metadata: optionalStringMap(input.metadata),
        thumbnail: optionalString(input.thumbnail),
        description: optionalString(input.description),
        primary_audio_language_code: optionalString(input.primaryAudioLanguageCode),
      }),
    },
    context,
    "execute",
  );

  return { video };
}

async function amaraUpdateVideo(input: JsonRecord, context: AmaraActionContext) {
  const videoId = requireString(input, "videoId");
  const video = await amaraRequestJson<JsonRecord>(
    {
      method: "PUT",
      path: `/videos/${videoId}/`,
      body: compactObject({
        team: optionalString(input.team),
        title: optionalString(input.title),
        project: optionalString(input.project),
        duration: optionalInteger(input.duration),
        metadata: optionalStringMap(input.metadata),
        thumbnail: optionalString(input.thumbnail),
        description: optionalString(input.description),
        primary_audio_language_code: optionalString(input.primaryAudioLanguageCode),
      }),
    },
    context,
    "execute",
  );

  return { video };
}

async function amaraListVideoActivity(input: JsonRecord, context: AmaraActionContext) {
  const videoId = requireString(input, "videoId");
  return amaraListResponse(
    {
      path: `/videos/${videoId}/activity/`,
      query: compactObject({
        offset: optionalInteger(input.offset),
        limit: optionalInteger(input.limit),
      }),
    },
    context,
    "activities",
    normalizeActivity,
  );
}

async function amaraListVideoUrls(input: JsonRecord, context: AmaraActionContext) {
  const videoId = requireString(input, "videoId");
  return amaraListResponse(
    {
      path: `/videos/${videoId}/urls/`,
      query: compactObject({
        offset: optionalInteger(input.offset),
        limit: optionalInteger(input.limit),
      }),
    },
    context,
    "urls",
    normalizeVideoUrl,
  );
}

async function amaraGetVideoUrl(input: JsonRecord, context: AmaraActionContext) {
  const videoId = requireString(input, "videoId");
  const urlId = requireInteger(input, "urlId");
  const payload = await amaraRequestJson<JsonRecord>(
    { path: `/videos/${videoId}/urls/${urlId}/` },
    context,
    "execute",
  );
  return {
    videoUrl: normalizeVideoUrl(payload),
  };
}

async function amaraAddVideoUrl(input: JsonRecord, context: AmaraActionContext) {
  const videoId = requireString(input, "videoId");
  const payload = await amaraRequestJson<JsonRecord>(
    {
      method: "POST",
      path: `/videos/${videoId}/urls/`,
      body: compactObject({
        url: requireString(input, "url"),
        primary: optionalBoolean(input.primary),
      }),
    },
    context,
    "execute",
  );
  return {
    videoUrl: normalizeVideoUrl(payload),
  };
}

async function amaraDeleteVideoUrl(input: JsonRecord, context: AmaraActionContext) {
  const videoId = requireString(input, "videoId");
  const urlId = requireInteger(input, "urlId");
  const response = await amaraRequest(
    {
      method: "DELETE",
      path: `/videos/${videoId}/urls/${urlId}/`,
      responseType: "empty",
    },
    context,
    "execute",
  );

  if (response === null) {
    return {
      success: true,
      message: "Video URL deleted successfully",
    };
  }

  return {
    success: true,
    message: "Video URL deleted successfully",
  };
}

async function amaraMakeVideoUrlPrimary(input: JsonRecord, context: AmaraActionContext) {
  const videoId = requireString(input, "videoId");
  const urlId = requireInteger(input, "urlId");
  const payload = await amaraRequestJson<JsonRecord>(
    {
      method: "PUT",
      path: `/videos/${videoId}/urls/${urlId}/`,
      body: {
        primary: requireBoolean(input, "primary"),
      },
    },
    context,
    "execute",
  );
  return {
    videoUrl: normalizeVideoUrl(payload),
  };
}

async function amaraGetVideoUrlDetails(input: JsonRecord, context: AmaraActionContext) {
  const payload = await amaraRequestJson<JsonRecord>(
    {
      path: "/videos/url/",
      query: {
        url: requireString(input, "url"),
      },
    },
    context,
    "execute",
  );
  return {
    videoUrl: payload,
  };
}

async function amaraListSubtitleLanguages(
  input: JsonRecord,
  context: AmaraActionContext,
) {
  const videoId = requireString(input, "videoId");
  return amaraListResponse(
    {
      path: `/videos/${videoId}/languages/`,
    },
    context,
    "languages",
    normalizeSubtitleLanguage,
  );
}

async function amaraCreateSubtitleLanguage(
  input: JsonRecord,
  context: AmaraActionContext,
) {
  const videoId = requireString(input, "videoId");
  const language = await amaraRequestJson<JsonRecord>(
    {
      method: "POST",
      path: `/videos/${videoId}/languages/`,
      body: {
        language: requireString(input, "language"),
      },
    },
    context,
    "execute",
  );
  return { language };
}

async function amaraGetSubtitleLanguageDetails(
  input: JsonRecord,
  context: AmaraActionContext,
) {
  const videoId = requireString(input, "videoId");
  const languageCode = requireString(input, "languageCode");
  const language = await amaraRequestJson<JsonRecord>(
    { path: `/videos/${videoId}/languages/${languageCode}/` },
    context,
    "execute",
  );
  return { language };
}

async function amaraUpdateSubtitleLanguage(
  input: JsonRecord,
  context: AmaraActionContext,
) {
  const videoId = requireString(input, "videoId");
  const languageCode = requireString(input, "languageCode");
  const language = await amaraRequestJson<JsonRecord>(
    {
      method: "PUT",
      path: `/videos/${videoId}/languages/${languageCode}/`,
      body: compactObject({
        soft_limit_cpl: optionalInteger(input.softLimitCpl),
        soft_limit_cps: optionalInteger(input.softLimitCps),
        soft_limit_lines: optionalInteger(input.softLimitLines),
        subtitles_complete: optionalBoolean(input.subtitlesComplete),
        soft_limit_max_duration: optionalInteger(input.softLimitMaxDuration),
        soft_limit_min_duration: optionalInteger(input.softLimitMinDuration),
        is_primary_audio_language: optionalBoolean(input.isPrimaryAudioLanguage),
      }),
    },
    context,
    "execute",
  );
  return { language };
}

async function amaraFetchSubtitlesData(input: JsonRecord, context: AmaraActionContext) {
  const videoId = requireString(input, "videoId");
  const languageCode = requireString(input, "languageCode");
  const format = optionalString(input.format) ?? "json";
  if (!["json", "srt", "vtt"].includes(format)) {
    throw new ProviderRequestError(400, "format must be one of json, srt, or vtt");
  }

  if (format === "json") {
    const payload = await amaraRequestJson<unknown>(
      {
        path: `/videos/${videoId}/languages/${languageCode}/subtitles/`,
        query: { format },
      },
      context,
      "execute",
    );
    return {
      videoId,
      language: languageCode,
      format,
      subtitles: normalizeSubtitleSegments(payload),
    };
  }

  const subtitlesText = await amaraRequestText(
    {
      path: `/videos/${videoId}/languages/${languageCode}/subtitles/`,
      query: { format },
    },
    context,
    "execute",
  );
  return {
    videoId,
    language: languageCode,
    format,
    subtitlesText,
  };
}

async function amaraCreateSubtitles(input: JsonRecord, context: AmaraActionContext) {
  const videoId = requireString(input, "videoId");
  const languageCode = requireString(input, "languageCode");
  const subtitles = optionalString(input.subtitles);
  const subtitlesUrl = optionalString(input.subtitlesUrl);
  if ((subtitles ? 1 : 0) + (subtitlesUrl ? 1 : 0) !== 1) {
    throw new ProviderRequestError(400, "exactly one of subtitles or subtitlesUrl is required");
  }

  const subtitleVersion = await amaraRequestJson<JsonRecord>(
    {
      method: "POST",
      path: `/videos/${videoId}/languages/${languageCode}/subtitles/`,
      body: compactObject({
        sub_format: requireString(input, "subFormat"),
        subtitles,
        subtitles_url: subtitlesUrl,
        title: optionalString(input.title),
        action: optionalString(input.action),
        metadata: optionalRecord(input.metadata),
        description: optionalString(input.description),
      }),
    },
    context,
    "execute",
  );
  return { subtitleVersion };
}

async function amaraListSubtitleActions(input: JsonRecord, context: AmaraActionContext) {
  const videoId = requireString(input, "videoId");
  const languageCode = requireString(input, "languageCode");
  const payload = await amaraRequestJson<{ actions?: JsonRecord[] }>(
    { path: `/videos/${videoId}/languages/${languageCode}/actions/` },
    context,
    "execute",
  );
  return {
    actions: (payload.actions ?? []).map((item) => ({
      action: optionalString(item.action) ?? "",
      label: optionalString(item.label) ?? "",
      completed:
        typeof item.completed === "boolean"
          ? item.completed
          : item.completed === null
            ? null
            : undefined,
    })),
  };
}

async function amaraPerformSubtitleAction(
  input: JsonRecord,
  context: AmaraActionContext,
) {
  const videoId = requireString(input, "videoId");
  const languageCode = requireString(input, "languageCode");
  const payload = await amaraRequestJson<JsonRecord>(
    {
      method: "POST",
      path: `/videos/${videoId}/languages/${languageCode}/actions/`,
      body: {
        action: requireString(input, "action"),
      },
    },
    context,
    "execute",
  );
  return {
    success: typeof payload.success === "boolean" ? payload.success : true,
    message: optionalString(payload.message) ?? "Subtitle action completed",
  };
}

async function amaraListSubtitleNotes(input: JsonRecord, context: AmaraActionContext) {
  const videoId = requireString(input, "videoId");
  const languageCode = requireString(input, "languageCode");
  const payload = await amaraRequestJson<{ objects?: JsonRecord[] }>(
    { path: `/videos/${videoId}/languages/${languageCode}/notes/` },
    context,
    "execute",
  );
  return {
    notes: (payload.objects ?? []).map((note) => normalizeSubtitleNote(note)),
  };
}

async function amaraAddSubtitleNote(input: JsonRecord, context: AmaraActionContext) {
  const videoId = requireString(input, "videoId");
  const languageCode = requireString(input, "languageCode");
  const note = await amaraRequestJson<JsonRecord>(
    {
      method: "POST",
      path: `/videos/${videoId}/languages/${languageCode}/notes/`,
      body: {
        body: requireString(input, "body"),
      },
    },
    context,
    "execute",
  );
  return {
    note: normalizeSubtitleNote(note),
  };
}

async function amaraListActivity(input: JsonRecord, context: AmaraActionContext) {
  return amaraListResponse(
    {
      path: "/activity/",
      query: compactObject({
        team: optionalString(input.team),
        type: optionalInteger(input.type),
        after: optionalString(input.after),
        before: optionalString(input.before),
        limit: optionalInteger(input.limit),
        video: optionalString(input.video),
        offset: optionalInteger(input.offset),
        language: optionalString(input.language),
        team_activity: optionalBoolean(input.teamActivity),
      }),
    },
    context,
    "activities",
    normalizeActivity,
  );
}

async function amaraGetActivity(input: JsonRecord, context: AmaraActionContext) {
  const activityId = requireInteger(input, "activityId");
  const activity = await amaraRequestJson<JsonRecord>(
    { path: `/activity/${activityId}/` },
    context,
    "execute",
  );
  return { activity };
}

async function amaraGetUser(input: JsonRecord, context: AmaraActionContext) {
  const userIdentifier = requireString(input, "userIdentifier");
  const payload = await amaraRequestJson<JsonRecord>(
    { path: `/users/${userIdentifier}/` },
    context,
    "execute",
  );

  const providerAccountId = optionalString(payload.id);
  const username = optionalString(payload.username);
  if (!providerAccountId || !username) {
    throw new ProviderRequestError(502, "amara user payload is missing required fields");
  }

  return {
    user: normalizeUser(payload),
  };
}

async function amaraGetUserData(input: JsonRecord, context: AmaraActionContext) {
  const identifier = requireString(input, "identifier");
  const user = await amaraRequestJson<JsonRecord>(
    { path: `/users/${identifier}/` },
    context,
    "execute",
  );
  return { user };
}

async function amaraGetUserActivity(input: JsonRecord, context: AmaraActionContext) {
  const identifier = requireString(input, "identifier");
  return amaraListResponse(
    {
      path: `/users/${identifier}/activity/`,
      query: compactObject({
        offset: optionalInteger(input.offset),
        limit: optionalInteger(input.limit),
      }),
    },
    context,
    "activities",
    normalizeActivity,
  );
}

async function amaraListTeams(input: JsonRecord, context: AmaraActionContext) {
  return amaraListResponse(
    {
      path: "/teams/",
      query: compactObject({
        offset: optionalInteger(input.offset),
        limit: optionalInteger(input.limit),
      }),
    },
    context,
    "teams",
    normalizeTeam,
  );
}

async function amaraGetTeamDetails(input: JsonRecord, context: AmaraActionContext) {
  const slug = requireString(input, "slug");
  const team = await amaraRequestJson<JsonRecord>(
    { path: `/teams/${slug}/` },
    context,
    "execute",
  );
  return { team };
}

async function amaraGetTeamLanguages(input: JsonRecord, context: AmaraActionContext) {
  const slug = requireString(input, "slug");
  const payload = await amaraRequestJson<{ preferred?: unknown[]; blacklisted?: unknown[] }>(
    { path: `/teams/${slug}/languages/` },
    context,
    "execute",
  );
  return {
    preferred: asStringList(payload.preferred),
    blacklisted: asStringList(payload.blacklisted),
  };
}

async function amaraSendMessage(input: JsonRecord, context: AmaraActionContext) {
  const user = optionalString(input.user);
  const team = optionalString(input.team);
  if ((user ? 1 : 0) + (team ? 1 : 0) !== 1) {
    throw new ProviderRequestError(400, "exactly one of user or team is required");
  }

  const payload = await amaraRequestJson<JsonRecord>(
    {
      method: "POST",
      path: "/messages/",
      body: compactObject({
        subject: requireString(input, "subject"),
        content: requireString(input, "content"),
        user,
        team,
      }),
    },
    context,
    "execute",
  );

  return {
    success: typeof payload.success === "boolean" ? payload.success : true,
    message: optionalString(payload.message) ?? "Message sent successfully",
  };
}

async function amaraListResponse(
  input: Pick<AmaraRequestInput, "path" | "query">,
  context: AmaraActionContext,
  outputKey: string,
  normalizeItem: (value: JsonRecord) => unknown,
) {
  const payload = await amaraRequestJson<{ meta?: JsonRecord; objects?: JsonRecord[] }>(
    input,
    context,
    "execute",
  );

  return {
    [outputKey]: (payload.objects ?? []).map((item) => normalizeItem(item)),
    pagination: normalizePagination(payload.meta),
  };
}

async function amaraRequestJson<T>(
  input: AmaraRequestInput,
  context: AmaraActionContext,
  mode: "validate" | "execute",
) {
  const payload = await amaraRequest({ ...input, responseType: "json" }, context, mode);
  return payload as T;
}

async function amaraRequestText(
  input: AmaraRequestInput,
  context: AmaraActionContext,
  mode: "validate" | "execute",
) {
  const payload = await amaraRequest({ ...input, responseType: "text" }, context, mode);
  return String(payload ?? "");
}

async function amaraRequest(
  input: AmaraRequestInput,
  context: AmaraActionContext,
  mode: "validate" | "execute",
) {
  const url = buildAmaraUrl(input.path, input.query);
  const headers: Record<string, string> = {
    accept: input.responseType === "text" ? "text/plain, application/json" : "application/json",
    "x-api-key": context.apiKey,
  };
  if (input.body) {
    headers["content-type"] = "application/json";
  }

  const response = await context.fetcher(url, {
    method: input.method ?? "GET",
    headers,
    body: input.body ? JSON.stringify(input.body) : undefined,
    signal: context.signal,
  });

  await assertAmaraResponse(response, mode);

  if (input.responseType === "empty" || response.status === 204) {
    return null;
  }
  if (input.responseType === "text") {
    return response.text();
  }
  return response.json();
}

function buildAmaraUrl(
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
) {
  const url = new URL(`${amaraApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function normalizeVideoSummary(video: JsonRecord) {
  return {
    id: optionalString(video.id) ?? "",
    title: optionalString(video.title),
    description: optionalString(video.description) ?? null,
    team: extractTeamSlug(video.team),
    project: optionalString(video.project) ?? null,
    primaryAudioLanguageCode: optionalString(video.primary_audio_language_code) ?? null,
    duration: typeof video.duration === "number" ? video.duration : undefined,
    created: optionalString(video.created),
    allUrls: Array.isArray(video.all_urls) ? video.all_urls.map((item) => String(item)) : undefined,
  };
}

function normalizeUser(user: JsonRecord) {
  return {
    id: optionalString(user.id) ?? "",
    username: optionalString(user.username) ?? "",
    fullName: optionalString(user.full_name) ?? null,
    displayName:
      optionalString(user.display_name) ??
      optionalString(user.full_name) ??
      optionalString(user.username) ??
      null,
    isActive: typeof user.is_active === "boolean" ? user.is_active : undefined,
  };
}

function normalizeTeam(team: JsonRecord) {
  return {
    slug: optionalString(team.slug) ?? "",
    name: optionalString(team.name),
    description: optionalString(team.description) ?? null,
    teamVisibility: optionalString(team.team_visibility) ?? null,
    videoVisibility: optionalString(team.video_visibility) ?? null,
  };
}

function normalizeActivity(activity: JsonRecord) {
  return {
    id: typeof activity.id === "number" ? activity.id : undefined,
    created: optionalString(activity.created),
    date: optionalString(activity.date),
    type:
      typeof activity.type === "number" ? activity.type : (optionalString(activity.type) ?? ""),
    typeName: optionalString(activity.type_name) ?? null,
    video: optionalString(activity.video) ?? null,
    language: optionalString(activity.language) ?? null,
  };
}

function normalizeSubtitleLanguage(language: JsonRecord) {
  return {
    languageCode: optionalString(language.language_code) ?? "",
    name: optionalString(language.name) ?? "",
    subtitleCount:
      typeof language.subtitle_count === "number" ? language.subtitle_count : undefined,
    published: typeof language.published === "boolean" ? language.published : undefined,
    subtitlesComplete:
      typeof language.subtitles_complete === "boolean" ? language.subtitles_complete : undefined,
    isPrimaryAudioLanguage:
      typeof language.is_primary_audio_language === "boolean"
        ? language.is_primary_audio_language
        : undefined,
  };
}

function normalizeVideoUrl(url: JsonRecord) {
  return {
    id: typeof url.id === "number" ? url.id : 0,
    url: optionalString(url.url) ?? "",
    primary: typeof url.primary === "boolean" ? url.primary : false,
    original: typeof url.original === "boolean" ? url.original : undefined,
    type: optionalString(url.type),
    resourceUri: optionalString(url.resource_uri),
  };
}

function normalizeSubtitleNote(note: JsonRecord) {
  return {
    body: optionalString(note.body) ?? "",
    created: optionalString(note.created) ?? "",
    user: optionalRecord(note.user) ?? {},
  };
}

function normalizeSubtitleSegments(payload: unknown) {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.map((item) => {
    const record =
      item && typeof item === "object" && !Array.isArray(item) ? (item as JsonRecord) : {};
    return {
      start: typeof record.start === "number" ? record.start : 0,
      end: typeof record.end === "number" ? record.end : 0,
      text: optionalString(record.text) ?? "",
    };
  });
}

function normalizePagination(value: JsonRecord | undefined) {
  return {
    totalCount: typeof value?.total_count === "number" ? value.total_count : undefined,
    offset: typeof value?.offset === "number" ? value.offset : undefined,
    limit: typeof value?.limit === "number" ? value.limit : undefined,
    next: optionalString(value?.next) ?? null,
    previous: optionalString(value?.previous) ?? null,
  };
}

function extractTeamSlug(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return optionalString((value as JsonRecord).slug) ?? null;
}

function asStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item));
}

function optionalStringMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value as JsonRecord).flatMap(([key, child]) =>
    typeof child === "string" ? [[key, child] as const] : [],
  );
  return Object.fromEntries(entries);
}

function requireString(input: JsonRecord, key: string) {
  return requiredString(input[key], key, (message) => new ProviderRequestError(400, message));
}

function requireInteger(input: JsonRecord, key: string) {
  const value = optionalInteger(input[key]);
  if (value === undefined) {
    throw new ProviderRequestError(400, `${key} is required`);
  }
  return value;
}

function requireBoolean(input: JsonRecord, key: string) {
  const value = optionalBoolean(input[key]);
  if (value === undefined) {
    throw new ProviderRequestError(400, `${key} is required`);
  }
  return value;
}

async function assertAmaraResponse(response: Response, mode: "validate" | "execute") {
  if (response.ok) {
    return;
  }

  const error = await readAmaraError(response);

  if (response.status === 429) {
    throw new ProviderRequestError(429, error.message);
  }
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, error.message);
  }
  if (mode === "execute" && response.status === 401) {
    throw new ProviderRequestError(401, error.message);
  }
  if (response.status === 400 || response.status === 404) {
    throw new ProviderRequestError(response.status, error.message);
  }
  if (response.status === 403) {
    throw new ProviderRequestError(403, error.message);
  }

  throw new ProviderRequestError(response.status || 500, error.message);
}

async function readAmaraError(response: Response) {
  try {
    const payload = (await response.json()) as JsonRecord;
    const detail = optionalString(payload.detail);
    const description = optionalString(payload.description);
    const error = optionalString(payload.error);
    const message =
      detail ?? description ?? error ?? `amara request failed with ${response.status}`;
    const code = optionalString(payload.code) ?? optionalString(payload.error_code);
    return { code, message };
  } catch {
    const message =
      (await response.text().catch(() => "")) || `amara request failed with ${response.status}`;
    return { code: undefined, message };
  }
}
