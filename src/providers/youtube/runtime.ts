import type { OAuthProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { YoutubeActionName } from "./actions.ts";

import { randomUUID } from "node:crypto";
import { compactObject, optionalBoolean, optionalInteger, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl, readBoundedResponseBytes } from "../../core/request.ts";
import { googleJsonRequest, googleRequest } from "../googledrive/runtime-shared.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const youtubeApiBaseUrl = "https://www.googleapis.com/youtube/v3";
const youtubeUploadApiBaseUrl = "https://www.googleapis.com/upload/youtube/v3";
const youtubeLongRequestTimeoutMs = 120_000;
const youtubeUploadSourceMaxBytes = 256 * 1024 * 1024;

type YoutubeActionContext = OAuthProviderContext;
type YoutubeActionHandler = ProviderRuntimeHandler<YoutubeActionContext>;

interface YoutubeCollectionPayload {
  items?: unknown;
  nextPageToken?: string;
  prevPageToken?: string;
  pageInfo?: unknown;
}

interface YoutubeResource {
  id?: unknown;
  kind?: unknown;
  etag?: unknown;
  snippet?: unknown;
  contentDetails?: unknown;
  statistics?: unknown;
  status?: unknown;
  player?: unknown;
  replies?: unknown;
}

interface UploadSource {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  boundary: string;
}

interface StreamingUploadSource {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  contentLength: number;
}

export const youtubeActionHandlers: Record<YoutubeActionName, YoutubeActionHandler> = {
  search(input, context) {
    return searchYoutube(input, context);
  },
  list_videos(input, context) {
    return listVideos(input, context);
  },
  list_channels(input, context) {
    return listChannels(input, context);
  },
  list_playlists(input, context) {
    return listPlaylists(input, context);
  },
  list_playlist_items(input, context) {
    return listPlaylistItems(input, context);
  },
  create_playlist(input, context) {
    return createPlaylist(input, context);
  },
  update_playlist(input, context) {
    return updatePlaylist(input, context);
  },
  delete_playlist(input, context) {
    return deletePlaylist(input, context);
  },
  add_video_to_playlist(input, context) {
    return addVideoToPlaylist(input, context);
  },
  update_playlist_item(input, context) {
    return updatePlaylistItem(input, context);
  },
  delete_playlist_item(input, context) {
    return deletePlaylistItem(input, context);
  },
  list_comment_threads(input, context) {
    return listCommentThreads(input, context);
  },
  list_comments(input, context) {
    return listComments(input, context);
  },
  post_comment(input, context) {
    return postComment(input, context);
  },
  create_comment_reply(input, context) {
    return createCommentReply(input, context);
  },
  upload_video_from_url(input, context) {
    return uploadVideoFromUrl(input, context);
  },
  update_video(input, context) {
    return updateVideo(input, context);
  },
  delete_video(input, context) {
    return deleteVideo(input, context);
  },
  get_video_rating(input, context) {
    return getVideoRating(input, context);
  },
  rate_video(input, context) {
    return rateVideo(input, context);
  },
  set_thumbnail_from_url(input, context) {
    return setThumbnailFromUrl(input, context);
  },
  download_caption(input, context) {
    return downloadCaption(input, context);
  },
  list_caption_tracks(input, context) {
    return listCaptionTracks(input, context);
  },
  upload_caption_from_url(input, context) {
    return uploadCaptionFromUrl(input, context);
  },
  update_caption(input, context) {
    return updateCaption(input, context);
  },
  delete_caption(input, context) {
    return deleteCaption(input, context);
  },
  list_video_categories(input, context) {
    return listVideoCategories(input, context);
  },
  list_i18n_languages(input, context) {
    return listI18nLanguages(input, context);
  },
  list_i18n_regions(input, context) {
    return listI18nRegions(input, context);
  },
};

async function searchYoutube(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const payload = await youtubeJsonRequest<YoutubeCollectionPayload>("/search", {
    context,
    query: compactObject({
      part: "snippet",
      q: requireString(optionalString(input.q), "q is required"),
      type: joinStringArray(input.type),
      order: optionalString(input.order),
      channelId: optionalString(input.channelId),
      publishedAfter: optionalString(input.publishedAfter),
      publishedBefore: optionalString(input.publishedBefore),
      regionCode: optionalString(input.regionCode),
      relevanceLanguage: optionalString(input.relevanceLanguage),
      safeSearch: optionalString(input.safeSearch),
      maxResults: stringifyInteger(optionalInteger(input.maxResults)),
      pageToken: optionalString(input.pageToken),
    }),
  });
  return { results: normalizeItems(payload.items, normalizeSearchResult), ...normalizePaging(payload) };
}

async function listVideos(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const query = compactObject({
    part: joinStringArray(input.part) ?? "snippet,contentDetails,statistics,status",
    id: joinStringArray(input.ids),
    chart: optionalString(input.chart),
    mine: stringifyTrueBoolean(optionalBoolean(input.mine)),
    maxResults: stringifyInteger(optionalInteger(input.maxResults)),
    pageToken: optionalString(input.pageToken),
    regionCode: optionalString(input.regionCode),
  });
  requireOneFilter(query, ["id", "chart", "mine"], "ids, chart, or mine is required");
  const payload = await youtubeJsonRequest<YoutubeCollectionPayload>("/videos", { context, query });
  return { videos: normalizeItems(payload.items, normalizeVideo), ...normalizePaging(payload) };
}

async function listChannels(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const query = compactObject({
    part: joinStringArray(input.part) ?? "snippet,contentDetails,statistics,status",
    id: joinStringArray(input.ids),
    forHandle: optionalString(input.forHandle),
    forUsername: optionalString(input.forUsername),
    mine: stringifyTrueBoolean(optionalBoolean(input.mine)),
    maxResults: stringifyInteger(optionalInteger(input.maxResults)),
    pageToken: optionalString(input.pageToken),
  });
  requireOneFilter(query, ["id", "forHandle", "forUsername", "mine"], "one channel filter is required");
  const payload = await youtubeJsonRequest<YoutubeCollectionPayload>("/channels", { context, query });
  return { channels: normalizeItems(payload.items, normalizeChannel), ...normalizePaging(payload) };
}

async function listPlaylists(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const query = compactObject({
    part: joinStringArray(input.part) ?? "snippet,contentDetails,status",
    id: joinStringArray(input.ids),
    channelId: optionalString(input.channelId),
    mine: stringifyTrueBoolean(optionalBoolean(input.mine)),
    maxResults: stringifyInteger(optionalInteger(input.maxResults)),
    pageToken: optionalString(input.pageToken),
  });
  requireOneFilter(query, ["id", "channelId", "mine"], "ids, channelId, or mine is required");
  const payload = await youtubeJsonRequest<YoutubeCollectionPayload>("/playlists", { context, query });
  return { playlists: normalizeItems(payload.items, normalizePlaylist), ...normalizePaging(payload) };
}

async function listPlaylistItems(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const payload = await youtubeJsonRequest<YoutubeCollectionPayload>("/playlistItems", {
    context,
    query: compactObject({
      part: joinStringArray(input.part) ?? "snippet,contentDetails,status",
      playlistId: requireString(optionalString(input.playlistId), "playlistId is required"),
      maxResults: stringifyInteger(optionalInteger(input.maxResults)),
      pageToken: optionalString(input.pageToken),
    }),
  });
  return { playlistItems: normalizeItems(payload.items, normalizePlaylistItem), ...normalizePaging(payload) };
}

async function createPlaylist(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const payload = await youtubeJsonRequest<YoutubeResource>("/playlists", {
    context,
    method: "POST",
    query: { part: "snippet,status" },
    body: buildPlaylistMutationBody(input, { defaultPrivacyStatus: "private" }),
  });
  return { playlist: normalizePlaylist(payload) };
}

async function updatePlaylist(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const body = {
    id: requireString(optionalString(input.playlistId), "playlistId is required"),
    ...buildPlaylistMutationBody(input),
  };
  const payload = await youtubeJsonRequest<YoutubeResource>("/playlists", {
    context,
    method: "PUT",
    query: { part: playlistMutationPart(body) },
    body,
  });
  return { playlist: normalizePlaylist(payload) };
}

async function deletePlaylist(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const playlistId = requireString(optionalString(input.playlistId), "playlistId is required");
  await youtubeDeleteRequest("/playlists", { context, query: { id: playlistId } });
  return { result: { id: playlistId, deleted: true } };
}

async function addVideoToPlaylist(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const body = buildPlaylistItemMutationBody(input);
  const payload = await youtubeJsonRequest<YoutubeResource>("/playlistItems", {
    context,
    method: "POST",
    query: { part: playlistItemMutationPart(body) },
    body,
  });
  return { playlistItem: normalizePlaylistItem(payload) };
}

async function updatePlaylistItem(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const body = {
    id: requireString(optionalString(input.playlistItemId), "playlistItemId is required"),
    ...buildPlaylistItemMutationBody(input),
  };
  const payload = await youtubeJsonRequest<YoutubeResource>("/playlistItems", {
    context,
    method: "PUT",
    query: { part: playlistItemMutationPart(body) },
    body,
  });
  return { playlistItem: normalizePlaylistItem(payload) };
}

async function deletePlaylistItem(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const playlistItemId = requireString(optionalString(input.playlistItemId), "playlistItemId is required");
  await youtubeDeleteRequest("/playlistItems", { context, query: { id: playlistItemId } });
  return { result: { id: playlistItemId, deleted: true } };
}

async function listCommentThreads(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const query = compactObject({
    part: joinStringArray(input.part) ?? "snippet,replies",
    id: joinStringArray(input.ids),
    videoId: optionalString(input.videoId),
    channelId: optionalString(input.channelId),
    allThreadsRelatedToChannelId: optionalString(input.allThreadsRelatedToChannelId),
    maxResults: stringifyInteger(optionalInteger(input.maxResults)),
    pageToken: optionalString(input.pageToken),
    order: optionalString(input.order),
    textFormat: optionalString(input.textFormat),
  });
  requireOneFilter(
    query,
    ["id", "videoId", "channelId", "allThreadsRelatedToChannelId"],
    "one comment thread filter is required",
  );
  const payload = await youtubeJsonRequest<YoutubeCollectionPayload>("/commentThreads", { context, query });
  return { commentThreads: normalizeItems(payload.items, normalizeCommentThread), ...normalizePaging(payload) };
}

async function listComments(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const query = compactObject({
    part: joinStringArray(input.part) ?? "snippet",
    id: joinStringArray(input.ids),
    parentId: optionalString(input.parentId),
    maxResults: stringifyInteger(optionalInteger(input.maxResults)),
    pageToken: optionalString(input.pageToken),
    textFormat: optionalString(input.textFormat),
  });
  requireOneFilter(query, ["id", "parentId"], "ids or parentId is required");
  const payload = await youtubeJsonRequest<YoutubeCollectionPayload>("/comments", { context, query });
  return { comments: normalizeItems(payload.items, normalizeComment), ...normalizePaging(payload) };
}

async function postComment(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const payload = await youtubeJsonRequest<YoutubeResource>("/commentThreads", {
    context,
    method: "POST",
    query: { part: "snippet" },
    body: {
      snippet: {
        videoId: requireString(optionalString(input.videoId), "videoId is required"),
        channelId: requireString(optionalString(input.channelId), "channelId is required"),
        topLevelComment: {
          snippet: {
            textOriginal: requireString(optionalString(input.textOriginal), "textOriginal is required"),
          },
        },
      },
    },
  });
  return { commentThread: normalizeCommentThread(payload) };
}

async function createCommentReply(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const payload = await youtubeJsonRequest<YoutubeResource>("/comments", {
    context,
    method: "POST",
    query: { part: "snippet" },
    body: {
      snippet: {
        parentId: requireString(optionalString(input.parentId), "parentId is required"),
        textOriginal: requireString(optionalString(input.textOriginal), "textOriginal is required"),
      },
    },
  });
  return { comment: normalizeComment(payload) };
}

async function uploadVideoFromUrl(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const source = await resolveStreamingUploadSource({
    url: requireString(optionalString(input.mediaUrl), "mediaUrl is required"),
    fileName: optionalString(input.fileName),
    mimeType: optionalString(input.mimeType),
    context,
  });
  const metadata = compactObject({
    snippet: compactObject({
      title: requireString(optionalString(input.title), "title is required"),
      description: optionalString(input.description),
      tags: Array.isArray(input.tags) ? input.tags : undefined,
      categoryId: optionalString(input.categoryId),
    }),
    status: compactObject({ privacyStatus: optionalString(input.privacyStatus) ?? "private" }),
  });
  const sessionResponse = await youtubeRawRequest(`${youtubeUploadApiBaseUrl}/videos`, {
    context,
    method: "POST",
    query: compactObject({
      uploadType: "resumable",
      part: "snippet,status",
      notifySubscribers: stringifyBoolean(optionalBoolean(input.notifySubscribers)),
    }),
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-length": String(source.contentLength),
      "x-upload-content-type": source.mimeType,
    },
    rawBody: JSON.stringify(metadata),
  });
  const uploadUrl = sessionResponse.headers.get("location");
  if (!uploadUrl) throw new ProviderRequestError(502, "youtube resumable upload session is missing");
  const uploadResponse = await youtubeRawRequest(uploadUrl, {
    context,
    method: "PUT",
    headers: {
      "content-length": String(source.contentLength),
      "content-type": source.mimeType,
    },
    rawBody: bytesBody(source.bytes),
  });
  const payload = (await uploadResponse.json()) as YoutubeResource;
  return { video: normalizeVideo(payload) };
}

async function updateVideo(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const payload = await youtubeJsonRequest<YoutubeResource>("/videos", {
    context,
    method: "PUT",
    query: { part: "snippet,status" },
    body: {
      id: requireString(optionalString(input.videoId), "videoId is required"),
      snippet: compactObject({
        title: requireString(optionalString(input.title), "title is required"),
        description: optionalString(input.description),
        tags: Array.isArray(input.tags) ? input.tags : undefined,
        categoryId: optionalString(input.categoryId),
      }),
      status: compactObject({ privacyStatus: optionalString(input.privacyStatus) }),
    },
  });
  return { video: normalizeVideo(payload) };
}

async function deleteVideo(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const videoId = requireString(optionalString(input.videoId), "videoId is required");
  await youtubeDeleteRequest("/videos", { context, query: { id: videoId } });
  return { result: { id: videoId, deleted: true } };
}

async function getVideoRating(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const payload = await youtubeJsonRequest<YoutubeCollectionPayload>("/videos/getRating", {
    context,
    query: { id: requireString(joinStringArray(input.ids), "ids is required") },
  });
  return { ratings: normalizeItems(payload.items, normalizeVideoRating) };
}

async function rateVideo(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const videoId = requireString(optionalString(input.videoId), "videoId is required");
  const rating = requireString(optionalString(input.rating), "rating is required");
  await youtubeDeleteRequest("/videos/rate", { context, method: "POST", query: { id: videoId, rating } });
  return { videoId, rating, success: true };
}

async function setThumbnailFromUrl(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const source = await resolveUploadSource({
    url: requireString(optionalString(input.imageUrl), "imageUrl is required"),
    fileName: optionalString(input.fileName),
    mimeType: optionalString(input.mimeType),
    context,
  });
  const payload = await youtubeUploadJsonRequest<Record<string, unknown>>("/thumbnails/set", {
    context,
    method: "POST",
    query: {
      uploadType: "media",
      videoId: requireString(optionalString(input.videoId), "videoId is required"),
    },
    source,
  });
  return { thumbnails: payload };
}

async function downloadCaption(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  if (!context.transitFiles) throw new ProviderRequestError(400, "Transit file storage is not enabled.");
  const captionId = requireString(optionalString(input.captionId), "captionId is required");
  const response = await youtubeRawRequest(`${youtubeApiBaseUrl}/captions/${captionId}`, {
    context,
    method: "GET",
    query: compactObject({
      tfmt: optionalString(input.tfmt),
      tlang: optionalString(input.tlang),
    }),
  });
  const mimeType = optionalString(input.mimeType) ?? inferMimeType(response.headers.get("content-type"));
  const fileName =
    optionalString(input.fileName) ?? resolveCaptionFileName(captionId, optionalString(input.tfmt), mimeType);
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: context.transitFiles.maxBytes,
    fieldName: "YouTube caption download",
    createError: (message) => new ProviderRequestError(413, message),
  });
  const upload = await context.transitFiles.create(new File([Uint8Array.from(bytes)], fileName, { type: mimeType }));
  return {
    file: {
      id: captionId,
      name: fileName,
      mimeType,
      sizeBytes: parseContentLength(response.headers.get("content-length")),
      transitUrl: upload.downloadUrl,
      fileId: upload.fileId,
    },
  };
}

async function listCaptionTracks(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const query = compactObject({
    part: joinStringArray(input.part) ?? "snippet",
    id: joinStringArray(input.ids),
    videoId: optionalString(input.videoId),
  });
  requireOneFilter(query, ["id", "videoId"], "ids or videoId is required");
  const payload = await youtubeJsonRequest<YoutubeCollectionPayload>("/captions", { context, query });
  return { captions: normalizeItems(payload.items, normalizeCaption) };
}

async function uploadCaptionFromUrl(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const source = await resolveUploadSource({
    url: requireString(optionalString(input.captionUrl), "captionUrl is required"),
    fileName: optionalString(input.fileName),
    mimeType: optionalString(input.mimeType),
    context,
  });
  const payload = await youtubeUploadJsonRequest<YoutubeResource>("/captions", {
    context,
    method: "POST",
    query: { uploadType: "multipart", part: "snippet" },
    metadata: {
      snippet: compactObject({
        videoId: requireString(optionalString(input.videoId), "videoId is required"),
        language: requireString(optionalString(input.language), "language is required"),
        name: optionalString(input.name),
        isDraft: optionalBoolean(input.isDraft),
      }),
    },
    source,
  });
  return { caption: normalizeCaption(payload) };
}

async function updateCaption(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const payload = await youtubeJsonRequest<YoutubeResource>("/captions", {
    context,
    method: "PUT",
    query: { part: "snippet" },
    body: {
      id: requireString(optionalString(input.captionId), "captionId is required"),
      snippet: requireNonEmptyObject(
        compactObject({
          name: optionalString(input.name),
          isDraft: optionalBoolean(input.isDraft),
        }),
        "name or isDraft is required",
      ),
    },
  });
  return { caption: normalizeCaption(payload) };
}

async function deleteCaption(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const captionId = requireString(optionalString(input.captionId), "captionId is required");
  await youtubeDeleteRequest("/captions", { context, query: { id: captionId } });
  return { result: { id: captionId, deleted: true } };
}

async function listVideoCategories(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const query = compactObject({
    part: joinStringArray(input.part) ?? "snippet",
    id: joinStringArray(input.ids),
    regionCode: optionalString(input.regionCode),
  });
  requireOneFilter(query, ["id", "regionCode"], "ids or regionCode is required");
  const payload = await youtubeJsonRequest<YoutubeCollectionPayload>("/videoCategories", { context, query });
  return { categories: normalizeItems(payload.items, normalizeVideoCategory) };
}

async function listI18nLanguages(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const payload = await youtubeJsonRequest<YoutubeCollectionPayload>("/i18nLanguages", {
    context,
    query: compactObject({ part: joinStringArray(input.part) ?? "snippet", hl: optionalString(input.hl) }),
  });
  return { languages: normalizeItems(payload.items, normalizeI18nLanguage) };
}

async function listI18nRegions(input: Record<string, unknown>, context: YoutubeActionContext): Promise<unknown> {
  const payload = await youtubeJsonRequest<YoutubeCollectionPayload>("/i18nRegions", {
    context,
    query: compactObject({ part: joinStringArray(input.part) ?? "snippet", hl: optionalString(input.hl) }),
  });
  return { regions: normalizeItems(payload.items, normalizeI18nRegion) };
}

async function youtubeJsonRequest<T>(
  path: string,
  input: {
    context: YoutubeActionContext;
    method?: string;
    query?: Record<string, string | undefined>;
    body?: unknown;
  },
): Promise<T> {
  return googleJsonRequest<T>(`${youtubeApiBaseUrl}${path}`, {
    accessToken: input.context.accessToken,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    method: input.method,
    query: input.query,
    body: input.body,
  });
}

async function youtubeUploadJsonRequest<T>(
  path: string,
  input: {
    context: YoutubeActionContext;
    method: string;
    query: Record<string, string | undefined>;
    metadata?: Record<string, unknown>;
    source: UploadSource;
  },
): Promise<T> {
  const response = await youtubeRawRequest(`${youtubeUploadApiBaseUrl}${path}`, {
    context: input.context,
    method: input.method,
    query: input.query,
    headers: input.metadata
      ? { "content-type": `multipart/related; boundary=${input.source.boundary}` }
      : { "content-type": input.source.mimeType },
    rawBody: input.metadata
      ? buildMultipartBody(input.source.boundary, input.metadata, input.source.bytes, input.source.mimeType)
      : bytesBody(input.source.bytes),
  });
  return (await response.json()) as T;
}

async function youtubeDeleteRequest(
  path: string,
  input: {
    context: YoutubeActionContext;
    method?: string;
    query: Record<string, string | undefined>;
  },
): Promise<void> {
  await youtubeRawRequest(`${youtubeApiBaseUrl}${path}`, {
    context: input.context,
    method: input.method ?? "DELETE",
    query: input.query,
  });
}

async function youtubeRawRequest(
  url: string,
  input: {
    context: YoutubeActionContext;
    method?: string;
    query?: Record<string, string | undefined>;
    headers?: Record<string, string>;
    rawBody?: BodyInit;
  },
): Promise<Response> {
  return googleRequest(url, {
    accessToken: input.context.accessToken,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    method: input.method,
    query: input.query,
    rawBody: input.rawBody,
    headers: input.headers,
    timeoutMs: youtubeLongRequestTimeoutMs,
  });
}

function normalizeSearchResult(value: unknown): Record<string, unknown> {
  const item = asLooseResource(value);
  return {
    kind: asNullableString(item.kind),
    etag: asNullableString(item.etag),
    id: asLooseObject(item.id),
    snippet: asNullableLooseObject(item.snippet),
    raw: item,
  };
}

function normalizeVideo(value: unknown): Record<string, unknown> {
  const item = asLooseResource(value);
  return {
    id: asNullableString(item.id),
    kind: asNullableString(item.kind),
    etag: asNullableString(item.etag),
    snippet: asNullableLooseObject(item.snippet),
    contentDetails: asNullableLooseObject(item.contentDetails),
    statistics: asNullableLooseObject(item.statistics),
    status: asNullableLooseObject(item.status),
    player: asNullableLooseObject(item.player),
    raw: item,
  };
}

function normalizeChannel(value: unknown): Record<string, unknown> {
  const item = asLooseResource(value);
  return {
    id: asNullableString(item.id),
    kind: asNullableString(item.kind),
    etag: asNullableString(item.etag),
    snippet: asNullableLooseObject(item.snippet),
    contentDetails: asNullableLooseObject(item.contentDetails),
    statistics: asNullableLooseObject(item.statistics),
    status: asNullableLooseObject(item.status),
    raw: item,
  };
}

function normalizePlaylist(value: unknown): Record<string, unknown> {
  const item = asLooseResource(value);
  return {
    id: asNullableString(item.id),
    kind: asNullableString(item.kind),
    etag: asNullableString(item.etag),
    snippet: asNullableLooseObject(item.snippet),
    contentDetails: asNullableLooseObject(item.contentDetails),
    status: asNullableLooseObject(item.status),
    raw: item,
  };
}

function normalizePlaylistItem(value: unknown): Record<string, unknown> {
  const item = asLooseResource(value);
  return {
    id: asNullableString(item.id),
    kind: asNullableString(item.kind),
    etag: asNullableString(item.etag),
    snippet: asNullableLooseObject(item.snippet),
    contentDetails: asNullableLooseObject(item.contentDetails),
    status: asNullableLooseObject(item.status),
    raw: item,
  };
}

function normalizeCommentThread(value: unknown): Record<string, unknown> {
  const item = asLooseResource(value);
  return {
    id: asNullableString(item.id),
    kind: asNullableString(item.kind),
    etag: asNullableString(item.etag),
    snippet: asNullableLooseObject(item.snippet),
    replies: asNullableLooseObject(item.replies),
    raw: item,
  };
}

function normalizeComment(value: unknown): Record<string, unknown> {
  const item = asLooseResource(value);
  return {
    id: asNullableString(item.id),
    kind: asNullableString(item.kind),
    etag: asNullableString(item.etag),
    snippet: asNullableLooseObject(item.snippet),
    raw: item,
  };
}

function normalizeCaption(value: unknown): Record<string, unknown> {
  return normalizeComment(value);
}

function normalizeVideoCategory(value: unknown): Record<string, unknown> {
  return normalizeComment(value);
}

function normalizeI18nLanguage(value: unknown): Record<string, unknown> {
  return normalizeComment(value);
}

function normalizeI18nRegion(value: unknown): Record<string, unknown> {
  return normalizeComment(value);
}

function normalizeVideoRating(value: unknown): Record<string, unknown> {
  const item = asLooseObject(value);
  return { videoId: asNullableString(item.videoId), rating: asNullableString(item.rating), raw: item };
}

function normalizeItems<T>(items: unknown, normalize: (value: unknown) => T): T[] {
  return Array.isArray(items) ? items.map(normalize) : [];
}

function normalizePaging(payload: YoutubeCollectionPayload): Record<string, unknown> {
  return {
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
    prevPageToken: optionalString(payload.prevPageToken) ?? null,
    pageInfo: normalizePageInfo(payload.pageInfo),
  };
}

function normalizePageInfo(value: unknown): Record<string, number> {
  const page = asLooseObject(value);
  return { totalResults: toInteger(page.totalResults), resultsPerPage: toInteger(page.resultsPerPage) };
}

function requireOneFilter(query: Record<string, unknown>, keys: string[], message: string): void {
  if (!keys.some((key) => query[key] !== undefined)) throw new ProviderRequestError(400, message);
}

function requireString(value: string | undefined, message: string): string {
  if (value) return value;
  throw new ProviderRequestError(400, message);
}

function requireNonEmptyObject<T extends Record<string, unknown>>(value: T, message: string): T {
  if (Object.keys(value).length > 0) return value;
  throw new ProviderRequestError(400, message);
}

function buildPlaylistMutationBody(
  input: Record<string, unknown>,
  options: { defaultPrivacyStatus?: string } = {},
): Record<string, unknown> {
  const privacyStatus = optionalString(input.privacyStatus) ?? options.defaultPrivacyStatus;
  return {
    snippet: compactObject({
      title: requireString(optionalString(input.title), "title is required"),
      description: optionalString(input.description),
    }),
    ...(privacyStatus ? { status: { privacyStatus } } : {}),
  };
}

function playlistMutationPart(body: Record<string, unknown>): string {
  return body.status === undefined ? "snippet" : "snippet,status";
}

function buildPlaylistItemMutationBody(input: Record<string, unknown>): Record<string, unknown> {
  const note = optionalString(input.note);
  return {
    snippet: compactObject({
      playlistId: requireString(optionalString(input.playlistId), "playlistId is required"),
      position: optionalInteger(input.position),
      resourceId: {
        kind: "youtube#video",
        videoId: requireString(optionalString(input.videoId), "videoId is required"),
      },
    }),
    ...(note ? { contentDetails: { note } } : {}),
  };
}

function playlistItemMutationPart(body: Record<string, unknown>): string {
  return body.contentDetails === undefined ? "snippet" : "snippet,contentDetails";
}

function joinStringArray(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const joined = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .join(",");
  return joined || undefined;
}

function stringifyInteger(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

function stringifyBoolean(value: boolean | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

function stringifyTrueBoolean(value: boolean | undefined): string | undefined {
  return value === true ? "true" : undefined;
}

function asLooseResource(value: unknown): YoutubeResource {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as YoutubeResource) : {};
}

function asLooseObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asNullableLooseObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toInteger(value: unknown): number {
  return Number.isInteger(value) ? (value as number) : 0;
}

function bytesBody(bytes: Uint8Array): BodyInit {
  return new Uint8Array(bytes).buffer;
}

async function resolveUploadSource(input: {
  url: string;
  fileName?: string;
  mimeType?: string;
  context: YoutubeActionContext;
}): Promise<UploadSource> {
  const response = await fetchUploadSource(input.url, input.context);
  const bytes = await readYoutubeUploadSourceBytes(response);
  return {
    bytes,
    fileName: input.fileName ?? inferFileNameFromUrl(input.url),
    mimeType: input.mimeType ?? inferMimeType(response.headers.get("content-type")),
    boundary: `oomol-youtube-${randomUUID()}`,
  };
}

async function resolveStreamingUploadSource(input: {
  url: string;
  fileName?: string;
  mimeType?: string;
  context: YoutubeActionContext;
}): Promise<StreamingUploadSource> {
  const response = await fetchUploadSource(input.url, input.context);
  const bytes = await readYoutubeUploadSourceBytes(response);
  return {
    bytes,
    fileName: input.fileName ?? inferFileNameFromUrl(input.url),
    mimeType: input.mimeType ?? inferMimeType(response.headers.get("content-type")),
    contentLength: bytes.byteLength,
  };
}

async function fetchUploadSource(url: string, context: YoutubeActionContext): Promise<Response> {
  assertPublicHttpUrl(url, {
    fieldName: "upload source URL",
    createError: (message) => new ProviderRequestError(400, message),
  });
  const response = await context.fetcher(url, {
    method: "GET",
    headers: { "user-agent": providerUserAgent },
    signal: context.signal,
  });
  if (!response.ok) {
    throw new ProviderRequestError(
      response.status >= 500 ? 502 : response.status,
      `failed to fetch upload source: ${response.status}`,
    );
  }
  return response;
}

function readYoutubeUploadSourceBytes(response: Response): Promise<Uint8Array> {
  return readBoundedResponseBytes(response, {
    maxBytes: youtubeUploadSourceMaxBytes,
    fieldName: "upload source URL",
    createError: (message) => new ProviderRequestError(400, message),
  });
}

function buildMultipartBody(
  boundary: string,
  metadata: Record<string, unknown>,
  bytes: Uint8Array,
  mimeType: string,
): BodyInit {
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\ncontent-type: ${mimeType}\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.byteLength + bytes.byteLength + tail.byteLength);
  body.set(head, 0);
  body.set(bytes, head.byteLength);
  body.set(tail, head.byteLength + bytes.byteLength);
  return bytesBody(body);
}

function inferFileNameFromUrl(url: string): string {
  try {
    const fileName = new URL(url).pathname.split("/").filter(Boolean).at(-1);
    return fileName && fileName.length > 0 ? fileName : "upload";
  } catch {
    return "upload";
  }
}

function inferMimeType(contentType: string | null): string {
  return contentType?.split(";")[0]?.trim() || "application/octet-stream";
}

function parseContentLength(contentLength: string | null): number | null {
  const parsed = Number(contentLength);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function resolveCaptionFileName(captionId: string, format: string | undefined, mimeType: string): string {
  const extension = format ?? extensionFromMimeType(mimeType) ?? "txt";
  return `${captionId}.${extension}`;
}

function extensionFromMimeType(mimeType: string): string | undefined {
  if (mimeType.includes("vtt")) return "vtt";
  if (mimeType.includes("srt")) return "srt";
  if (mimeType.includes("xml")) return "xml";
  return undefined;
}
