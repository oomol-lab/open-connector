import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { compactObject, requiredRecord } from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import { defineOAuthProviderExecutors, ProviderRequestError, readTransitFileInput } from "../provider-runtime.ts";

const graphBaseUrl = "https://graph.microsoft.com/v1.0";
const graphOrigin = new URL(graphBaseUrl).origin;
const oneDriveUploadChunkSizeBytes = 10 * 1024 * 1024;
const oneDriveDownloadSelectFields = ["id", "name", "size", "file", "folder"] as const;
const oneDriveDownloadFormatMimeTypes = {
  pdf: "application/pdf",
  html: "text/html",
} as const;
const oneDriveDownloadFormatExtensions = {
  pdf: "pdf",
  html: "html",
} as const;

type OneDriveRuntimeDeps = OAuthProviderContext;

type OneDriveActionHandler = (input: Record<string, unknown>, deps: OneDriveRuntimeDeps) => Promise<unknown>;

type OneDriveRequestInput = {
  accessToken: string;
  fetcher: typeof fetch;
  method?: string;
  query?: Record<string, string | undefined>;
  headers?: Record<string, string>;
  body?: unknown;
  rawBody?: BodyInit;
  absoluteUrlPolicy?: "children" | "search";
  allowStatuses?: number[];
  signal?: AbortSignal;
};

type OneDriveGraphCollection<T> = {
  value?: T;
  "@odata.nextLink"?: unknown;
} & Record<string, unknown>;

type OneDriveErrorPayload = {
  error?: {
    code?: unknown;
    message?: unknown;
    innerError?: unknown;
  };
  message?: unknown;
};

type OneDriveDownloadFormat = keyof typeof oneDriveDownloadFormatMimeTypes;

type OneDriveUploadSource = {
  bytes: Uint8Array;
  mimeType: string;
  targetName?: string;
};

type OneDriveUploadSession = {
  uploadUrl: string;
  expirationDateTime: string | null;
  nextExpectedRanges: string[];
};

export const oneDriveActionHandlers: Record<string, OneDriveActionHandler> = {
  get_drive(input, deps) {
    return getDrive(input, deps);
  },
  get_root(input, deps) {
    return getRoot(input, deps);
  },
  get_item(input, deps) {
    return getItem(input, deps);
  },
  list_folder_children(input, deps) {
    return listFolderChildren(input, deps);
  },
  search_items(input, deps) {
    return searchItems(input, deps);
  },
  create_folder(input, deps) {
    return createFolder(input, deps);
  },
  update_item_metadata(input, deps) {
    return updateItemMetadata(input, deps);
  },
  delete_item(input, deps) {
    return deleteItem(input, deps);
  },
  download_file(input, deps) {
    return downloadFile(input, deps);
  },
  download_file_by_path(input, deps) {
    return downloadFileByPath(input, deps);
  },
  download_item_as_format(input, deps) {
    return downloadItemAsFormat(input, deps);
  },
  upload_file(input, deps) {
    return uploadFile(input, deps);
  },
  update_file_content(input, deps) {
    return updateFileContent(input, deps);
  },
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors("one_drive", oneDriveActionHandlers);

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }) {
    const profile = await oneDriveJsonRequest<{
      id?: unknown;
      displayName?: unknown;
      mail?: unknown;
      userPrincipalName?: unknown;
    }>("me", {
      accessToken: input.accessToken,
      fetcher,
      query: {
        $select: ["id", "displayName", "mail", "userPrincipalName"].join(","),
      },
    });
    const accountId = requireString(profile.id, "one_drive current account id");
    const displayName = readOptionalString(profile.displayName);
    const mail = readOptionalString(profile.mail);
    const userPrincipalName = readOptionalString(profile.userPrincipalName);
    return {
      profile: {
        accountId,
        displayName: mail ?? userPrincipalName ?? displayName ?? accountId,
      },
      metadata: {
        currentAccount: profile,
      },
    };
  },
};

export async function oneDriveJsonRequest<T>(pathOrUrl: string, input: OneDriveRequestInput): Promise<T> {
  const response = await oneDriveRequest(pathOrUrl, input);
  return readJsonResponse<T>(response, `one_drive response for ${pathOrUrl}`);
}

async function oneDriveRequest(pathOrUrl: string, input: OneDriveRequestInput) {
  const target = buildOneDriveUrl(pathOrUrl, input.query, input.absoluteUrlPolicy);
  const hasJsonBody = input.body !== undefined;
  const hasRawBody = input.rawBody !== undefined;
  const method = (input.method ?? (hasJsonBody || hasRawBody ? "POST" : "GET")).toUpperCase();
  const headers = {
    authorization: `Bearer ${input.accessToken}`,
    ...(input.headers ?? {}),
  };

  if (hasJsonBody && hasRawBody) {
    throw new ProviderRequestError(400, "one_drive request must not include both body and rawBody");
  }
  if ((method === "GET" || method === "HEAD") && (hasJsonBody || hasRawBody)) {
    throw new ProviderRequestError(400, `one_drive ${method} request must not include a body`);
  }

  const response = await input.fetcher(target.toString(), {
    method,
    headers:
      hasJsonBody && !hasContentTypeHeader(headers)
        ? {
            ...headers,
            "content-type": "application/json",
          }
        : headers,
    ...(hasJsonBody ? { body: JSON.stringify(input.body) } : {}),
    ...(hasRawBody ? { body: input.rawBody } : {}),
    signal: input.signal,
  });

  if (!response.ok && !input.allowStatuses?.includes(response.status)) {
    await assertOneDriveResponse(response);
  }
  return response;
}

function buildOneDriveUrl(
  pathOrUrl: string,
  query?: Record<string, string | undefined>,
  absoluteUrlPolicy?: "children" | "search",
) {
  const isAbsolutePath = isAbsoluteUrl(pathOrUrl);
  const target = isAbsolutePath ? new URL(pathOrUrl) : new URL(pathOrUrl, `${graphBaseUrl}/`);

  if (target.origin !== graphOrigin) {
    throw new ProviderRequestError(
      400,
      isAbsolutePath ? `nextLink must target ${graphOrigin}` : `one_drive request must target ${graphOrigin}`,
    );
  }

  if (isAbsolutePath) {
    assertAllowedOneDriveNextLink(target, absoluteUrlPolicy);
  }

  for (const [key, value] of Object.entries(query ?? {})) {
    if (!value) {
      continue;
    }
    target.searchParams.set(key, value);
  }

  return target;
}

function assertAllowedOneDriveNextLink(target: URL, absoluteUrlPolicy?: "children" | "search") {
  if (absoluteUrlPolicy === "children" && !isAllowedChildrenNextLinkPath(target.pathname)) {
    throw new ProviderRequestError(400, "nextLink must target OneDrive children pagination endpoints");
  }
  if (absoluteUrlPolicy === "search" && !isAllowedSearchNextLinkPath(target.pathname)) {
    throw new ProviderRequestError(400, "nextLink must target OneDrive search pagination endpoints");
  }
}

function isAllowedChildrenNextLinkPath(pathname: string) {
  const suffix = readDrivePathSuffix(pathname);
  if (!suffix) {
    return false;
  }
  if (suffix === "/root/children") {
    return true;
  }
  if (suffix.startsWith("/items/")) {
    const segments = suffix.split("/").filter(Boolean);
    return segments.length === 3 && segments[0] === "items" && segments[2] === "children";
  }
  return suffix.startsWith("/root:/") && suffix.endsWith(":/children");
}

function isAllowedSearchNextLinkPath(pathname: string) {
  const suffix = readDrivePathSuffix(pathname);
  return Boolean(suffix && suffix.startsWith("/root/search("));
}

function readDrivePathSuffix(pathname: string) {
  const normalizedPath = trimTrailingSlash(pathname);
  if (!normalizedPath.startsWith("/v1.0/")) {
    return null;
  }

  const withoutVersion = normalizedPath.slice("/v1.0".length);
  if (withoutVersion.startsWith("/me/drive")) {
    return withoutVersion.slice("/me/drive".length) || "/";
  }
  if (!withoutVersion.startsWith("/drives/")) {
    return null;
  }

  const rest = withoutVersion.slice("/drives/".length);
  const slashIndex = rest.indexOf("/");
  if (slashIndex <= 0) {
    return null;
  }

  return rest.slice(slashIndex) || "/";
}

function isAbsoluteUrl(value: string) {
  return value.startsWith("https://") || value.startsWith("http://");
}

function trimTrailingSlash(value: string) {
  let normalizedValue = value;
  while (normalizedValue.endsWith("/") && normalizedValue.length > 1) {
    normalizedValue = normalizedValue.slice(0, -1);
  }
  return normalizedValue;
}

function hasContentTypeHeader(headers: Record<string, string>) {
  return Object.keys(headers).some((key) => key.toLowerCase() === "content-type");
}

export async function assertOneDriveResponse(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  const { code, message } = await extractOneDriveError(response);

  if (response.status === 400) {
    throw new ProviderRequestError(400, message);
  }
  if (response.status === 401) {
    throw new ProviderRequestError(401, message);
  }
  if (response.status === 403 && isScopeError(code, message)) {
    throw new ProviderRequestError(403, message);
  }
  if (response.status === 403) {
    throw new ProviderRequestError(403, message);
  }
  if (response.status === 404) {
    throw new ProviderRequestError(400, message);
  }
  if (response.status === 409 || response.status === 412) {
    throw new ProviderRequestError(400, message);
  }
  if (response.status === 429) {
    throw new ProviderRequestError(429, message);
  }

  throw new ProviderRequestError(response.status, message);
}

async function extractOneDriveError(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) {
    return {
      code: "",
      message: `one_drive request failed with status ${response.status}`,
    };
  }

  try {
    const payload = JSON.parse(text) as OneDriveErrorPayload;
    const code = readOptionalString(payload.error?.code) ?? "";
    const message =
      readOptionalString(payload.error?.message) ??
      readOptionalString(payload.message) ??
      `one_drive request failed with status ${response.status}`;
    return { code, message };
  } catch {
    return {
      code: "",
      message: text,
    };
  }
}

function isScopeError(code: string, message: string) {
  const normalizedCode = code.toLowerCase();
  const normalizedMessage = message.toLowerCase();
  return (
    normalizedCode.includes("accessdenied") ||
    normalizedCode.includes("forbidden") ||
    normalizedMessage.includes("insufficient privileges") ||
    normalizedMessage.includes("scope")
  );
}

async function getDrive(input: Record<string, unknown>, deps: OneDriveRuntimeDeps) {
  return asObject(
    await oneDriveJsonRequest<Record<string, unknown>>(buildDriveBasePath(readOptionalString(input.driveId)), {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      query: {
        $select: formatOptionalStringArray(input.select),
      },
    }),
  );
}

async function getRoot(input: Record<string, unknown>, deps: OneDriveRuntimeDeps) {
  return asObject(
    await oneDriveJsonRequest<Record<string, unknown>>(buildDriveRootPath(readOptionalString(input.driveId)), {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      query: compactObject({
        $select: formatOptionalStringArray(input.select),
        $expand: formatOptionalStringArray(input.expand),
      }),
    }),
  );
}

async function getItem(input: Record<string, unknown>, deps: OneDriveRuntimeDeps) {
  return asObject(
    await oneDriveJsonRequest<Record<string, unknown>>(buildDriveItemPathFromInput(input), {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      query: compactObject({
        $select: formatOptionalStringArray(input.select),
        $expand: formatOptionalStringArray(input.expand),
      }),
    }),
  );
}

async function listFolderChildren(input: Record<string, unknown>, deps: OneDriveRuntimeDeps) {
  const nextLink = readOptionalString(input.nextLink);
  const path = nextLink ? nextLink : buildListFolderChildrenPath(input);

  const payload = asObject(
    await oneDriveJsonRequest<OneDriveGraphCollection<unknown[]>>(path, {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      absoluteUrlPolicy: nextLink ? "children" : undefined,
      query: nextLink
        ? undefined
        : compactObject({
            $top: formatOptionalNumber(input.top),
            $select: formatOptionalStringArray(input.select),
            $expand: formatOptionalStringArray(input.expand),
            $orderby: readOptionalString(input.orderBy),
          }),
    }),
  );

  return {
    items: readCollectionItems(payload.value),
    nextLink: readNextLink(payload),
  };
}

async function searchItems(input: Record<string, unknown>, deps: OneDriveRuntimeDeps) {
  const nextLink = readOptionalString(input.nextLink);
  const path = nextLink
    ? nextLink
    : `${buildDriveRootPath(readOptionalString(input.driveId))}/search(q='${encodeOdataFunctionStringArgument(resolveSearchQuery(input))}')`;

  const payload = asObject(
    await oneDriveJsonRequest<OneDriveGraphCollection<unknown[]>>(path, {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      absoluteUrlPolicy: nextLink ? "search" : undefined,
      query: nextLink
        ? undefined
        : compactObject({
            $top: formatOptionalNumber(input.top),
            $select: formatOptionalStringArray(input.select),
            $expand: formatOptionalStringArray(input.expand),
            $orderby: readOptionalString(input.orderBy),
          }),
    }),
  );

  return {
    items: readCollectionItems(payload.value),
    nextLink: readNextLink(payload),
  };
}

async function createFolder(input: Record<string, unknown>, deps: OneDriveRuntimeDeps) {
  return asObject(
    await oneDriveJsonRequest<Record<string, unknown>>(buildCreateFolderPath(input), {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      method: "POST",
      body: {
        name: requireString(input.name, "name"),
        folder: {},
        "@microsoft.graph.conflictBehavior": readOptionalString(input.conflictBehavior) ?? "rename",
      },
    }),
  );
}

async function updateItemMetadata(input: Record<string, unknown>, deps: OneDriveRuntimeDeps) {
  return asObject(
    await oneDriveJsonRequest<Record<string, unknown>>(
      buildDriveItemPath(requireString(input.itemId, "itemId"), readOptionalString(input.driveId)),
      {
        accessToken: deps.accessToken,
        fetcher: deps.fetcher,
        method: "PATCH",
        headers: compactStringRecord({
          "if-match": readOptionalString(input.ifMatch),
        }),
        body: compactObject({
          name: readOptionalString(input.name),
          description: readOptionalString(input.description),
          fileSystemInfo: readFileSystemInfoUpdate(input.fileSystemInfo),
          parentReference: readOptionalString(input.parentItemId)
            ? {
                id: readOptionalString(input.parentItemId),
              }
            : undefined,
        }),
      },
    ),
  );
}

async function deleteItem(input: Record<string, unknown>, deps: OneDriveRuntimeDeps) {
  await oneDriveRequest(buildDriveItemPath(requireString(input.itemId, "itemId"), readOptionalString(input.driveId)), {
    accessToken: deps.accessToken,
    fetcher: deps.fetcher,
    method: "DELETE",
    headers: compactStringRecord({
      "if-match": readOptionalString(input.ifMatch),
    }),
  });

  return {
    itemId: requireString(input.itemId, "itemId"),
    deleted: true,
  };
}

async function downloadFile(input: Record<string, unknown>, deps: OneDriveRuntimeDeps) {
  const driveId = readOptionalString(input.driveId);
  const itemId = requireString(input.itemId, "itemId");
  const itemPath = buildDriveItemPath(itemId, driveId);

  return downloadDriveItem({
    metadataPath: itemPath,
    contentPath: `${itemPath}/content`,
    format: readDownloadFormat(input),
    fileName: readOptionalString(input.fileName),
    deps,
  });
}

async function downloadFileByPath(input: Record<string, unknown>, deps: OneDriveRuntimeDeps) {
  const driveId = readOptionalString(input.driveId);
  const itemPath = requireString(input.itemPath, "itemPath");
  const drivePath = buildDrivePathFromFlexiblePath(itemPath, driveId, "itemPath");

  return downloadDriveItem({
    metadataPath: drivePath,
    contentPath: `${drivePath}/content`,
    fileName: readOptionalString(input.fileName),
    deps,
  });
}

async function downloadItemAsFormat(input: Record<string, unknown>, deps: OneDriveRuntimeDeps) {
  const driveId = readOptionalString(input.driveId);
  const itemId = readOptionalString(input.itemId);
  const drivePath = itemId
    ? buildDriveItemPath(itemId, driveId)
    : buildDrivePathFromFlexiblePath(
        requireString(input.pathAndFilename, "pathAndFilename"),
        driveId,
        "pathAndFilename",
      );

  return downloadDriveItem({
    metadataPath: drivePath,
    contentPath: `${drivePath}/content`,
    format: readDownloadFormat(input) ?? requireDownloadFormat(input),
    fileName: readOptionalString(input.fileName),
    deps,
  });
}

async function uploadFile(input: Record<string, unknown>, deps: OneDriveRuntimeDeps) {
  const driveId = readOptionalString(input.driveId);
  const source = await readUploadSource(input, deps, {
    requireTargetName: true,
    fallbackToTransitFileName: true,
  });
  const targetName = requireString(source.targetName, "name");
  const parentItemId = await resolveUploadParentItemId(input, driveId, deps);
  const description = readOptionalString(input.description);
  const ifMatch = readOptionalString(input.ifMatch);
  const fileSystemInfo = readFileSystemInfoUpdate(input.fileSystemInfo);
  const conflictBehavior = readOptionalString(input.conflictBehavior) ?? "rename";

  if (source.bytes.byteLength === 0) {
    return createEmptyFile(
      {
        driveId,
        parentItemId,
        fileName: targetName,
        conflictBehavior,
        description,
        ifMatch,
        fileSystemInfo,
      },
      deps,
    );
  }

  const uploadSession = await createUploadSessionForNewFile(
    {
      driveId,
      parentItemId,
      fileName: targetName,
      conflictBehavior,
      description,
      ifMatch,
      fileSystemInfo,
    },
    deps,
  );

  return uploadSessionBytes(uploadSession.uploadUrl, source.bytes, deps.fetcher);
}

async function updateFileContent(input: Record<string, unknown>, deps: OneDriveRuntimeDeps) {
  const driveId = readOptionalString(input.driveId);
  const source = await readUploadSource(input, deps, {
    requireTargetName: false,
    fallbackToTransitFileName: false,
  });
  const itemId = requireString(input.itemId, "itemId");
  const fileSize = readOptionalNumber(input.fileSize);
  const description = readOptionalString(input.description);
  const ifMatch = readOptionalString(input.ifMatch);
  const ifNoneMatch = readOptionalString(input.ifNoneMatch);
  const fileSystemInfo = readFileSystemInfoUpdate(input.fileSystemInfo);
  const driveItemSource = asObjectSafe(input.driveItemSource);
  const mediaSource = asObjectSafe(input.mediaSource);
  const name = readOptionalString(input.name);
  const conflictBehavior = readOptionalString(input.conflictBehavior) ?? "replace";
  if (fileSize != null && fileSize !== source.bytes.byteLength) {
    throw new ProviderRequestError(400, "fileSize must match the uploaded byte length");
  }

  if (source.bytes.byteLength === 0) {
    return updateFileWithEmptyContent(
      {
        driveId,
        itemId,
        name,
        mimeType: source.mimeType,
        description,
        ifMatch,
        ifNoneMatch,
        fileSystemInfo,
        driveItemSource,
        mediaSource,
      },
      deps,
    );
  }

  const uploadSession = await createUploadSessionForExistingFile(
    {
      driveId,
      itemId,
      conflictBehavior,
      description,
      ifMatch,
      ifNoneMatch,
      fileSize,
      fileSystemInfo,
      driveItemSource,
      mediaSource,
      name,
    },
    deps,
  );

  return uploadSessionBytes(uploadSession.uploadUrl, source.bytes, deps.fetcher);
}

async function downloadDriveItem(input: {
  metadataPath: string;
  contentPath: string;
  fileName?: string;
  format?: OneDriveDownloadFormat;
  deps: OneDriveRuntimeDeps;
}) {
  const transitFiles = input.deps.transitFiles;
  if (!transitFiles) {
    throw new ProviderRequestError(400, "one_drive downloads require local transit file storage");
  }

  const metadata = await fetchDriveItemMetadata(input.metadataPath, input.deps);
  if (!isFileDriveItem(metadata)) {
    throw new ProviderRequestError(400, "drive item must be a file");
  }
  const fileId = requireString(metadata.id, "drive item id");
  const reportedSizeBytes = readOptionalNumber(metadata.size);
  if (!input.format && reportedSizeBytes != null && reportedSizeBytes > transitFiles.maxBytes) {
    throw new ProviderRequestError(413, `OneDrive download exceeds ${transitFiles.maxBytes} bytes`);
  }

  const response = await oneDriveRequest(input.contentPath, {
    accessToken: input.deps.accessToken,
    fetcher: input.deps.fetcher,
    query: compactObject({
      format: input.format,
    }),
    signal: input.deps.signal,
  });

  const name = resolveDownloadFileName(metadata, input.format);
  const transitName = input.fileName ?? name;
  const mimeType = resolveDownloadMimeType(metadata, response, input.format);
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: transitFiles.maxBytes,
    fieldName: "OneDrive download",
    createError: (message) => new ProviderRequestError(413, message),
  });
  const file = await transitFiles.create(new File([toArrayBuffer(bytes)], transitName, { type: mimeType }));

  return {
    fileId,
    name,
    mimeType,
    sizeBytes: file.sizeBytes,
    file,
  };
}

async function fetchDriveItemMetadata(path: string, deps: OneDriveRuntimeDeps) {
  return asObject(
    await oneDriveJsonRequest<Record<string, unknown>>(path, {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      query: {
        $select: oneDriveDownloadSelectFields.join(","),
      },
      signal: deps.signal,
    }),
  );
}

async function resolveUploadParentItemId(
  input: Record<string, unknown>,
  driveId: string | undefined,
  deps: OneDriveRuntimeDeps,
) {
  const folder = readOptionalString(input.folder);
  if (!folder || folder === "/") {
    return getRootItemId(driveId, deps);
  }
  if (isPathLikeFolderReference(folder)) {
    return ensureFolderPathExists(folder, driveId, deps);
  }
  return folder;
}

function isPathLikeFolderReference(value: string) {
  return value === "/" || value.startsWith("/") || value.includes("/");
}

async function getRootItemId(driveId: string | undefined, deps: OneDriveRuntimeDeps) {
  const root = await fetchDriveItemMetadata(buildDriveRootPath(driveId), deps);
  return requireString(root.id, "root.id");
}

async function ensureFolderPathExists(folderPath: string, driveId: string | undefined, deps: OneDriveRuntimeDeps) {
  const segments = normalizeFlexibleDrivePath(folderPath, "folder");
  if (segments.length === 0) {
    return getRootItemId(driveId, deps);
  }

  let currentItem = await fetchDriveItemMetadata(buildDriveRootPath(driveId), deps);
  const currentSegments: string[] = [];

  for (const segment of segments) {
    currentSegments.push(segment);
    const existing = await fetchOptionalDriveItem(buildDrivePathFromSegments(currentSegments, driveId), deps);
    if (existing) {
      if (!isFolderDriveItem(existing)) {
        throw new ProviderRequestError(400, `folder path segment "${segment}" points to a file`);
      }
      currentItem = existing;
      continue;
    }

    currentItem = asObject(
      await oneDriveJsonRequest<Record<string, unknown>>(
        `${buildDriveItemPath(requireString(currentItem.id, "parent.id"), driveId)}/children`,
        {
          accessToken: deps.accessToken,
          fetcher: deps.fetcher,
          method: "POST",
          body: {
            name: segment,
            folder: {},
            "@microsoft.graph.conflictBehavior": "fail",
          },
        },
      ),
    );
  }

  return requireString(currentItem.id, "folder.id");
}

async function fetchOptionalDriveItem(path: string, deps: OneDriveRuntimeDeps) {
  const response = await oneDriveRequest(path, {
    accessToken: deps.accessToken,
    fetcher: deps.fetcher,
    query: {
      $select: oneDriveDownloadSelectFields.join(","),
    },
    allowStatuses: [404],
  });
  if (response.status === 404) {
    return null;
  }
  return asObject(await readJsonResponse<Record<string, unknown>>(response, `one_drive response for ${path}`));
}

async function createEmptyFile(
  input: {
    driveId?: string;
    parentItemId: string;
    fileName: string;
    conflictBehavior: string;
    description?: string;
    ifMatch?: string;
    fileSystemInfo?: Record<string, unknown>;
  },
  deps: OneDriveRuntimeDeps,
) {
  return asObject(
    await oneDriveJsonRequest<Record<string, unknown>>(
      `${buildDriveItemPath(input.parentItemId, input.driveId)}/children`,
      {
        accessToken: deps.accessToken,
        fetcher: deps.fetcher,
        method: "POST",
        headers: compactStringRecord({
          "if-match": input.ifMatch,
        }),
        body: compactObject({
          name: input.fileName,
          file: {},
          description: input.description,
          fileSystemInfo: input.fileSystemInfo,
          "@microsoft.graph.conflictBehavior": input.conflictBehavior,
        }),
      },
    ),
  );
}

async function updateFileWithEmptyContent(
  input: {
    driveId?: string;
    itemId: string;
    mimeType: string;
    name?: string;
    description?: string;
    ifMatch?: string;
    ifNoneMatch?: string;
    fileSystemInfo?: Record<string, unknown>;
    driveItemSource?: Record<string, unknown>;
    mediaSource?: Record<string, unknown>;
  },
  deps: OneDriveRuntimeDeps,
) {
  let item = asObject(
    await oneDriveJsonRequest<Record<string, unknown>>(`${buildDriveItemPath(input.itemId, input.driveId)}/content`, {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      method: "PUT",
      headers: compactStringRecord({
        "if-match": input.ifMatch,
        "if-none-match": input.ifNoneMatch,
        "content-type": input.mimeType,
      }),
      rawBody: new Uint8Array(),
    }),
  );

  const metadataPatch = compactObject({
    name: input.name,
    description: input.description,
    fileSystemInfo: input.fileSystemInfo,
    driveItemSource: input.driveItemSource,
    mediaSource: input.mediaSource,
  });
  if (Object.keys(metadataPatch).length === 0) {
    return item;
  }

  item = asObject(
    await oneDriveJsonRequest<Record<string, unknown>>(buildDriveItemPath(input.itemId, input.driveId), {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      method: "PATCH",
      body: metadataPatch,
    }),
  );
  return item;
}

async function createUploadSessionForNewFile(
  input: {
    driveId?: string;
    parentItemId: string;
    fileName: string;
    conflictBehavior: string;
    description?: string;
    ifMatch?: string;
    fileSystemInfo?: Record<string, unknown>;
  },
  deps: OneDriveRuntimeDeps,
) {
  return asUploadSession(
    await oneDriveJsonRequest<Record<string, unknown>>(
      `${buildDriveItemPath(input.parentItemId, input.driveId)}:/${encodeURIComponent(input.fileName)}:/createUploadSession`,
      {
        accessToken: deps.accessToken,
        fetcher: deps.fetcher,
        method: "POST",
        headers: compactStringRecord({
          "if-match": input.ifMatch,
        }),
        body: buildUploadSessionRequestBody({
          conflictBehavior: input.conflictBehavior,
          description: input.description,
          fileSystemInfo: input.fileSystemInfo,
          name: input.fileName,
        }),
      },
    ),
  );
}

async function createUploadSessionForExistingFile(
  input: {
    driveId?: string;
    itemId: string;
    conflictBehavior: string;
    description?: string;
    ifMatch?: string;
    ifNoneMatch?: string;
    fileSize?: number;
    fileSystemInfo?: Record<string, unknown>;
    driveItemSource?: Record<string, unknown>;
    mediaSource?: Record<string, unknown>;
    name?: string;
  },
  deps: OneDriveRuntimeDeps,
) {
  return asUploadSession(
    await oneDriveJsonRequest<Record<string, unknown>>(
      `${buildDriveItemPath(input.itemId, input.driveId)}/createUploadSession`,
      {
        accessToken: deps.accessToken,
        fetcher: deps.fetcher,
        method: "POST",
        headers: compactStringRecord({
          "if-match": input.ifMatch,
          "if-none-match": input.ifNoneMatch,
        }),
        body: buildUploadSessionRequestBody({
          conflictBehavior: input.conflictBehavior,
          description: input.description,
          driveItemSource: input.driveItemSource,
          fileSize: input.fileSize,
          fileSystemInfo: input.fileSystemInfo,
          mediaSource: input.mediaSource,
          name: input.name,
        }),
      },
    ),
  );
}

function buildUploadSessionRequestBody(input: {
  conflictBehavior: string;
  description?: string;
  driveItemSource?: Record<string, unknown>;
  fileSize?: number;
  fileSystemInfo?: Record<string, unknown>;
  mediaSource?: Record<string, unknown>;
  name?: string;
}) {
  return {
    item: compactObject({
      "@microsoft.graph.conflictBehavior": input.conflictBehavior,
      description: input.description,
      driveItemSource: input.driveItemSource,
      fileSize: input.fileSize,
      fileSystemInfo: input.fileSystemInfo,
      mediaSource: input.mediaSource,
      name: input.name,
    }),
  };
}

async function uploadSessionBytes(uploadUrl: string, bytes: Uint8Array, fetcher: typeof fetch) {
  if (bytes.byteLength <= 0) {
    throw new ProviderRequestError(400, "file content must not be empty");
  }

  let start = 0;
  while (start < bytes.byteLength) {
    const chunkSize = resolveUploadChunkSize(bytes.byteLength - start);
    const endExclusive = Math.min(start + chunkSize, bytes.byteLength);
    const chunk = bytes.subarray(start, endExclusive);
    const response = await fetcher(uploadUrl, {
      method: "PUT",
      headers: {
        "content-length": String(chunk.byteLength),
        "content-range": `bytes ${start}-${endExclusive - 1}/${bytes.byteLength}`,
      },
      body: toArrayBuffer(chunk),
    });

    if (response.status === 200 || response.status === 201) {
      return asObject(
        await readJsonResponse<Record<string, unknown>>(response, "one_drive upload session final response"),
      );
    }

    if (response.status !== 202) {
      throw await buildUploadSessionError(response);
    }

    const progress = asObject(
      await readJsonResponse<Record<string, unknown>>(response, "one_drive upload session progress"),
    );
    const nextStart = readUploadSessionNextStart(progress);
    start = nextStart ?? endExclusive;
  }

  throw new ProviderRequestError(502, "one_drive upload session finished without a final drive item response");
}

function resolveUploadChunkSize(remainingBytes: number) {
  if (remainingBytes <= oneDriveUploadChunkSizeBytes) {
    return remainingBytes;
  }
  return oneDriveUploadChunkSizeBytes;
}

async function buildUploadSessionError(response: Response) {
  const { message } = await extractOneDriveError(response);
  if (response.status === 400 || response.status === 409 || response.status === 412) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 404) {
    return new ProviderRequestError(404, "one_drive upload session expired");
  }
  if (response.status === 416) {
    return new ProviderRequestError(416, message || "invalid upload byte range");
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status === 507) {
    return new ProviderRequestError(507, message);
  }
  return new ProviderRequestError(response.status, message);
}

function asUploadSession(value: Record<string, unknown>) {
  return {
    uploadUrl: requireString(value.uploadUrl, "uploadUrl"),
    expirationDateTime: readOptionalString(value.expirationDateTime) ?? null,
    nextExpectedRanges: readOptionalStringArray(value.nextExpectedRanges) ?? [],
  } satisfies OneDriveUploadSession;
}

function readUploadSessionNextStart(value: Record<string, unknown>) {
  const nextExpectedRanges = readOptionalStringArray(value.nextExpectedRanges);
  const firstRange = nextExpectedRanges?.[0];
  if (!firstRange) {
    return undefined;
  }

  const dashIndex = firstRange.indexOf("-");
  const startText = dashIndex >= 0 ? firstRange.slice(0, dashIndex) : firstRange;
  if (!startText) {
    return undefined;
  }

  const parsed = Number(startText);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

async function readUploadSource(
  input: Record<string, unknown>,
  deps: OneDriveRuntimeDeps,
  options: { requireTargetName: boolean; fallbackToTransitFileName: boolean },
): Promise<OneDriveUploadSource> {
  const targetNameAlias = readOptionalString(input.name);
  const mimeTypeAlias = readOptionalString(input.mimeType);
  const fileInput = asObjectSafe(input.file);
  const inlineText = readOptionalPresentString(input, "text");
  const contentBase64 = readOptionalString(input.contentBase64);
  const uploadSourceCount =
    Number(fileInput != null) + Number(inlineText !== undefined) + Number(contentBase64 != null);

  if (uploadSourceCount > 1) {
    throw new ProviderRequestError(400, "only one of file, text, or contentBase64 may be provided");
  }

  if (fileInput) {
    const transitFile = await readTransitFileInput(fileInput, deps);
    const targetName = targetNameAlias ?? (options.fallbackToTransitFileName ? transitFile.name : undefined);
    return {
      bytes: new Uint8Array(await transitFile.file.arrayBuffer()),
      mimeType: mimeTypeAlias ?? transitFile.mimeType,
      targetName,
    };
  }

  if (inlineText !== undefined) {
    const targetName = options.requireTargetName ? requireString(targetNameAlias, "name") : targetNameAlias;
    return {
      bytes: Uint8Array.from(Buffer.from(inlineText)),
      mimeType: mimeTypeAlias ?? detectMimeType(targetName ?? "file.txt") ?? "text/plain",
      targetName,
    };
  }

  if (contentBase64) {
    const targetName = options.requireTargetName ? requireString(targetNameAlias, "name") : targetNameAlias;
    return {
      bytes: decodeBase64Content(contentBase64),
      mimeType: mimeTypeAlias ?? detectMimeType(targetName ?? "file") ?? "application/octet-stream",
      targetName,
    };
  }

  throw new ProviderRequestError(400, "file, contentBase64, or text is required");
}

function buildListFolderChildrenPath(input: Record<string, unknown>) {
  const driveId = readOptionalString(input.driveId);
  const folderItemId = readOptionalString(input.folderItemId);
  const folderPath = readOptionalString(input.folderPath);

  if (folderItemId) {
    return `${buildDriveItemPath(folderItemId, driveId)}/children`;
  }
  if (folderPath) {
    return `${buildDrivePathFromPath(folderPath, driveId, "folderPath")}/children`;
  }
  return `${buildDriveRootPath(driveId)}/children`;
}

function buildCreateFolderPath(input: Record<string, unknown>) {
  const driveId = readOptionalString(input.driveId);
  const parentItemId = readOptionalString(input.parentItemId);
  const parentPath = readOptionalString(input.parentPath);

  if (parentItemId) {
    return `${buildDriveItemPath(parentItemId, driveId)}/children`;
  }
  if (parentPath) {
    return `${buildDrivePathFromPath(parentPath, driveId, "parentPath")}/children`;
  }
  return `${buildDriveRootPath(driveId)}/children`;
}

function buildDriveItemPathFromInput(input: Record<string, unknown>) {
  const driveId = readOptionalString(input.driveId);
  const itemId = readOptionalString(input.itemId);
  const itemPath = readOptionalString(input.itemPath);

  if (itemId) {
    return buildDriveItemPath(itemId, driveId);
  }
  if (itemPath) {
    return buildDrivePathFromPath(itemPath, driveId, "itemPath");
  }
  throw new ProviderRequestError(400, "itemId or itemPath is required");
}

function buildDriveBasePath(driveId?: string) {
  if (!driveId || driveId === "me") {
    return "me/drive";
  }
  return `drives/${encodeURIComponent(driveId)}`;
}

function buildDriveRootPath(driveId?: string) {
  return `${buildDriveBasePath(driveId)}/root`;
}

function buildDriveItemPath(itemId: string, driveId?: string) {
  return `${buildDriveBasePath(driveId)}/items/${encodeURIComponent(itemId)}`;
}

function buildDrivePathFromPath(path: string, driveId: string | undefined, fieldName: string) {
  const normalizedSegments = normalizeDrivePath(path, fieldName);
  return buildDrivePathFromSegments(normalizedSegments, driveId);
}

function buildDrivePathFromFlexiblePath(path: string, driveId: string | undefined, fieldName: string) {
  const normalizedSegments = normalizeFlexibleDrivePath(path, fieldName);
  return buildDrivePathFromSegments(normalizedSegments, driveId);
}

function buildDrivePathFromSegments(segments: string[], driveId?: string) {
  if (segments.length === 0) {
    return buildDriveRootPath(driveId);
  }

  return `${buildDriveBasePath(driveId)}/root:/${segments.map((segment) => encodeURIComponent(segment)).join("/")}:`;
}

function normalizeDrivePath(path: string, fieldName: string) {
  const trimmed = path.trim();
  if (!trimmed) {
    throw new ProviderRequestError(400, `${fieldName} must not be blank`);
  }
  if (trimmed === "/") {
    return [];
  }
  if (!trimmed.startsWith("/")) {
    throw new ProviderRequestError(400, `${fieldName} must start with /`);
  }
  const segments = trimmed.slice(1).split("/");
  if (segments.some((segment) => segment.length === 0)) {
    throw new ProviderRequestError(400, `${fieldName} must not contain empty path segments`);
  }
  return segments;
}

function normalizeFlexibleDrivePath(path: string, fieldName: string) {
  const trimmed = path.trim();
  if (!trimmed) {
    throw new ProviderRequestError(400, `${fieldName} must not be blank`);
  }
  if (trimmed === "/") {
    return [];
  }

  const rawPath = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  const segments = rawPath.split("/");
  if (segments.some((segment) => segment.length === 0)) {
    throw new ProviderRequestError(400, `${fieldName} must not contain empty path segments`);
  }
  return segments;
}

function resolveSearchQuery(input: Record<string, unknown>) {
  const query = readOptionalString(input.query);
  if (!query) {
    throw new ProviderRequestError(400, "query is required");
  }
  return query;
}

function readCollectionItems(value: unknown) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(
      502,
      `Unexpected collection response: missing "value" array (${describeUnexpectedValue(value)})`,
    );
  }
  return value.map((item) => asObject(item));
}

function readNextLink(payload: Record<string, unknown>) {
  return readOptionalString(payload["@odata.nextLink"]) ?? null;
}

async function readJsonResponse<T>(response: Response, label: string) {
  try {
    return (await response.json()) as T;
  } catch (error) {
    const suffix = error instanceof Error && error.message ? `: ${error.message}` : "";
    throw new ProviderRequestError(502, `${label} returned invalid JSON (status ${response.status})${suffix}`);
  }
}

function escapeOdataString(value: string) {
  return value.replaceAll("'", "''");
}

function encodeOdataFunctionStringArgument(value: string) {
  return encodeURIComponent(escapeOdataString(value));
}

function formatOptionalNumber(value: unknown) {
  const parsed = readOptionalNumber(value);
  return parsed == null ? undefined : String(parsed);
}

function formatOptionalStringArray(value: unknown) {
  const parsed = readOptionalStringArray(value);
  if (!parsed || parsed.length === 0) {
    return undefined;
  }
  return parsed.join(",");
}

function requireString(value: unknown, fieldName: string) {
  const parsed = readOptionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function asObject(value: unknown): Record<string, unknown> {
  return requiredRecord(value, "object input", (message) => new ProviderRequestError(502, message));
}

function readOptionalPresentString(input: Record<string, unknown>, key: string) {
  if (!(key in input)) {
    return undefined;
  }
  const value = input[key];
  if (typeof value !== "string") {
    throw new ProviderRequestError(400, `${key} must be a string`);
  }
  return value;
}

function readOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function readOptionalStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const parsed = value.map((item) => readOptionalString(item)).filter((item): item is string => Boolean(item));

  return parsed.length > 0 ? parsed : undefined;
}

function asObjectSafe(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function readFileSystemInfoUpdate(value: unknown) {
  const payload = asObjectSafe(value);
  if (!payload) {
    return undefined;
  }

  const fileSystemInfo = compactObject({
    createdDateTime: readOptionalString(payload.createdDateTime),
    lastAccessedDateTime: readOptionalString(payload.lastAccessedDateTime),
    lastModifiedDateTime: readOptionalString(payload.lastModifiedDateTime),
  });

  return Object.keys(fileSystemInfo).length > 0 ? fileSystemInfo : undefined;
}

function describeUnexpectedValue(value: unknown) {
  if (value === undefined) {
    return "received undefined";
  }
  if (value === null) {
    return "received null";
  }

  try {
    const serialized = JSON.stringify(value);
    if (serialized) {
      return serialized.length > 160 ? `received ${serialized.slice(0, 157)}...` : `received ${serialized}`;
    }
  } catch {
    return `received ${String(value)}`;
  }

  return `received ${String(value)}`;
}

function compactStringRecord(value: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

function resolveDownloadFileName(metadata: Record<string, unknown>, format: OneDriveDownloadFormat | undefined) {
  const metadataName = readOptionalString(metadata.name) ?? "file";
  if (!format) {
    return metadataName;
  }

  return replaceFileExtension(metadataName, oneDriveDownloadFormatExtensions[format]);
}

function resolveDownloadMimeType(
  metadata: Record<string, unknown>,
  response: Response,
  format: OneDriveDownloadFormat | undefined,
) {
  if (format) {
    return oneDriveDownloadFormatMimeTypes[format];
  }

  const responseMimeType = normalizeMimeType(response.headers.get("content-type"));
  if (responseMimeType) {
    return responseMimeType;
  }

  const fileFacet = asObjectSafe(metadata.file);
  const metadataMimeType = normalizeMimeType(readOptionalString(fileFacet?.mimeType));
  return metadataMimeType ?? "application/octet-stream";
}

function normalizeMimeType(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  const semicolonIndex = value.indexOf(";");
  const rawMimeType = semicolonIndex >= 0 ? value.slice(0, semicolonIndex) : value;
  const trimmed = rawMimeType.trim();
  return trimmed || undefined;
}

function replaceFileExtension(name: string, extension: string) {
  if (name.toLowerCase().endsWith(`.${extension}`)) {
    return name;
  }

  const extensionIndex = name.lastIndexOf(".");
  if (extensionIndex <= 0) {
    return `${name}.${extension}`;
  }

  return `${name.slice(0, extensionIndex)}.${extension}`;
}

function readDownloadFormat(input: Record<string, unknown>) {
  const format = readOptionalString(input.format);
  if (format === "pdf" || format === "html") {
    return format;
  }
  return undefined;
}

function requireDownloadFormat(input: Record<string, unknown>) {
  const format = readDownloadFormat(input);
  if (!format) {
    throw new ProviderRequestError(400, "format is required");
  }
  return format;
}

function isFileDriveItem(value: Record<string, unknown>) {
  return asObjectSafe(value.file) != null;
}

function isFolderDriveItem(value: Record<string, unknown>) {
  return asObjectSafe(value.folder) != null;
}

function detectMimeType(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.endsWith(".csv")) {
    return "text/csv";
  }
  if (normalized.endsWith(".doc")) {
    return "application/msword";
  }
  if (normalized.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (normalized.endsWith(".html") || normalized.endsWith(".htm")) {
    return "text/html";
  }
  if (normalized.endsWith(".json")) {
    return "application/json";
  }
  if (normalized.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (normalized.endsWith(".txt")) {
    return "text/plain";
  }
  if (normalized.endsWith(".xls")) {
    return "application/vnd.ms-excel";
  }
  if (normalized.endsWith(".xlsm")) {
    return "application/vnd.ms-excel.sheet.macroEnabled.12";
  }
  if (normalized.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return undefined;
}

function decodeBase64Content(contentBase64: string) {
  const normalized = contentBase64.trim();
  if (!normalized) {
    throw new ProviderRequestError(400, "contentBase64 must be valid base64");
  }

  const decoded = Buffer.from(normalized, "base64");
  if (decoded.byteLength === 0) {
    throw new ProviderRequestError(400, "contentBase64 must be valid base64");
  }
  if (stripTrailingPadding(decoded.toString("base64")) !== stripTrailingPadding(normalized)) {
    throw new ProviderRequestError(400, "contentBase64 must be valid base64");
  }

  return Uint8Array.from(decoded);
}

function stripTrailingPadding(value: string) {
  let end = value.length;
  while (end > 0 && value[end - 1] === "=") {
    end -= 1;
  }
  return value.slice(0, end);
}

function toArrayBuffer(bytes: Uint8Array) {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer as ArrayBuffer;
  }

  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
