import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalRecord as asOptionalObject,
  optionalString as asOptionalString,
  requiredRecord,
} from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  defineOAuthProviderExecutors,
  normalizeProviderProxyEndpoint,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyResponse,
  requireOAuthCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const dropboxApiBaseUrl = "https://api.dropboxapi.com/2";
const dropboxContentBaseUrl = "https://content.dropboxapi.com/2";
const dropboxFetch = createProviderFetch({ skipDnsValidation: true });
const dropboxMaxSimpleUploadBytes = 150 * 1024 * 1024;
const dropboxContentEndpointPrefixes = [
  "/files/download",
  "/files/export",
  "/files/get_preview",
  "/files/get_thumbnail",
  "/files/get_thumbnail_v2",
  "/files/upload",
  "/files/upload_session",
  "/sharing/get_shared_link_file",
];

type ActionContext = OAuthProviderContext;

type ActionHandler = (input: Record<string, unknown>, context: ActionContext) => Promise<unknown>;

type DropboxUploadSource = {
  bytes: Uint8Array;
  mimeType: string;
};

type SharedLinkFileArg = {
  url: string;
  path?: string;
};

export const dropboxActionHandlers: Record<string, ActionHandler> = {
  get_current_account(_input, { accessToken, fetcher }) {
    return getCurrentAccount(accessToken, fetcher);
  },
  list_folder(input, { accessToken, fetcher }) {
    return listFolder(input, accessToken, fetcher);
  },
  list_folder_continue(input, { accessToken, fetcher }) {
    return listFolderContinue(input, accessToken, fetcher);
  },
  get_metadata(input, { accessToken, fetcher }) {
    return getMetadata(input, accessToken, fetcher);
  },
  download_file(input, context) {
    return downloadFile(input, context);
  },
  upload_file(input, { accessToken, fetcher }) {
    return uploadFile(input, accessToken, fetcher);
  },
  create_folder(input, { accessToken, fetcher }) {
    return createFolder(input, accessToken, fetcher);
  },
  move(input, { accessToken, fetcher }) {
    return relocate(input, accessToken, fetcher, "move_v2");
  },
  copy(input, { accessToken, fetcher }) {
    return relocate(input, accessToken, fetcher, "copy_v2");
  },
  delete(input, { accessToken, fetcher }) {
    return deletePath(input, accessToken, fetcher);
  },
  create_shared_link(input, { accessToken, fetcher }) {
    return createSharedLink(input, accessToken, fetcher);
  },
  list_shared_links(input, { accessToken, fetcher }) {
    return listSharedLinks(input, accessToken, fetcher);
  },
  search_files(input, { accessToken, fetcher }) {
    return searchFiles(input, accessToken, fetcher);
  },
  search_files_continue(input, { accessToken, fetcher }) {
    return searchFilesContinue(input, accessToken, fetcher);
  },
  get_temporary_link(input, { accessToken, fetcher }) {
    return getTemporaryLink(input, accessToken, fetcher);
  },
  save_url(input, { accessToken, fetcher }) {
    return saveUrl(input, accessToken, fetcher);
  },
  save_url_check_job_status(input, { accessToken, fetcher }) {
    return saveUrlCheckJobStatus(input, accessToken, fetcher);
  },
  list_revisions(input, { accessToken, fetcher }) {
    return listRevisions(input, accessToken, fetcher);
  },
  restore(input, { accessToken, fetcher }) {
    return restoreRevision(input, accessToken, fetcher);
  },
  get_shared_link_metadata(input, { accessToken, fetcher }) {
    return getSharedLinkMetadata(input, accessToken, fetcher);
  },
  get_shared_link_file(input, context) {
    return getSharedLinkFile(input, context);
  },
  modify_shared_link(input, { accessToken, fetcher }) {
    return modifySharedLink(input, accessToken, fetcher);
  },
  revoke_shared_link(input, { accessToken, fetcher }) {
    return revokeSharedLink(input, accessToken, fetcher);
  },
  get_tags(input, { accessToken, fetcher }) {
    return getTags(input, accessToken, fetcher);
  },
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors("dropbox", dropboxActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireOAuthCredential(context, "dropbox");
    const endpoint = normalizeProviderProxyEndpoint(input.endpoint);
    const url = createProviderProxyUrl(dropboxProxyBaseUrl(endpoint), endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `${credential.tokenType} ${credential.accessToken}`);
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await dropboxFetch(url, init);
    if (!response.ok) {
      throw await normalizeDropboxHttpError(response, "Dropbox request failed");
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Dropbox request failed");
  }
};

function dropboxProxyBaseUrl(endpoint: string): string {
  return dropboxContentEndpointPrefixes.some((prefix) => endpoint === prefix || endpoint.startsWith(`${prefix}/`))
    ? dropboxContentBaseUrl
    : dropboxApiBaseUrl;
}

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }) {
    const account = await getCurrentAccount(input.accessToken, fetcher);
    return {
      profile: {
        accountId: account.accountId,
        displayName: account.displayName,
      },
      metadata: {
        currentAccount: account,
      },
    };
  },
};

async function getCurrentAccount(accessToken: string, fetcher: typeof fetch) {
  const payload = await dropboxRpcRequest("users/get_current_account", {
    accessToken,
    fetcher,
  });

  const name = asOptionalObject(payload.name) ?? {};
  const team = asOptionalObject(payload.team) ?? {};
  const accountType = asOptionalObject(payload.account_type) ?? {};

  return {
    accountId: requireString(payload.account_id, "dropbox account_id"),
    displayName: requireString(name.display_name, "dropbox name.display_name"),
    abbreviatedName: optionalString(name.abbreviated_name) ?? null,
    givenName: optionalString(name.given_name) ?? null,
    surname: optionalString(name.surname) ?? null,
    email: optionalString(payload.email) ?? null,
    emailVerified: readBoolean(payload.email_verified),
    disabled: readBoolean(payload.disabled) ?? false,
    locale: optionalString(payload.locale) ?? null,
    country: optionalString(payload.country) ?? null,
    accountType: optionalString(accountType[".tag"]) ?? null,
    teamId: optionalString(team.id) ?? null,
    teamName: optionalString(team.name) ?? null,
  };
}

async function listFolder(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dropboxRpcRequest("files/list_folder", {
    accessToken,
    fetcher,
    body: compactObject({
      path: optionalString(input.path) ?? "",
      recursive: readBoolean(input.recursive),
      include_deleted: readBoolean(input.includeDeleted),
      include_mounted_folders: readBoolean(input.includeMountedFolders),
      include_has_explicit_shared_members: readBoolean(input.includeHasExplicitSharedMembers),
      limit: readNumber(input.limit),
    }),
  });

  return normalizeListFolderResult(payload);
}

async function listFolderContinue(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dropboxRpcRequest("files/list_folder/continue", {
    accessToken,
    fetcher,
    body: {
      cursor: requireString(input.cursor, "dropbox list_folder cursor"),
    },
  });

  return normalizeListFolderResult(payload);
}

function normalizeListFolderResult(payload: Record<string, unknown>) {
  return {
    entries: readObjectArray(payload.entries).map(mapDropboxMetadata),
    cursor: requireString(payload.cursor, "dropbox cursor"),
    hasMore: readBoolean(payload.has_more) ?? false,
  };
}

async function getMetadata(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dropboxRpcRequest("files/get_metadata", {
    accessToken,
    fetcher,
    body: compactObject({
      path: requireString(input.path, "dropbox metadata path"),
      include_deleted: readBoolean(input.includeDeleted),
      include_has_explicit_shared_members: readBoolean(input.includeHasExplicitSharedMembers),
    }),
  });

  return {
    metadata: mapDropboxMetadata(payload),
  };
}

async function downloadFile(input: Record<string, unknown>, context: ActionContext) {
  const { accessToken, fetcher } = context;
  const response = await fetcher(`${dropboxContentBaseUrl}/files/download`, {
    method: "POST",
    headers: {
      ...dropboxAuthHeaders(accessToken),
      "Dropbox-API-Arg": JSON.stringify({
        path: requireString(input.path, "dropbox download path"),
      }),
    },
  });

  if (!response.ok) {
    throw await normalizeDropboxHttpError(response, "dropbox download failed");
  }

  const metadata = parseDropboxApiResultHeader(response);
  const normalizedMetadata = mapDropboxMetadata(metadata);
  if (normalizedMetadata.tag !== "file") {
    throw new ProviderRequestError(400, "dropbox download_file requires a file path");
  }

  const name = optionalString(input.fileName) ?? normalizedMetadata.name;
  const mimeType = optionalString(response.headers.get("content-type")) ?? "application/octet-stream";
  const fileId = normalizedMetadata.id;
  if (!fileId) {
    throw new ProviderRequestError(502, "dropbox download metadata is missing file id");
  }
  const bytes = Buffer.from(await response.arrayBuffer());

  return {
    fileId,
    name,
    mimeType,
    sizeBytes: normalizedMetadata.sizeBytes,
    contentBase64: bytes.toString("base64"),
  };
}

async function uploadFile(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const source = resolveUploadContent(input);
  if (source.bytes.byteLength > dropboxMaxSimpleUploadBytes) {
    throw new ProviderRequestError(400, "dropbox upload_file only supports files up to 150 MiB in this first pass");
  }

  const path = requireString(input.path, "dropbox upload path");
  const mode = optionalString(input.mode) ?? "add";
  const updateRev = optionalString(input.updateRev);
  const arg = compactObject({
    path,
    mode: normalizeWriteMode(mode, updateRev),
    autorename: readBoolean(input.autorename),
    client_modified: optionalString(input.clientModified),
    mute: readBoolean(input.mute),
    strict_conflict: readBoolean(input.strictConflict),
    content_hash: optionalString(input.contentHash),
  });

  const response = await fetcher(`${dropboxContentBaseUrl}/files/upload`, {
    method: "POST",
    headers: {
      ...dropboxAuthHeaders(accessToken),
      "Content-Type": source.mimeType || "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify(arg),
    },
    body: Buffer.from(source.bytes),
  });

  if (!response.ok) {
    throw await normalizeDropboxHttpError(response, "dropbox upload failed");
  }

  const payload = await readJsonRecord(response);
  return {
    metadata: mapDropboxMetadata(payload),
  };
}

async function createFolder(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dropboxRpcRequest("files/create_folder_v2", {
    accessToken,
    fetcher,
    body: compactObject({
      path: requireString(input.path, "dropbox folder path"),
      autorename: readBoolean(input.autorename),
    }),
  });

  return {
    metadata: mapDropboxMetadata(asObject(payload.metadata)),
  };
}

async function relocate(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
  route: "move_v2" | "copy_v2",
) {
  const payload = await dropboxRpcRequest(`files/${route}`, {
    accessToken,
    fetcher,
    body: compactObject({
      from_path: requireString(input.fromPath, "dropbox fromPath"),
      to_path: requireString(input.toPath, "dropbox toPath"),
      autorename: readBoolean(input.autorename),
      allow_ownership_transfer: readBoolean(input.allowOwnershipTransfer),
    }),
  });

  return {
    metadata: mapDropboxMetadata(asObject(payload.metadata)),
  };
}

async function deletePath(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dropboxRpcRequest("files/delete_v2", {
    accessToken,
    fetcher,
    body: compactObject({
      path: requireString(input.path, "dropbox delete path"),
      parent_rev: optionalString(input.parentRev),
    }),
  });

  return {
    metadata: mapDropboxMetadata(asObject(payload.metadata)),
  };
}

async function createSharedLink(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const settings = compactObject({
    requested_visibility: optionalString(input.requestedVisibility),
    audience: optionalString(input.audience),
    access: optionalString(input.access),
    allow_download: readBoolean(input.allowDownload),
    password: optionalString(input.password),
    expires: optionalString(input.expiresAt),
  });

  const payload = await dropboxRpcRequest("sharing/create_shared_link_with_settings", {
    accessToken,
    fetcher,
    body: compactObject({
      path: requireString(input.path, "dropbox shared link path"),
      settings: Object.keys(settings).length > 0 ? settings : undefined,
    }),
  });

  return {
    link: mapDropboxMetadata(payload),
  };
}

async function listSharedLinks(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dropboxRpcRequest("sharing/list_shared_links", {
    accessToken,
    fetcher,
    body: compactObject({
      path: optionalString(input.path),
      cursor: optionalString(input.cursor),
      direct_only: readBoolean(input.directOnly),
    }),
  });

  return {
    links: readObjectArray(payload.links).map(mapDropboxMetadata),
    cursor: optionalString(payload.cursor) ?? null,
    hasMore: readBoolean(payload.has_more) ?? false,
  };
}

async function searchFiles(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const options = compactObject({
    path: optionalString(input.path),
    max_results: readNumber(input.maxResults),
    file_status: optionalString(input.fileStatus),
    filename_only: readBoolean(input.filenameOnly),
    file_categories: readStringArray(input.fileCategories),
    file_extensions: readStringArray(input.fileExtensions),
    order_by: optionalString(input.orderBy),
  });

  const payload = await dropboxRpcRequest("files/search_v2", {
    accessToken,
    fetcher,
    body: compactObject({
      query: requireString(input.query, "dropbox search query"),
      options: Object.keys(options).length > 0 ? options : undefined,
      match_field_options:
        readBoolean(input.includeHighlights) === true
          ? {
              include_highlights: true,
            }
          : undefined,
    }),
  });

  return normalizeSearchResult(payload);
}

async function searchFilesContinue(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dropboxRpcRequest("files/search/continue_v2", {
    accessToken,
    fetcher,
    body: {
      cursor: requireString(input.cursor, "dropbox search cursor"),
    },
  });

  return normalizeSearchResult(payload);
}

function normalizeSearchResult(payload: Record<string, unknown>) {
  return {
    matches: readObjectArray(payload.matches).map((match) => {
      const metadata = asOptionalObject(match.metadata) ?? {};
      return {
        matchType: optionalString(asOptionalObject(match.match_type)?.[".tag"]) ?? "unknown",
        metadata: mapDropboxMetadata(asOptionalObject(metadata.metadata) ?? metadata),
        highlightSpans: readObjectArray(match.highlight_spans),
      };
    }),
    cursor: optionalString(payload.cursor) ?? null,
    hasMore: readBoolean(payload.has_more) ?? false,
  };
}

async function getTemporaryLink(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dropboxRpcRequest("files/get_temporary_link", {
    accessToken,
    fetcher,
    body: {
      path: requireString(input.path, "dropbox temporary link path"),
    },
  });

  return {
    metadata: mapDropboxMetadata(asObject(payload.metadata)),
    link: requireString(payload.link, "dropbox temporary link"),
  };
}

async function saveUrl(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dropboxRpcRequest("files/save_url", {
    accessToken,
    fetcher,
    body: {
      path: requireString(input.path, "dropbox save_url path"),
      url: requireString(input.url, "dropbox save_url url"),
    },
  });

  return normalizeSaveUrlResult(payload);
}

async function saveUrlCheckJobStatus(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dropboxRpcRequest("files/save_url/check_job_status", {
    accessToken,
    fetcher,
    body: {
      async_job_id: requireString(input.asyncJobId, "dropbox save_url asyncJobId"),
    },
  });

  return normalizeSaveUrlResult(payload);
}

function normalizeSaveUrlResult(payload: Record<string, unknown>) {
  const tag = optionalString(payload[".tag"]) ?? "unknown";
  const metadata =
    asOptionalObject(payload.complete) ?? asOptionalObject(payload.metadata) ?? (tag === "complete" ? payload : null);
  return {
    tag,
    asyncJobId: optionalString(payload.async_job_id) ?? null,
    metadata: metadata ? mapDropboxMetadata(metadata) : null,
    failure: asOptionalObject(payload.failed) ?? asOptionalObject(payload.failure) ?? null,
  };
}

async function listRevisions(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dropboxRpcRequest("files/list_revisions", {
    accessToken,
    fetcher,
    body: compactObject({
      path: requireString(input.path, "dropbox list_revisions path"),
      mode: optionalString(input.mode),
      before_rev: optionalString(input.beforeRev),
      limit: readNumber(input.limit),
    }),
  });

  return {
    entries: readObjectArray(payload.entries).map(mapDropboxMetadata),
    isDeleted: readBoolean(payload.is_deleted) ?? false,
    serverDeleted: optionalString(payload.server_deleted) ?? null,
    hasMore: readBoolean(payload.has_more) ?? false,
  };
}

async function restoreRevision(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dropboxRpcRequest("files/restore", {
    accessToken,
    fetcher,
    body: {
      path: requireString(input.path, "dropbox restore path"),
      rev: requireString(input.rev, "dropbox restore rev"),
    },
  });

  return {
    metadata: mapDropboxMetadata(payload),
  };
}

async function getSharedLinkMetadata(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dropboxRpcRequest("sharing/get_shared_link_metadata", {
    accessToken,
    fetcher,
    body: compactObject({
      url: requireString(input.url, "dropbox shared link url"),
      path: optionalString(input.path),
    }),
  });

  return {
    link: mapDropboxMetadata(payload),
  };
}

async function getSharedLinkFile(input: Record<string, unknown>, context: ActionContext) {
  const { accessToken, fetcher } = context;

  const arg = compactObject({
    url: requireString(input.url, "dropbox shared link url"),
    path: optionalString(input.path),
  }) as SharedLinkFileArg;
  const response = await fetcher(`${dropboxContentBaseUrl}/sharing/get_shared_link_file`, {
    method: "POST",
    headers: {
      ...dropboxAuthHeaders(accessToken),
      "Dropbox-API-Arg": JSON.stringify(arg),
    },
  });

  if (!response.ok) {
    throw await normalizeDropboxHttpError(response, "dropbox shared link file download failed");
  }

  const metadata = parseDropboxApiResultHeader(response);
  const normalizedMetadata = mapDropboxMetadata(metadata);
  if (normalizedMetadata.tag !== "file") {
    throw new ProviderRequestError(400, "dropbox get_shared_link_file requires a file");
  }

  const name = optionalString(input.fileName) ?? normalizedMetadata.name;
  const mimeType = optionalString(response.headers.get("content-type")) ?? "application/octet-stream";
  const fileId = normalizedMetadata.id;
  if (!fileId) {
    throw new ProviderRequestError(502, "dropbox shared-link metadata is missing file id");
  }
  const bytes = Buffer.from(await response.arrayBuffer());

  return {
    fileId,
    name,
    mimeType,
    sizeBytes: normalizedMetadata.sizeBytes,
    contentBase64: bytes.toString("base64"),
  };
}

async function modifySharedLink(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const settings = compactObject({
    requested_visibility: optionalString(input.requestedVisibility),
    audience: optionalString(input.audience),
    access: optionalString(input.access),
    allow_download: readBoolean(input.allowDownload),
    link_password: optionalString(input.password),
    expires: optionalString(input.expiresAt),
  });

  const payload = await dropboxRpcRequest("sharing/modify_shared_link_settings", {
    accessToken,
    fetcher,
    body: compactObject({
      url: requireString(input.url, "dropbox shared link url"),
      settings,
      remove_expiration: readBoolean(input.removeExpiration),
    }),
  });

  return {
    link: mapDropboxMetadata(payload),
  };
}

async function revokeSharedLink(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  await dropboxRpcRequest("sharing/revoke_shared_link", {
    accessToken,
    fetcher,
    body: {
      url: requireString(input.url, "dropbox shared link url"),
    },
    allowEmptyResponse: true,
  });

  return {
    revoked: true,
  };
}

async function getTags(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const paths = readStringArray(input.paths);
  if (!paths) {
    throw new ProviderRequestError(400, "dropbox get_tags requires at least one path");
  }

  const payload = await dropboxRpcRequest("files/tags/get", {
    accessToken,
    fetcher,
    body: {
      paths,
    },
  });

  return {
    pathsToTags: readObjectArray(payload.paths_to_tags).map((entry) => ({
      path: requireString(entry.path, "dropbox tag path"),
      tags: readObjectArray(entry.tags).map((tag) => ({
        tag: optionalString(tag[".tag"]) ?? "unknown",
        tagText: optionalString(tag.tag_text) ?? null,
      })),
    })),
  };
}

async function dropboxRpcRequest(
  path: string,
  input: {
    accessToken: string;
    fetcher: typeof fetch;
    body?: Record<string, unknown>;
    allowEmptyResponse?: boolean;
  },
) {
  const response = await input.fetcher(`${dropboxApiBaseUrl}/${path}`, {
    method: "POST",
    headers: {
      ...dropboxAuthHeaders(input.accessToken),
      ...(input.body ? { "content-type": "application/json" } : {}),
    },
    ...(input.body ? { body: JSON.stringify(input.body) } : {}),
  });

  if (!response.ok) {
    throw await normalizeDropboxHttpError(response, `dropbox ${path} failed`);
  }

  if (input.allowEmptyResponse) {
    return await readJsonRecordOrEmpty(response);
  }
  return await readJsonRecord(response);
}

function dropboxAuthHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

async function normalizeDropboxHttpError(response: Response, fallbackMessage: string) {
  const contentType = response.headers.get("content-type") ?? "";
  let payload: Record<string, unknown> | null = null;
  let message = "";

  if (contentType.includes("application/json")) {
    payload = await readJsonRecord(response);
    message = resolveDropboxErrorMessage(payload) ?? fallbackMessage;
  } else {
    const text = (await response.text()).trim();
    message = text || fallbackMessage;
  }

  if (response.status === 401) {
    return new ProviderRequestError(401, message);
  }
  if (response.status === 403) {
    return new ProviderRequestError(403, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
}

function resolveDropboxErrorMessage(payload: Record<string, unknown>) {
  const errorSummary = optionalString(payload.error_summary);
  if (errorSummary) {
    return trimDropboxErrorSummary(errorSummary);
  }

  const error = asOptionalObject(payload.error);
  const errorTag = optionalString(error?.[".tag"]);
  if (errorTag) {
    return errorTag;
  }

  return undefined;
}

function trimDropboxErrorSummary(value: string) {
  return value.endsWith("/...") ? value.slice(0, -4) : value;
}

function parseDropboxApiResultHeader(response: Response) {
  const raw = response.headers.get("dropbox-api-result");
  if (!raw) {
    throw new ProviderRequestError(502, "dropbox download response is missing dropbox-api-result");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ProviderRequestError(502, "dropbox download metadata is not valid JSON");
  }

  return asObject(parsed);
}

function mapDropboxMetadata(value: unknown) {
  const record = asObject(value);
  return {
    tag: resolveDropboxMetadataTag(record),
    name: optionalString(record.name) ?? "",
    id: optionalString(record.id) ?? null,
    pathDisplay: optionalString(record.path_display) ?? null,
    pathLower: optionalString(record.path_lower) ?? null,
    clientModified: optionalString(record.client_modified) ?? null,
    serverModified: optionalString(record.server_modified) ?? null,
    rev: optionalString(record.rev) ?? null,
    sizeBytes: readNumber(record.size) ?? null,
    isDownloadable: readBoolean(record.is_downloadable) ?? null,
    contentHash: optionalString(record.content_hash) ?? null,
    url: optionalString(record.url) ?? null,
    expiresAt: optionalString(record.expires) ?? null,
    sharingInfo: asOptionalObject(record.sharing_info) ?? null,
    linkPermissions: asOptionalObject(record.link_permissions) ?? null,
  };
}

function resolveDropboxMetadataTag(record: Record<string, unknown>) {
  const explicitTag = optionalString(record[".tag"]);
  if (explicitTag) {
    return explicitTag;
  }
  if (
    readBoolean(record.is_downloadable) !== undefined ||
    optionalString(record.rev) ||
    optionalString(record.content_hash) ||
    readNumber(record.size) !== undefined
  ) {
    return "file";
  }
  return "unknown";
}

async function readJsonRecord(response: Response) {
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new ProviderRequestError(502, "dropbox returned invalid JSON");
  }

  return asObject(parsed);
}

async function readJsonRecordOrEmpty(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ProviderRequestError(502, "dropbox returned invalid JSON");
  }

  if (parsed == null) {
    return {};
  }
  return asObject(parsed);
}

function requireString(value: unknown, fieldName: string) {
  const resolved = optionalString(value);
  if (!resolved) {
    throw new ProviderRequestError(502, `${fieldName} is missing`);
  }
  return resolved;
}

function asObject(value: unknown): Record<string, unknown> {
  return requiredRecord(value, "object input", (message) => new ProviderRequestError(502, message));
}

function optionalString(value: unknown) {
  return asOptionalString(value);
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readObjectArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) as Array<
    Record<string, unknown>
  >;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const strings = value.filter((item): item is string => typeof item === "string" && item !== "");
  return strings.length > 0 ? strings : undefined;
}

function normalizeWriteMode(mode: string, updateRev: string | undefined) {
  if (mode === "overwrite") {
    return "overwrite";
  }
  if (mode === "update") {
    return {
      ".tag": "update",
      update: updateRev,
    };
  }
  return "add";
}

function resolveUploadContent(input: Record<string, unknown>) {
  const inlineText = input.text != null ? String(input.text) : undefined;
  const contentBase64 = optionalString(input.contentBase64);
  const sourceCount = Number(inlineText !== undefined) + Number(contentBase64 != null);

  if (sourceCount !== 1) {
    throw new ProviderRequestError(400, "exactly one of text or contentBase64 is required");
  }

  if (inlineText !== undefined) {
    return {
      bytes: Uint8Array.from(Buffer.from(inlineText)),
      mimeType: optionalString(input.mimeType) ?? "application/octet-stream",
    } satisfies DropboxUploadSource;
  }

  return {
    bytes: decodeBase64Content(contentBase64 ?? ""),
    mimeType: optionalString(input.mimeType) ?? "application/octet-stream",
  } satisfies DropboxUploadSource;
}

function decodeBase64Content(value: string) {
  try {
    return Uint8Array.from(Buffer.from(value, "base64"));
  } catch {
    throw new ProviderRequestError(400, "contentBase64 must be valid base64");
  }
}
