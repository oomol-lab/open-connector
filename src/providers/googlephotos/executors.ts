import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  TransitFileWriter,
} from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { GooglePhotosActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  stringArray,
} from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireOAuthCredential,
} from "../provider-runtime.ts";

export const googlePhotosApiBaseUrl = "https://photoslibrary.googleapis.com/v1";
export const googlePhotosPickerApiBaseUrl = "https://photospicker.googleapis.com/v1";

const service = "googlephotos";
const googleUserInfoUrl = "https://www.googleapis.com/oauth2/v3/userinfo";
const googlePhotosPickerDownloadHostAllowlist = new Set(["lh3.googleusercontent.com"]);
const defaultUploadChunkGranularity = 256 * 1024;
const googleLongRunningRequestTimeoutMs = 120_000;
const noVisibleAlbumsMessage =
  "No albums were visible to the current application connection. Google Photos Library API mainly exposes app-created data. If you need the user to pick from their existing Google Photos library, use create_picker_session and then list_picked_media_items.";

interface GooglePhotosRuntimeContext {
  accessToken: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  transitFiles?: TransitFileWriter;
}

interface GooglePhotosUploadSource {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

type GooglePhotosActionHandler = (
  input: Record<string, unknown>,
  context: GooglePhotosRuntimeContext,
) => Promise<unknown>;

export const googlePhotosActionHandlers: Record<GooglePhotosActionName, GooglePhotosActionHandler> = {
  list_albums: listAlbums,
  get_album: getAlbum,
  create_album: createAlbum,
  update_album: updateAlbum,
  add_enrichment: addEnrichment,
  list_media_items: listMediaItems,
  search_media_items: searchMediaItems,
  batch_get_media_items: batchGetMediaItems,
  get_media_item_download: getMediaItemDownload,
  upload_media: uploadMedia,
  batch_create_media_items: batchCreateMediaItems,
  batch_add_media_items: batchAddMediaItems,
  update_media_item: updateMediaItem,
  create_picker_session: createPickerSession,
  get_picker_session: getPickerSession,
  delete_picker_session: deletePickerSession,
  list_picked_media_items: listPickedMediaItems,
  get_picked_media_item_download: getPickedMediaItemDownload,
};

export const executors: ProviderExecutors = defineProviderExecutors<GooglePhotosRuntimeContext>({
  service,
  handlers: googlePhotosActionHandlers,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<GooglePhotosRuntimeContext> {
    const credential = await requireOAuthCredential(context, service);
    const runtimeContext: GooglePhotosRuntimeContext = {
      accessToken: credential.accessToken,
      fetcher,
      signal: context.signal,
    };
    if (context.transitFiles) {
      runtimeContext.transitFiles = context.transitFiles;
    }
    return runtimeContext;
  },
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const profile = await requestGooglePhotosJson<{
      email?: string;
      name?: string;
      sub?: string;
    }>(googleUserInfoUrl, {
      accessToken: input.accessToken,
      fetcher,
      signal,
    });

    return {
      profile: {
        accountId: profile.email ?? profile.sub ?? "googlephotos:oauth2",
        displayName: profile.name ?? profile.email ?? "Google Photos User",
      },
      metadata: {
        currentAccount: profile,
      },
    };
  },
};

async function listAlbums(input: Record<string, unknown>, context: GooglePhotosRuntimeContext) {
  const payload = await requestGooglePhotosJson<{
    albums?: unknown[];
    nextPageToken?: string | null;
  }>(`${googlePhotosApiBaseUrl}/albums`, {
    ...context,
    query: compactObject({
      pageSize: optionalInteger(input.pageSize)?.toString(),
      pageToken: optionalString(input.pageToken),
    }),
  });
  const albums = Array.isArray(payload.albums) ? payload.albums.map(normalizeAlbum) : [];
  const nextPageToken = optionalString(payload.nextPageToken) ?? null;

  return {
    albums,
    nextPageToken,
    ...(albums.length === 0 && nextPageToken == null ? { message: noVisibleAlbumsMessage } : {}),
  };
}

async function getAlbum(input: Record<string, unknown>, context: GooglePhotosRuntimeContext) {
  const albumId = requireInputString(input.albumId, "albumId is required");
  const payload = await requestGooglePhotosJson(
    `${googlePhotosApiBaseUrl}/albums/${encodeURIComponent(albumId)}`,
    context,
  );

  return {
    album: normalizeAlbum(payload),
  };
}

async function createAlbum(input: Record<string, unknown>, context: GooglePhotosRuntimeContext) {
  const payload = await requestGooglePhotosJson(`${googlePhotosApiBaseUrl}/albums`, {
    ...context,
    method: "POST",
    body: {
      album: {
        title: requireInputString(input.title, "title is required"),
      },
    },
  });

  return {
    album: normalizeAlbum(payload),
  };
}

async function updateAlbum(input: Record<string, unknown>, context: GooglePhotosRuntimeContext) {
  const albumId = requireInputString(input.albumId, "albumId is required");
  const title = optionalString(input.title);
  const coverPhotoMediaItemId = optionalString(input.coverPhotoMediaItemId);
  const updateMask: string[] = [];
  const body: Record<string, unknown> = {};

  if (title) {
    updateMask.push("title");
    body.title = title;
  }
  if (coverPhotoMediaItemId) {
    updateMask.push("coverPhotoMediaItemId");
    body.coverPhotoMediaItemId = coverPhotoMediaItemId;
  }
  if (updateMask.length === 0) {
    throw new ProviderRequestError(400, "title or coverPhotoMediaItemId is required");
  }

  const payload = await requestGooglePhotosJson(`${googlePhotosApiBaseUrl}/albums/${encodeURIComponent(albumId)}`, {
    ...context,
    method: "PATCH",
    query: {
      updateMask: updateMask.join(","),
    },
    body,
  });

  return {
    album: normalizeAlbum(payload),
  };
}

async function addEnrichment(input: Record<string, unknown>, context: GooglePhotosRuntimeContext) {
  const albumId = requireInputString(input.albumId, "albumId is required");
  assertAlbumPosition(input.albumPosition);
  assertEnrichmentItem(input.newEnrichmentItem);

  const payload = await requestGooglePhotosJson(
    `${googlePhotosApiBaseUrl}/albums/${encodeURIComponent(albumId)}:addEnrichment`,
    {
      ...context,
      method: "POST",
      body: {
        albumPosition: input.albumPosition,
        newEnrichmentItem: input.newEnrichmentItem,
      },
    },
  );

  return {
    albumId,
    enrichmentItem: optionalRecord(payload)?.enrichmentItem,
  };
}

async function listMediaItems(input: Record<string, unknown>, context: GooglePhotosRuntimeContext) {
  const payload = await requestGooglePhotosJson<{
    mediaItems?: unknown[];
    nextPageToken?: string | null;
  }>(`${googlePhotosApiBaseUrl}/mediaItems`, {
    ...context,
    query: compactObject({
      pageSize: optionalInteger(input.pageSize)?.toString(),
      pageToken: optionalString(input.pageToken),
    }),
  });

  return {
    mediaItems: Array.isArray(payload.mediaItems) ? payload.mediaItems.map(normalizeMediaItem) : [],
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
  };
}

async function searchMediaItems(input: Record<string, unknown>, context: GooglePhotosRuntimeContext) {
  const payload = await requestGooglePhotosJson<{
    mediaItems?: unknown[];
    nextPageToken?: string | null;
  }>(`${googlePhotosApiBaseUrl}/mediaItems:search`, {
    ...context,
    method: "POST",
    body: compactObject({
      albumId: optionalString(input.albumId),
      pageSize: optionalInteger(input.pageSize),
      pageToken: optionalString(input.pageToken),
      orderBy: optionalString(input.orderBy),
      filters: optionalRecord(input.filters),
    }),
  });

  return {
    mediaItems: Array.isArray(payload.mediaItems) ? payload.mediaItems.map(normalizeMediaItem) : [],
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
  };
}

async function batchGetMediaItems(input: Record<string, unknown>, context: GooglePhotosRuntimeContext) {
  const url = new URL(`${googlePhotosApiBaseUrl}/mediaItems:batchGet`);
  for (const mediaItemId of stringArray(input.mediaItemIds, "mediaItemIds", providerRequestError)) {
    url.searchParams.append("mediaItemIds", mediaItemId);
  }

  const payload = await requestGooglePhotosJson<{ mediaItemResults?: unknown[] }>(url.toString(), context);

  return {
    mediaItemResults: Array.isArray(payload.mediaItemResults) ? payload.mediaItemResults : [],
  };
}

async function batchAddMediaItems(input: Record<string, unknown>, context: GooglePhotosRuntimeContext) {
  const albumId = requireInputString(input.albumId, "albumId is required");
  const mediaItemIds = stringArray(input.mediaItemIds, "mediaItemIds", providerRequestError);

  await requestGooglePhotosJson(`${googlePhotosApiBaseUrl}/albums/${encodeURIComponent(albumId)}:batchAddMediaItems`, {
    ...context,
    method: "POST",
    body: {
      mediaItemIds,
    },
  });

  return {
    albumId,
    mediaItemsAdded: mediaItemIds.length,
    message: "Successfully added media items to album",
  };
}

async function updateMediaItem(input: Record<string, unknown>, context: GooglePhotosRuntimeContext) {
  const mediaItemId = requireInputString(input.mediaItemId, "mediaItemId is required");
  const payload = await requestGooglePhotosJson(
    `${googlePhotosApiBaseUrl}/mediaItems/${encodeURIComponent(mediaItemId)}`,
    {
      ...context,
      method: "PATCH",
      query: {
        updateMask: "description",
      },
      body: {
        description: requireInputString(input.description, "description is required"),
      },
    },
  );

  return {
    mediaItem: normalizeMediaItem(payload),
  };
}

async function createPickerSession(input: Record<string, unknown>, context: GooglePhotosRuntimeContext) {
  const maxItemCount = optionalInteger(input.maxItemCount);
  const payload = await requestGooglePhotosJson(`${googlePhotosPickerApiBaseUrl}/sessions`, {
    ...context,
    method: "POST",
    body: maxItemCount
      ? {
          pickingConfig: {
            maxItemCount: String(maxItemCount),
          },
        }
      : {},
  });

  return {
    session: normalizePickerSession(payload, { pickerUriRequired: true }),
  };
}

async function getPickerSession(input: Record<string, unknown>, context: GooglePhotosRuntimeContext) {
  const sessionId = requireInputString(input.sessionId, "sessionId is required");
  const payload = await requestGooglePhotosJson(
    `${googlePhotosPickerApiBaseUrl}/sessions/${encodeURIComponent(sessionId)}`,
    context,
  );

  return {
    session: normalizePickerSession(payload, { pickerUriRequired: false }),
  };
}

async function deletePickerSession(input: Record<string, unknown>, context: GooglePhotosRuntimeContext) {
  const sessionId = requireInputString(input.sessionId, "sessionId is required");
  const response = await requestGooglePhotosRaw(
    `${googlePhotosPickerApiBaseUrl}/sessions/${encodeURIComponent(sessionId)}`,
    {
      ...context,
      method: "DELETE",
    },
  );
  await assertGooglePhotosResponse(response);

  return {
    sessionId,
    deleted: true,
  };
}

async function listPickedMediaItems(input: Record<string, unknown>, context: GooglePhotosRuntimeContext) {
  const response = await requestGooglePhotosRaw(`${googlePhotosPickerApiBaseUrl}/mediaItems`, {
    ...context,
    method: "GET",
    query: compactObject({
      sessionId: requireInputString(input.sessionId, "sessionId is required"),
      pageSize: optionalInteger(input.pageSize)?.toString(),
      pageToken: optionalString(input.pageToken),
    }),
  });

  if (!response.ok) {
    const errorPayload = await readGooglePhotosErrorPayload(response.clone());
    if (isPickerMediaItemsNotReadyError(errorPayload)) {
      throw new ProviderRequestError(
        400,
        "Picker media items are not ready yet; call get_picker_session until mediaItemsSet is true, then retry list_picked_media_items.",
      );
    }
    await assertGooglePhotosResponse(response);
  }

  const payload = await parseGooglePhotosJson<{
    mediaItems?: unknown[];
    nextPageToken?: string | null;
  }>(response, "googlephotos picker mediaItems");

  return {
    mediaItems: Array.isArray(payload.mediaItems) ? payload.mediaItems.map(normalizePickedMediaItem) : [],
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
  };
}

async function getMediaItemDownload(input: Record<string, unknown>, context: GooglePhotosRuntimeContext) {
  const mediaItemId = requireInputString(input.mediaItemId, "mediaItemId is required");
  const mediaItemPayload = await requestGooglePhotosJson(
    `${googlePhotosApiBaseUrl}/mediaItems/${encodeURIComponent(mediaItemId)}`,
    context,
  );
  const mediaItem = normalizeMediaItem(mediaItemPayload);
  const mimeType = requiredString(mediaItem.mimeType, "mediaItem.mimeType");
  const downloadSuffix = mimeType.startsWith("video/") ? "=dv" : "=d";
  const downloadUrl = `${requiredString(mediaItem.baseUrl, "mediaItem.baseUrl")}${downloadSuffix}`;
  const downloadResponse = await requestGooglePhotosRaw(downloadUrl, {
    ...context,
    method: "GET",
    timeoutMs: googleLongRunningRequestTimeoutMs,
  });
  await assertGooglePhotosResponse(downloadResponse);

  return {
    mediaItemId,
    ...(await uploadDownloadResponseToTransitFile(downloadResponse, {
      context,
      fileName: requiredString(mediaItem.filename, "mediaItem.filename"),
      mimeType,
    })),
  };
}

async function getPickedMediaItemDownload(input: Record<string, unknown>, context: GooglePhotosRuntimeContext) {
  const baseUrl = requireInputString(input.baseUrl, "baseUrl is required");
  const mimeType = requireInputString(input.mimeType, "mimeType is required");
  const filename = requireInputString(input.filename, "filename is required");
  const type = requireInputString(input.type, "type is required");
  assertPickedVideoProcessingReady(input, { type, mimeType });
  const trustedUrl = validateTrustedPickedMediaUrl(baseUrl);
  const downloadSuffix = type === "VIDEO" || mimeType.startsWith("video/") ? "=dv" : "=d";
  const downloadResponse = await requestGooglePhotosRaw(`${trustedUrl.toString()}${downloadSuffix}`, {
    ...context,
    method: "GET",
    timeoutMs: googleLongRunningRequestTimeoutMs,
  });
  await assertGooglePhotosResponse(downloadResponse);

  return uploadDownloadResponseToTransitFile(downloadResponse, {
    context,
    fileName: filename,
    mimeType,
  });
}

async function uploadMedia(input: Record<string, unknown>, context: GooglePhotosRuntimeContext) {
  const source = await resolveSingleUploadSource(input, context.fetcher, context.signal);
  const uploadToken = await uploadSourceToGooglePhotos(source, context);
  const result = await batchCreateWithUploadTokens({
    context,
    items: [
      {
        uploadToken,
        fileName: source.fileName,
        description: optionalString(input.description),
      },
    ],
  });

  const firstResult = optionalRecord(result.newMediaItemResults[0]);
  const mediaItem = optionalRecord(firstResult?.mediaItem);
  if (!mediaItem) {
    const status = optionalRecord(firstResult?.status);
    throw new ProviderRequestError(502, optionalString(status?.message) ?? "googlephotos upload failed");
  }

  return {
    mediaItem: normalizeMediaItem(mediaItem),
  };
}

async function batchCreateMediaItems(input: Record<string, unknown>, context: GooglePhotosRuntimeContext) {
  const urls = Array.isArray(input.urls) ? input.urls : [];
  const mediaFiles = normalizeMediaFiles(input);
  if (urls.length === 0 && mediaFiles.length === 0) {
    throw new ProviderRequestError(400, "urls or mediaFiles is required");
  }

  const items: Array<{ uploadToken: string; fileName: string; description?: string }> = [];

  for (const url of urls) {
    const source = await resolveSingleUploadSource({ url }, context.fetcher, context.signal);
    items.push({
      uploadToken: await uploadSourceToGooglePhotos(source, context),
      fileName: source.fileName,
    });
  }

  for (const mediaFile of mediaFiles) {
    const source = await resolveSingleUploadSource(mediaFile, context.fetcher, context.signal);
    items.push({
      uploadToken: await uploadSourceToGooglePhotos(source, context),
      fileName: source.fileName,
      description: optionalString(mediaFile.description),
    });
  }

  return batchCreateWithUploadTokens({
    context,
    items,
    albumId: optionalString(input.albumId),
    albumPosition: optionalRecord(input.albumPosition),
  });
}

async function uploadDownloadResponseToTransitFile(
  downloadResponse: Response,
  input: {
    context: GooglePhotosRuntimeContext;
    fileName: string;
    mimeType: string;
  },
): Promise<Record<string, unknown>> {
  if (!input.context.transitFiles) {
    throw new ProviderRequestError(500, "Transit file storage is required for Google Photos downloads.");
  }

  const upload = await input.context.transitFiles.create(
    new File([Buffer.from(await downloadResponse.arrayBuffer())], input.fileName, { type: input.mimeType }),
  );

  return {
    fileName: input.fileName,
    mimeType: input.mimeType,
    transitUrl: upload.downloadUrl,
    fileId: upload.fileId,
    downloadUrl: upload.downloadUrl,
    sizeBytes: upload.sizeBytes,
  };
}

async function requestGooglePhotosJson<T>(
  url: string,
  input: {
    accessToken: string;
    fetcher: ProviderFetch;
    signal?: AbortSignal;
    method?: string;
    query?: Record<string, string | undefined>;
    body?: unknown;
  },
): Promise<T> {
  const response = await requestGooglePhotosRaw(url, input);
  await assertGooglePhotosResponse(response);
  return parseGooglePhotosJson<T>(response, service);
}

async function requestGooglePhotosRaw(
  url: string,
  input: {
    accessToken?: string;
    fetcher: ProviderFetch;
    signal?: AbortSignal;
    method?: string;
    query?: Record<string, string | undefined>;
    headers?: Record<string, string>;
    body?: BodyInit | unknown;
    timeoutMs?: number;
  },
): Promise<Response> {
  const target = new URL(url);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      target.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    "user-agent": providerUserAgent,
    ...(input.accessToken ? { authorization: `Bearer ${input.accessToken}` } : {}),
    ...(input.headers ?? {}),
  };
  const hasJsonBody =
    input.body !== undefined &&
    !(input.body instanceof Blob) &&
    !(input.body instanceof FormData) &&
    !(input.body instanceof URLSearchParams) &&
    !(input.body instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(input.body);
  if (hasJsonBody && !hasContentTypeHeader(headers)) {
    headers["content-type"] = "application/json";
  }

  return fetchWithTimeout(target, {
    fetcher: input.fetcher,
    signal: input.signal,
    timeoutMs: input.timeoutMs,
    init: {
      method: input.method ?? (input.body !== undefined ? "POST" : "GET"),
      headers,
      body: hasJsonBody ? JSON.stringify(input.body) : (input.body as BodyInit | undefined),
    },
  });
}

async function fetchWithTimeout(
  url: URL,
  input: {
    fetcher: ProviderFetch;
    init: RequestInit;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<Response> {
  const timeoutMs = input.timeoutMs;
  if (!timeoutMs) {
    return input.fetcher(url, { ...input.init, signal: input.signal });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromParent = (): void => controller.abort(input.signal?.reason);
  if (input.signal) {
    if (input.signal.aborted) {
      abortFromParent();
    } else {
      input.signal.addEventListener("abort", abortFromParent, { once: true });
    }
  }
  try {
    return await input.fetcher(url, {
      ...input.init,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ProviderRequestError(502, "googlephotos request timed out or was aborted");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", abortFromParent);
  }
}

async function assertGooglePhotosResponse(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  throw new ProviderRequestError(
    response.status,
    await extractErrorMessage(response),
    await readGooglePhotosErrorPayload(response.clone()),
  );
}

async function extractErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return `googlephotos request failed with ${response.status}`;
  }

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const error = optionalRecord(parsed.error);
    return optionalString(error?.message) ?? optionalString(parsed.message) ?? text;
  } catch {
    return text;
  }
}

async function readGooglePhotosErrorPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function parseGooglePhotosJson<T>(response: Response, label: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new ProviderRequestError(502, `${label} returned invalid JSON`);
  }
}

function normalizeAlbum(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  return {
    id: requiredString(record.id, "album.id"),
    title: requiredString(record.title, "album.title"),
    productUrl: optionalString(record.productUrl) ?? null,
    mediaItemsCount: optionalString(record.mediaItemsCount) ?? null,
    coverPhotoBaseUrl: optionalString(record.coverPhotoBaseUrl) ?? null,
    coverPhotoMediaItemId: optionalString(record.coverPhotoMediaItemId) ?? null,
    isWriteable: optionalBoolean(record.isWriteable),
    shareInfo: asNullableRecord(record.shareInfo),
  };
}

function normalizeMediaItem(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  const mediaMetadata = asRecord(record.mediaMetadata);

  return {
    id: requiredString(record.id, "mediaItem.id"),
    description: optionalString(record.description) ?? null,
    productUrl: optionalString(record.productUrl) ?? null,
    baseUrl: optionalString(record.baseUrl) ?? null,
    mimeType: optionalString(record.mimeType) ?? null,
    filename: optionalString(record.filename) ?? null,
    mediaMetadata: {
      creationTime: optionalString(mediaMetadata.creationTime) ?? null,
      width: optionalString(mediaMetadata.width) ?? null,
      height: optionalString(mediaMetadata.height) ?? null,
      ...(optionalRecord(mediaMetadata.photo) ? { photo: mediaMetadata.photo } : {}),
      ...(optionalRecord(mediaMetadata.video) ? { video: mediaMetadata.video } : {}),
    },
    contributorInfo: asNullableRecord(record.contributorInfo),
  };
}

function normalizePickerSession(value: unknown, input: { pickerUriRequired: boolean }): Record<string, unknown> {
  const record = asRecord(value);
  const pollingConfig = optionalRecord(record.pollingConfig);
  const pickerUri = optionalString(record.pickerUri);

  return {
    id: requiredString(record.id, "session.id"),
    ...(input.pickerUriRequired
      ? { pickerUri: requiredString(record.pickerUri, "session.pickerUri") }
      : pickerUri
        ? { pickerUri }
        : {}),
    expireTime: requiredString(record.expireTime, "session.expireTime"),
    mediaItemsSet: requiredBoolean(record.mediaItemsSet, "session.mediaItemsSet"),
    ...(pollingConfig
      ? {
          pollingConfig: {
            pollInterval: requiredString(pollingConfig.pollInterval, "session.pollingConfig.pollInterval"),
            timeoutIn: requiredString(pollingConfig.timeoutIn, "session.pollingConfig.timeoutIn"),
          },
        }
      : {}),
  };
}

function normalizePickedMediaItem(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  const mediaFile = asRecord(record.mediaFile);

  return {
    id: requiredString(record.id, "pickedMediaItem.id"),
    createTime: requiredString(record.createTime, "pickedMediaItem.createTime"),
    type: requiredString(record.type, "pickedMediaItem.type"),
    baseUrl: requiredString(mediaFile.baseUrl, "pickedMediaItem.mediaFile.baseUrl"),
    mimeType: requiredString(mediaFile.mimeType, "pickedMediaItem.mediaFile.mimeType"),
    filename: requiredString(mediaFile.filename, "pickedMediaItem.mediaFile.filename"),
    mediaFileMetadata: asRecord(mediaFile.mediaFileMetadata),
  };
}

function validateTrustedPickedMediaUrl(baseUrl: string): URL {
  const url = parseHttpsUrl(baseUrl, "picked media baseUrl");
  if (!googlePhotosPickerDownloadHostAllowlist.has(url.hostname)) {
    throw new ProviderRequestError(400, "picked media baseUrl host is not trusted for Google Photos download");
  }
  return url;
}

function assertPickedVideoProcessingReady(
  input: Record<string, unknown>,
  mediaItem: { type: string; mimeType: string },
): void {
  if (mediaItem.type !== "VIDEO" && !mediaItem.mimeType.startsWith("video/")) {
    return;
  }

  const processingStatus = optionalString(asRecord(asRecord(input.mediaFileMetadata).videoMetadata).processingStatus);
  if (processingStatus === "READY") {
    return;
  }

  throw new ProviderRequestError(
    400,
    processingStatus == null
      ? "picked video download requires mediaFileMetadata.videoMetadata.processingStatus to be READY"
      : `picked video download requires mediaFileMetadata.videoMetadata.processingStatus to be READY; got ${processingStatus}`,
  );
}

function isPickerMediaItemsNotReadyError(value: unknown): boolean {
  const error = asRecord(asRecord(value).error);
  if (error.status === "FAILED_PRECONDITION") {
    return true;
  }

  const details = Array.isArray(error.details) ? error.details : [];
  return details.some((detail) => {
    const record = asRecord(detail);
    return (
      record.status === "FAILED_PRECONDITION" ||
      record.reason === "FAILED_PRECONDITION" ||
      record.errorCode === "FAILED_PRECONDITION"
    );
  });
}

async function resolveSingleUploadSource(
  input: Record<string, unknown>,
  fetcher: ProviderFetch,
  signal: AbortSignal | undefined,
): Promise<GooglePhotosUploadSource> {
  const fileName = optionalString(input.fileName);
  const explicitMimeType = optionalString(input.mimeType);
  const url = optionalString(input.url);
  const contentBase64 = optionalString(input.contentBase64);

  if (!url && !contentBase64) {
    throw new ProviderRequestError(400, "url or contentBase64 is required");
  }

  if (contentBase64 && !fileName) {
    throw new ProviderRequestError(400, "fileName is required");
  }

  if (url) {
    parseHttpsUrl(url, "upload source URL");
    const remoteResponse = await requestGooglePhotosRaw(url, {
      fetcher,
      signal,
      method: "GET",
      timeoutMs: googleLongRunningRequestTimeoutMs,
    });
    if (!remoteResponse.ok) {
      throw new ProviderRequestError(remoteResponse.status, `failed to fetch upload source: ${remoteResponse.status}`);
    }

    const bytes = new Uint8Array(await remoteResponse.arrayBuffer());

    return {
      bytes,
      fileName: fileName ?? inferFileNameFromUrl(url),
      mimeType: explicitMimeType ?? inferMimeType(remoteResponse.headers.get("content-type")),
      sizeBytes: bytes.byteLength,
    };
  }

  const bytes = decodeBase64Content(contentBase64);
  const resolvedFileName = requireInputString(fileName, "fileName is required");
  return {
    bytes,
    fileName: resolvedFileName,
    mimeType: explicitMimeType ?? "application/octet-stream",
    sizeBytes: bytes.byteLength,
  };
}

async function uploadSourceToGooglePhotos(
  input: GooglePhotosUploadSource,
  context: GooglePhotosRuntimeContext,
): Promise<string> {
  const session = await startResumableUploadSession(
    {
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    },
    context,
  );

  return uploadResumableBuffer(input.bytes, session, context);
}

async function startResumableUploadSession(
  input: { fileName: string; mimeType: string; sizeBytes: number },
  context: GooglePhotosRuntimeContext,
): Promise<{ uploadUrl: string; chunkGranularity: number }> {
  const response = await requestGooglePhotosRaw(`${googlePhotosApiBaseUrl}/uploads`, {
    ...context,
    method: "POST",
    headers: {
      "content-length": "0",
      "x-goog-upload-command": "start",
      "x-goog-upload-file-name": input.fileName,
      "x-goog-upload-protocol": "resumable",
      "x-goog-upload-content-type": input.mimeType,
      "x-goog-upload-raw-size": String(input.sizeBytes),
    },
  });

  await assertGooglePhotosResponse(response);

  const uploadUrl = response.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new ProviderRequestError(502, "missing Google Photos resumable upload url");
  }

  return {
    uploadUrl,
    chunkGranularity:
      parseContentLength(response.headers.get("x-goog-upload-chunk-granularity")) ?? defaultUploadChunkGranularity,
  };
}

async function uploadResumableBuffer(
  bytes: Uint8Array,
  session: { uploadUrl: string; chunkGranularity: number },
  context: GooglePhotosRuntimeContext,
): Promise<string> {
  let offset = 0;

  while (offset < bytes.byteLength) {
    const remaining = bytes.byteLength - offset;
    const chunkLength = Math.min(remaining, session.chunkGranularity);
    const uploadToken = await uploadResumableChunk(bytes.subarray(offset, offset + chunkLength), {
      uploadUrl: session.uploadUrl,
      offset,
      finalize: offset + chunkLength === bytes.byteLength,
      context,
    });

    if (uploadToken) {
      return uploadToken;
    }

    offset += chunkLength;
  }

  throw new ProviderRequestError(502, "missing Google Photos upload token");
}

async function uploadResumableChunk(
  bytes: Uint8Array,
  input: {
    uploadUrl: string;
    offset: number;
    finalize: boolean;
    context: GooglePhotosRuntimeContext;
  },
): Promise<string | null> {
  const response = await requestGooglePhotosRaw(input.uploadUrl, {
    ...input.context,
    method: "POST",
    timeoutMs: googleLongRunningRequestTimeoutMs,
    headers: {
      "content-length": String(bytes.byteLength),
      "x-goog-upload-command": input.finalize ? "upload, finalize" : "upload",
      "x-goog-upload-offset": String(input.offset),
    },
    body: Uint8Array.from(bytes),
  });

  await assertGooglePhotosResponse(response);

  if (!input.finalize) {
    return null;
  }

  const uploadToken = (await response.text()).trim();
  if (!uploadToken) {
    throw new ProviderRequestError(502, `missing Google Photos upload token (offset: ${input.offset})`);
  }
  return uploadToken;
}

async function batchCreateWithUploadTokens(input: {
  context: GooglePhotosRuntimeContext;
  items: Array<{ uploadToken: string; fileName: string; description?: string }>;
  albumId?: string;
  albumPosition?: Record<string, unknown>;
}): Promise<{ newMediaItemResults: unknown[] }> {
  const payload = await requestGooglePhotosJson(`${googlePhotosApiBaseUrl}/mediaItems:batchCreate`, {
    ...input.context,
    method: "POST",
    body: {
      ...(input.albumId ? { albumId: input.albumId } : {}),
      ...(input.albumPosition ? { albumPosition: input.albumPosition } : {}),
      newMediaItems: input.items.map((item) => ({
        ...(item.description ? { description: item.description } : {}),
        simpleMediaItem: {
          uploadToken: item.uploadToken,
          fileName: item.fileName,
        },
      })),
    },
  });

  const record = asRecord(payload);
  return {
    newMediaItemResults: Array.isArray(record.newMediaItemResults) ? record.newMediaItemResults : [],
  };
}

function normalizeMediaFiles(input: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(input.mediaFiles)
    ? input.mediaFiles.filter((item): item is Record<string, unknown> => optionalRecord(item) != null)
    : [];
}

function assertAlbumPosition(value: unknown): void {
  const position = asRecord(value);
  if (position.position === "AFTER_MEDIA_ITEM" && !optionalString(position.relativeMediaItemId)) {
    throw new ProviderRequestError(400, "relativeMediaItemId is required when position is AFTER_MEDIA_ITEM");
  }
  if (position.position === "AFTER_ENRICHMENT_ITEM" && !optionalString(position.relativeEnrichmentItemId)) {
    throw new ProviderRequestError(400, "relativeEnrichmentItemId is required when position is AFTER_ENRICHMENT_ITEM");
  }
}

function assertEnrichmentItem(value: unknown): void {
  const item = asRecord(value);
  const variants = [item.textEnrichment != null, item.locationEnrichment != null, item.mapEnrichment != null].filter(
    Boolean,
  ).length;
  if (variants !== 1) {
    throw new ProviderRequestError(400, "exactly one enrichment variant is required");
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new ProviderRequestError(502, `missing ${field}`);
}

function requireInputString(value: unknown, message: string): string {
  const resolved = optionalString(value);
  if (!resolved) {
    throw new ProviderRequestError(400, message);
  }
  return resolved;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  throw new ProviderRequestError(502, `missing ${field}`);
}

function parseHttpsUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderRequestError(400, `${label} must be a valid URL`);
  }

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, `${label} must use https`);
  }
  if (hasExplicitPort(value)) {
    throw new ProviderRequestError(400, `${label} must not include a port`);
  }
  return url;
}

function inferFileNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const fileName = pathname.split("/").filter(Boolean).at(-1);
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
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function decodeBase64Content(contentBase64: string | undefined): Uint8Array {
  try {
    return Uint8Array.from(Buffer.from(contentBase64 ?? "", "base64"));
  } catch {
    throw new ProviderRequestError(400, "contentBase64 must be valid base64");
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return optionalRecord(value) ?? {};
}

function asNullableRecord(value: unknown): Record<string, unknown> | null {
  return optionalRecord(value) ?? null;
}

function hasContentTypeHeader(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((header) => header.toLowerCase() === "content-type");
}

function hasExplicitPort(url: string): boolean {
  const schemeSeparatorIndex = url.indexOf("://");
  if (schemeSeparatorIndex < 0) {
    return false;
  }

  const authorityStart = schemeSeparatorIndex + 3;
  let authorityEnd = url.length;
  for (const delimiter of ["/", "?", "#"]) {
    const index = url.indexOf(delimiter, authorityStart);
    if (index >= 0 && index < authorityEnd) {
      authorityEnd = index;
    }
  }

  const authority = url.slice(authorityStart, authorityEnd);
  const host = authority.includes("@") ? authority.slice(authority.lastIndexOf("@") + 1) : authority;
  return host.includes(":");
}

function providerRequestError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://photoslibrary.googleapis.com/v1",
  auth: { type: "oauth_bearer" },
});
