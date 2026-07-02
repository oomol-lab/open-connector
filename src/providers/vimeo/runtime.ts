import type { CredentialValidationResult } from "../../core/types.ts";
import type { OAuthProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { VimeoActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, queryParams } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const vimeoApiBaseUrl = "https://api.vimeo.com";
const vimeoDefaultRequestTimeoutMs = 30_000;

type VimeoActionContext = OAuthProviderContext;
type VimeoActionHandler = ProviderRuntimeHandler<VimeoActionContext>;

interface VimeoRequestInput {
  path: string;
  accessToken: string;
  fetcher: ProviderFetch;
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  signal?: AbortSignal;
}

export const vimeoActionHandlers: Record<VimeoActionName, VimeoActionHandler> = {
  get_current_user(_input, context) {
    return vimeoGetCurrentUser(context);
  },
  list_user_videos(input, context) {
    return vimeoListUserVideos(input, context);
  },
  get_video(input, context) {
    return vimeoGetVideo(input, context);
  },
  update_video(input, context) {
    return vimeoUpdateVideo(input, context);
  },
  delete_video(input, context) {
    return vimeoDeleteVideo(input, context);
  },
  upload_video_from_url(input, context) {
    return vimeoUploadVideoFromUrl(input, context);
  },
  replace_video_from_url(input, context) {
    return vimeoReplaceVideoFromUrl(input, context);
  },
  get_video_download_links(input, context) {
    return vimeoGetVideoDownloadLinks(input, context);
  },
  download_video_file(input, context) {
    return vimeoDownloadVideoFile(input, context);
  },
  list_video_tags(input, context) {
    return vimeoListVideoTags(input, context);
  },
  add_video_tags(input, context) {
    return vimeoAddVideoTags(input, context);
  },
  delete_video_tag(input, context) {
    return vimeoDeleteVideoTag(input, context);
  },
  list_showcases(input, context) {
    return vimeoListShowcases(input, context);
  },
  get_showcase(input, context) {
    return vimeoGetShowcase(input, context);
  },
  list_showcase_videos(input, context) {
    return vimeoListShowcaseVideos(input, context);
  },
  add_video_to_showcase(input, context) {
    return vimeoAddVideoToShowcase(input, context);
  },
  remove_video_from_showcase(input, context) {
    return vimeoRemoveVideoFromShowcase(input, context);
  },
  list_folders(input, context) {
    return vimeoListFolders(input, context);
  },
  create_folder(input, context) {
    return vimeoCreateFolder(input, context);
  },
  get_folder(input, context) {
    return vimeoGetFolder(input, context);
  },
  update_folder(input, context) {
    return vimeoUpdateFolder(input, context);
  },
  delete_folder(input, context) {
    return vimeoDeleteFolder(input, context);
  },
  list_folder_videos(input, context) {
    return vimeoListFolderVideos(input, context);
  },
  add_video_to_folder(input, context) {
    return vimeoAddVideoToFolder(input, context);
  },
  remove_video_from_folder(input, context) {
    return vimeoRemoveVideoFromFolder(input, context);
  },
};

export async function validateVimeoCredential(
  accessToken: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const user = await fetchVimeoCurrentAccount(accessToken, fetcher, signal);
  return {
    profile: {
      accountId: user.accountId,
      displayName: user.displayName,
    },
    grantedScopes: [],
    metadata: user.metadata,
  };
}

async function vimeoGetCurrentUser(context: VimeoActionContext): Promise<unknown> {
  const user = await vimeoRequestJson({
    path: "/me",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });
  return { user };
}

async function vimeoListUserVideos(input: Record<string, unknown>, context: VimeoActionContext): Promise<unknown> {
  return normalizePagedPayload(
    await vimeoRequestJson({
      path: `${userPath(input.userId)}/videos`,
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      query: {
        query: optionalString(input.query),
        sort: optionalString(input.sort),
        direction: optionalString(input.direction),
        filter: optionalString(input.filter),
        page: optionalNumber(input.page),
        per_page: optionalNumber(input.perPage),
      },
      signal: context.signal,
    }),
  );
}

async function vimeoGetVideo(input: Record<string, unknown>, context: VimeoActionContext): Promise<unknown> {
  const video = await vimeoRequestJson({
    path: `/videos/${input.videoId}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });
  return { video };
}

async function vimeoUpdateVideo(input: Record<string, unknown>, context: VimeoActionContext): Promise<unknown> {
  const video = await vimeoRequestJson({
    path: `/videos/${input.videoId}`,
    method: "PATCH",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    body: compactObject({
      name: optionalString(input.name),
      description: optionalString(input.description),
      license: optionalString(input.license),
    }),
    signal: context.signal,
  });
  return { video };
}

async function vimeoDeleteVideo(input: Record<string, unknown>, context: VimeoActionContext): Promise<unknown> {
  await vimeoRequestJson({
    path: `/videos/${input.videoId}`,
    method: "DELETE",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });
  return { deleted: true, videoId: input.videoId };
}

async function vimeoUploadVideoFromUrl(input: Record<string, unknown>, context: VimeoActionContext): Promise<unknown> {
  const video = await vimeoRequestJson({
    path: `${userPath(input.userId)}/videos`,
    method: "POST",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    body: buildVimeoPullUploadBody(input),
    signal: context.signal,
  });
  return { video };
}

async function vimeoReplaceVideoFromUrl(input: Record<string, unknown>, context: VimeoActionContext): Promise<unknown> {
  const version = await vimeoRequestJson({
    path: `/videos/${input.videoId}/versions`,
    method: "POST",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    body: compactObject({
      file_name: optionalString(input.fileName),
      upload: compactObject({
        approach: "pull",
        link: requireHttpUrl(input.sourceUrl, "sourceUrl"),
        size: optionalNumber(input.sourceSizeBytes),
      }),
    }),
    signal: context.signal,
  });
  return { version };
}

async function vimeoGetVideoDownloadLinks(
  input: Record<string, unknown>,
  context: VimeoActionContext,
): Promise<{ downloadLinks: Array<Record<string, unknown> & { link: string }> }> {
  const video = requireRecord(
    await vimeoRequestJson({
      path: `/videos/${input.videoId}`,
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
    }),
    "Vimeo video",
  );
  return { downloadLinks: normalizeDownloadLinks(video.download) };
}

async function vimeoDownloadVideoFile(input: Record<string, unknown>, context: VimeoActionContext): Promise<unknown> {
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "Transit file storage is not enabled.");
  }

  const { downloadLinks } = await vimeoGetVideoDownloadLinks(input, context);
  const selected = selectDownloadLink(downloadLinks, input);
  const response = await fetchVimeoDownloadLink(selected.link, context.fetcher, context.signal);
  if (!response.ok) {
    throw new ProviderRequestError(
      response.status >= 500 ? 502 : response.status,
      `vimeo file download failed with ${response.status}`,
    );
  }

  const mimeType = response.headers.get("content-type") ?? optionalString(selected.type) ?? "application/octet-stream";
  const name = resolveDownloadFileName(input, selected, mimeType);
  const upload = await context.transitFiles.create(new File([await response.arrayBuffer()], name, { type: mimeType }));

  return {
    videoId: input.videoId,
    sourceUrl: selected.link,
    file: {
      fileId: upload.fileId,
      downloadUrl: upload.downloadUrl,
      sizeBytes: upload.sizeBytes,
      name: upload.name,
      mimeType,
    },
  };
}

async function vimeoListVideoTags(input: Record<string, unknown>, context: VimeoActionContext): Promise<unknown> {
  return normalizePagedPayload(
    await vimeoRequestJson({
      path: `/videos/${input.videoId}/tags`,
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      query: {
        page: optionalNumber(input.page),
        per_page: optionalNumber(input.perPage),
      },
      signal: context.signal,
    }),
  );
}

async function vimeoAddVideoTags(input: Record<string, unknown>, context: VimeoActionContext): Promise<unknown> {
  const tags = Array.isArray(input.tags) ? input.tags.map((tag) => ({ name: String(tag) })) : [];
  return {
    tags: normalizeArrayPayload(
      await vimeoRequestJson({
        path: `/videos/${input.videoId}/tags`,
        method: "PUT",
        accessToken: context.accessToken,
        fetcher: context.fetcher,
        body: tags,
        signal: context.signal,
      }),
    ),
  };
}

async function vimeoDeleteVideoTag(input: Record<string, unknown>, context: VimeoActionContext): Promise<unknown> {
  const tag = String(input.tag);
  await vimeoRequestJson({
    path: `/videos/${input.videoId}/tags/${encodeURIComponent(tag)}`,
    method: "DELETE",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });
  return { deleted: true, videoId: input.videoId, tag };
}

async function vimeoListShowcases(input: Record<string, unknown>, context: VimeoActionContext): Promise<unknown> {
  return normalizePagedPayload(
    await vimeoRequestJson({
      path: `${userPath(input.userId)}/albums`,
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      query: {
        query: optionalString(input.query),
        sort: optionalString(input.sort),
        direction: optionalString(input.direction),
        page: optionalNumber(input.page),
        per_page: optionalNumber(input.perPage),
      },
      signal: context.signal,
    }),
  );
}

async function vimeoGetShowcase(input: Record<string, unknown>, context: VimeoActionContext): Promise<unknown> {
  const showcase = await vimeoRequestJson({
    path: `${userPath(input.userId)}/albums/${input.showcaseId}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });
  return { showcase };
}

async function vimeoListShowcaseVideos(input: Record<string, unknown>, context: VimeoActionContext): Promise<unknown> {
  return normalizePagedPayload(
    await vimeoRequestJson({
      path: `${userPath(input.userId)}/albums/${input.showcaseId}/videos`,
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      query: {
        sort: optionalString(input.sort),
        direction: optionalString(input.direction),
        page: optionalNumber(input.page),
        per_page: optionalNumber(input.perPage),
      },
      signal: context.signal,
    }),
  );
}

async function vimeoAddVideoToShowcase(input: Record<string, unknown>, context: VimeoActionContext): Promise<unknown> {
  await vimeoRequestJson({
    path: `${userPath(input.userId)}/albums/${input.showcaseId}/videos/${input.videoId}`,
    method: "PUT",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });
  return { added: true, userId: input.userId ?? null, showcaseId: input.showcaseId, videoId: input.videoId };
}

async function vimeoRemoveVideoFromShowcase(
  input: Record<string, unknown>,
  context: VimeoActionContext,
): Promise<unknown> {
  await vimeoRequestJson({
    path: `${userPath(input.userId)}/albums/${input.showcaseId}/videos/${input.videoId}`,
    method: "DELETE",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });
  return { removed: true, userId: input.userId ?? null, showcaseId: input.showcaseId, videoId: input.videoId };
}

async function vimeoListFolders(input: Record<string, unknown>, context: VimeoActionContext): Promise<unknown> {
  return normalizePagedPayload(
    await vimeoRequestJson({
      path: `${userPath(input.userId)}/projects`,
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      query: {
        query: optionalString(input.query),
        sort: optionalString(input.sort),
        direction: optionalString(input.direction),
        page: optionalNumber(input.page),
        per_page: optionalNumber(input.perPage),
      },
      signal: context.signal,
    }),
  );
}

async function vimeoCreateFolder(input: Record<string, unknown>, context: VimeoActionContext): Promise<unknown> {
  const folder = await vimeoRequestJson({
    path: `${userPath(input.userId)}/projects`,
    method: "POST",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    body: compactObject({
      name: optionalString(input.name),
      parent_folder_uri: optionalString(input.parentFolderUri),
    }),
    signal: context.signal,
  });
  return { folder };
}

async function vimeoGetFolder(input: Record<string, unknown>, context: VimeoActionContext): Promise<unknown> {
  const folder = await vimeoRequestJson({
    path: `${userPath(input.userId)}/projects/${input.folderId}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });
  return { folder };
}

async function vimeoUpdateFolder(input: Record<string, unknown>, context: VimeoActionContext): Promise<unknown> {
  const folder = await vimeoRequestJson({
    path: `${userPath(input.userId)}/projects/${input.folderId}`,
    method: "PATCH",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    body: { name: optionalString(input.name) },
    signal: context.signal,
  });
  return { folder };
}

async function vimeoDeleteFolder(input: Record<string, unknown>, context: VimeoActionContext): Promise<unknown> {
  const shouldDeleteVideos = optionalBoolean(input.shouldDeleteVideos);
  await vimeoRequestJson({
    path: `${userPath(input.userId)}/projects/${input.folderId}`,
    method: "DELETE",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    body: shouldDeleteVideos === undefined ? undefined : { should_delete_clips: shouldDeleteVideos },
    signal: context.signal,
  });
  return { deleted: true, userId: input.userId ?? null, folderId: input.folderId };
}

async function vimeoListFolderVideos(input: Record<string, unknown>, context: VimeoActionContext): Promise<unknown> {
  return normalizePagedPayload(
    await vimeoRequestJson({
      path: `${userPath(input.userId)}/projects/${input.folderId}/videos`,
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      query: {
        query: optionalString(input.query),
        sort: optionalString(input.sort),
        direction: optionalString(input.direction),
        include_subfolders: optionalBoolean(input.includeSubfolders),
        page: optionalNumber(input.page),
        per_page: optionalNumber(input.perPage),
      },
      signal: context.signal,
    }),
  );
}

async function vimeoAddVideoToFolder(input: Record<string, unknown>, context: VimeoActionContext): Promise<unknown> {
  await vimeoRequestJson({
    path: `${userPath(input.userId)}/projects/${input.folderId}/videos/${input.videoId}`,
    method: "PUT",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });
  return { added: true, userId: input.userId ?? null, folderId: input.folderId, videoId: input.videoId };
}

async function vimeoRemoveVideoFromFolder(
  input: Record<string, unknown>,
  context: VimeoActionContext,
): Promise<unknown> {
  await vimeoRequestJson({
    path: `${userPath(input.userId)}/projects/${input.folderId}/videos/${input.videoId}`,
    method: "DELETE",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });
  return { removed: true, userId: input.userId ?? null, folderId: input.folderId, videoId: input.videoId };
}

async function fetchVimeoCurrentAccount(
  accessToken: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<{ accountId: string; displayName: string; metadata: Record<string, unknown> }> {
  const payload = await vimeoRequestJson({ path: "/me", accessToken, fetcher, signal });
  const user = requireRecord(payload, "Vimeo user");
  const uri = optionalString(user.uri) ?? "/me";
  const name = optionalString(user.name) ?? "Vimeo User";

  return {
    accountId: uri,
    displayName: name,
    metadata: compactObject({
      userUri: uri,
      userName: name,
      link: optionalString(user.link),
    }),
  };
}

async function vimeoRequestJson(input: VimeoRequestInput): Promise<unknown> {
  const url = new URL(input.path, vimeoApiBaseUrl);
  for (const [key, value] of Object.entries(queryParams(input.query ?? {}))) {
    url.searchParams.set(key, value);
  }

  const method = input.method ?? "GET";
  const timeout = createProviderTimeout(input.signal, vimeoDefaultRequestTimeoutMs);
  try {
    const headers: Record<string, string> = {
      authorization: `Bearer ${input.accessToken}`,
      accept: "application/vnd.vimeo.*+json;version=3.4",
      "user-agent": providerUserAgent,
    };
    if (input.body !== undefined) {
      headers["content-type"] = "application/json";
    }

    const response = await input.fetcher(url.toString(), {
      method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readVimeoPayload(response);
    if (!response.ok) {
      throw createVimeoError(response.status, payload);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, `vimeo ${input.path} request timed out`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `vimeo request failed: ${error.message}` : "vimeo request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function normalizePagedPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    return { data: normalizeArrayPayload(payload), page: null, perPage: null, total: null, paging: {} };
  }
  return {
    data: normalizeArrayPayload(record.data),
    page: optionalNumber(record.page) ?? null,
    perPage: optionalNumber(record.perPage) ?? optionalNumber(record.per_page) ?? null,
    total: optionalNumber(record.total) ?? null,
    paging: optionalRecord(record.paging) ?? {},
  };
}

function normalizeArrayPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  const record = optionalRecord(payload);
  return Array.isArray(record?.data) ? record.data : [];
}

function buildVimeoPullUploadBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    description: optionalString(input.description),
    folder_uri: optionalString(input.folderUri),
    privacy: compactObject({
      view: optionalString(input.privacyView),
      download: optionalBoolean(input.privacyDownload),
    }),
    upload: compactObject({
      approach: "pull",
      link: requireHttpUrl(input.sourceUrl, "sourceUrl"),
      size: optionalNumber(input.sourceSizeBytes),
    }),
  });
}

function requireHttpUrl(value: unknown, fieldName: string): string {
  const raw = requiredString(value, fieldName, badInput);
  return assertPublicHttpUrl(raw, { fieldName, createError: badInput }).toString();
}

function normalizeDownloadLinks(value: unknown): Array<Record<string, unknown> & { link: string }> {
  return normalizeArrayPayload(value).flatMap((item) => {
    const record = optionalRecord(item);
    const link = optionalString(record?.link);
    return link ? [{ ...record, link }] : [];
  });
}

function selectDownloadLink(
  links: Array<Record<string, unknown> & { link: string }>,
  input: Record<string, unknown>,
): Record<string, unknown> & { link: string } {
  const quality = optionalString(input.quality);
  const type = optionalString(input.type);
  const selected = links.find((link) => {
    if (quality && optionalString(link.quality) !== quality) {
      return false;
    }
    if (type && optionalString(link.type) !== type) {
      return false;
    }
    return true;
  });

  if (!selected) {
    if (quality || type) {
      throw new ProviderRequestError(400, "no Vimeo downloadable file link matches the requested quality/type");
    }
    throw new ProviderRequestError(502, "vimeo video has no downloadable file links");
  }
  return selected;
}

async function fetchVimeoDownloadLink(link: string, fetcher: ProviderFetch, signal?: AbortSignal): Promise<Response> {
  const timeout = createProviderTimeout(signal, vimeoDefaultRequestTimeoutMs);
  try {
    return await fetcher(link, { signal: timeout.signal });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "vimeo file download request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `vimeo file download failed: ${error.message}` : "vimeo file download failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function resolveDownloadFileName(
  input: Record<string, unknown>,
  selected: Record<string, unknown>,
  mimeType: string,
): string {
  const explicitName = optionalString(input.fileName);
  if (explicitName) {
    return explicitName;
  }
  const quality = optionalString(selected.quality);
  const extension = resolveFileExtension(mimeType) ?? resolveFileExtension(optionalString(selected.type) ?? "");
  const baseName = quality ? `vimeo-${input.videoId}-${quality}` : `vimeo-${input.videoId}`;
  return extension ? `${baseName}.${extension}` : baseName;
}

function resolveFileExtension(mimeType: string): string | undefined {
  const normalized = mimeType.split(";")[0]?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized.includes("mp4")) {
    return "mp4";
  }
  if (normalized.includes("mpegurl") || normalized.includes("m3u8")) {
    return "m3u8";
  }
  return normalized.split("/")[1]?.replaceAll("x-", "").replaceAll("quicktime", "mov");
}

async function readVimeoPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createVimeoError(status: number, payload: unknown): ProviderRequestError {
  const message = extractVimeoErrorMessage(payload) ?? `vimeo request failed with ${status}`;
  if (status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function extractVimeoErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return (
    optionalString(record?.developer_message) ??
    optionalString(record?.message) ??
    optionalString(record?.error_description) ??
    optionalString(record?.error)
  );
}

function userPath(value: unknown): string {
  return typeof value === "number" ? `/users/${value}` : "/me";
}

function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`);
  }
  return record;
}

function badInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
