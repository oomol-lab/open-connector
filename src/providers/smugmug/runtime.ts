import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const smugmugApiOrigin = "https://api.smugmug.com";
const smugmugApiBasePath = "/api/v2";
export const smugmugApiBaseUrl: string = `${smugmugApiOrigin}${smugmugApiBasePath}`;
const smugmugDemoUserNickname = "apidemo";
const smugmugMetaKeys = new Set([
  "Uri",
  "Locator",
  "LocatorType",
  "UriDescription",
  "EndpointType",
  "DocUri",
  "Pages",
  "Options",
  "Timing",
]);

type QueryValue = string | number | boolean | undefined;
type JsonRecord = Record<string, unknown>;
type SmugmugRequestPhase = "validate" | "execute";
type SmugmugActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface SmugmugEnvelope {
  Response?: JsonRecord;
  Code?: number;
  Message?: string;
}

export const smugmugActionHandlers: ProviderActionHandlers<"smugmug", SmugmugActionHandler> = {
  get_user(input, context) {
    return getUser(input, context);
  },
  get_user_profile(input, context) {
    return getUserProfile(input, context);
  },
  get_user_features(input, context) {
    return getUserFeatures(input, context);
  },
  get_user_root_node(input, context) {
    return getUserRootNode(input, context);
  },
  get_user_bio_image(input, context) {
    return getUserBioImage(input, context);
  },
  get_user_featured_albums(input, context) {
    return getUserFeaturedAlbums(input, context);
  },
  search_user_content(input, context) {
    return searchUserContent(input, context);
  },
  get_folder_by_user_path(input, context) {
    return getFolderByUserPath(input, context);
  },
  get_folder_details(input, context) {
    return getFolderDetails(input, context);
  },
  get_folder_subfolders(input, context) {
    return getFolderSubfolders(input, context);
  },
  get_folder_albums(input, context) {
    return getFolderAlbums(input, context);
  },
  list_child_nodes(input, context) {
    return listChildNodes(input, context);
  },
  get_node_parent(input, context) {
    return getNodeParent(input, context);
  },
  get_node_parents(input, context) {
    return getNodeParents(input, context);
  },
  get_node_highlight_image(input, context) {
    return getNodeHighlightImage(input, context);
  },
  get_album(input, context) {
    return getAlbum(input, context);
  },
  get_album_highlight_image(input, context) {
    return getAlbumHighlightImage(input, context);
  },
  get_album_images(input, context) {
    return getAlbumImages(input, context);
  },
  get_album_image(input, context) {
    return getAlbumImage(input, context);
  },
  get_image(input, context) {
    return getImage(input, context);
  },
  get_image_metadata(input, context) {
    return getImageMetadata(input, context);
  },
  get_image_sizes(input, context) {
    return getImageSizes(input, context);
  },
  get_image_size_details(input, context) {
    return getImageSizeDetails(input, context);
  },
};

export async function validateSmugmugCredential(context: ApiKeyProviderContext): Promise<CredentialValidationResult> {
  const user = await readObjectResource(buildUserPath(smugmugDemoUserNickname), context, {}, "validate");
  return {
    profile: {
      accountId: "api_key",
      displayName: "SmugMug API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: smugmugApiBaseUrl,
      validationEndpoint: `${smugmugApiBasePath}/user/${smugmugDemoUserNickname}`,
      demoUserNickname: optionalString(user.NickName),
      demoUserName: optionalString(user.Name),
      publicDataOnly: true,
    }),
  };
}

async function getUser(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const user = await readObjectResource(buildUserPath(requireNickname(input)), context);
  return { user };
}

async function getUserProfile(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const userProfile = await readRelatedObject(buildUserPath(requireNickname(input)), "UserProfile", context);
  return { userProfile };
}

async function getUserFeatures(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const features = await readRelatedObject(buildUserPath(requireNickname(input)), "Features", context);
  return { features };
}

async function getUserRootNode(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const rootNode = await readRelatedObject(buildUserPath(requireNickname(input)), "Node", context);
  return { rootNode };
}

async function getUserBioImage(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const bioImage = await readRelatedObject(buildUserPath(requireNickname(input)), "BioImage", context);
  return { bioImage };
}

async function getUserFeaturedAlbums(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { items, pages } = await readRelatedList(buildUserPath(requireNickname(input)), "UserFeaturedAlbums", context);
  return { featuredAlbums: items, pages };
}

async function searchUserContent(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { items, pages } = await readListResource(
    `${buildUserPath(requireNickname(input))}!imagesearch`,
    context,
    compactObject({
      q: readInputString(input.query, "query"),
      Order: optionalString(input.order),
      count: optionalInteger(input.count),
      start: optionalInteger(input.start),
    }),
  );
  return { images: items, pages };
}

async function getFolderByUserPath(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const folder = await readObjectResource(
    buildFolderPath(requireNickname(input), readOptionalFolderPath(input)),
    context,
  );
  assertFolderIdMatches(folder, optionalString(input.folderId));
  return { folder };
}

async function getFolderDetails(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const folder = await readObjectResource(buildNodePath(readInputString(input.nodeId, "nodeId")), context);
  const type = optionalString(folder.Type);
  if (type && type !== "Folder") {
    throw new ProviderRequestError(400, "the requested node is not a folder");
  }
  return { folder };
}

async function getFolderSubfolders(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const rootFolder = await readObjectResource(
    buildFolderPath(requireNickname(input), readOptionalFolderPath(input)),
    context,
  );
  assertFolderIdMatches(rootFolder, optionalString(input.folderId));
  const relationUri = readRelationUri(rootFolder, "Folders", false);
  if (!relationUri) {
    return { folders: [], pages: normalizePages(undefined, 0) };
  }
  const { items, pages } = await readListResource(relationUri, context);
  return { folders: items, pages };
}

async function getFolderAlbums(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const rootFolder = await readObjectResource(
    buildFolderPath(requireNickname(input), readOptionalFolderPath(input)),
    context,
  );
  assertFolderIdMatches(rootFolder, optionalString(input.folderId));
  const relationUri = readRelationUri(rootFolder, "FolderAlbums", false);
  if (!relationUri) {
    return { albums: [], pages: normalizePages(undefined, 0) };
  }
  const { items, pages } = await readListResource(relationUri, context);
  return { albums: items, pages };
}

async function listChildNodes(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { items, pages } = await readListResource(
    `${buildNodePath(readInputString(input.nodeId, "nodeId"))}!children`,
    context,
    compactObject({
      count: optionalInteger(input.count),
      start: optionalInteger(input.start),
    }),
  );
  return { nodes: items, pages };
}

async function getNodeParent(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const parentNode = await readRelatedObject(
    buildNodePath(readInputString(input.nodeId, "nodeId")),
    "ParentNode",
    context,
  );
  return { parentNode };
}

async function getNodeParents(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { items, pages } = await readRelatedList(
    buildNodePath(readInputString(input.nodeId, "nodeId")),
    "ParentNodes",
    context,
  );
  return { parentNodes: items, pages };
}

async function getNodeHighlightImage(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const highlightImage = await readRelatedObject(
    buildNodePath(readInputString(input.nodeId, "nodeId")),
    "HighlightImage",
    context,
  );
  return { highlightImage };
}

async function getAlbum(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const album = await readObjectResource(buildAlbumPath(readInputString(input.albumKey, "albumKey")), context);
  return { album };
}

async function getAlbumHighlightImage(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const highlightImage = await readRelatedObject(
    buildAlbumPath(readInputString(input.albumKey, "albumKey")),
    "HighlightImage",
    context,
  );
  return { highlightImage };
}

async function getAlbumImages(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { items, pages } = await readRelatedList(
    buildAlbumPath(readInputString(input.albumKey, "albumKey")),
    "AlbumImages",
    context,
    compactObject({
      count: optionalInteger(input.count),
      start: optionalInteger(input.start),
    }),
  );
  return { albumImages: items, pages };
}

async function getAlbumImage(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const albumImage = await readObjectResource(
    buildAlbumImagePath(readInputString(input.albumKey, "albumKey"), readInputString(input.imageKey, "imageKey")),
    context,
  );
  return { albumImage };
}

async function getImage(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const image = await readObjectResource(buildImagePath(readInputString(input.imageKey, "imageKey")), context);
  return { image };
}

async function getImageMetadata(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const imageMetadata = await readRelatedObject(
    buildImagePath(readInputString(input.imageKey, "imageKey")),
    "ImageMetadata",
    context,
  );
  return { imageMetadata };
}

async function getImageSizes(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const imageSizeDetails = await readRelatedObject(
    buildImagePath(readInputString(input.imageKey, "imageKey")),
    "ImageSizeDetails",
    context,
  );
  return extractImageSizes(imageSizeDetails);
}

async function getImageSizeDetails(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const imageSizeDetails = await readRelatedObject(
    buildImagePath(readInputString(input.imageKey, "imageKey")),
    "ImageSizeDetails",
    context,
  );
  return { imageSizeDetails };
}

async function readRelatedObject(
  rootPath: string,
  relationName: string,
  context: ApiKeyProviderContext,
  query: Record<string, QueryValue> = {},
): Promise<JsonRecord> {
  const rootObject = await readObjectResource(rootPath, context);
  const relationUri = readRelationUri(rootObject, relationName, true);
  if (!relationUri) {
    throw new ProviderRequestError(502, `smugmug response is missing the ${relationName} relation`);
  }
  return readObjectResource(relationUri, context, query);
}

async function readRelatedList(
  rootPath: string,
  relationName: string,
  context: ApiKeyProviderContext,
  query: Record<string, QueryValue> = {},
): Promise<{ items: JsonRecord[]; pages: Partial<Record<string, unknown>> }> {
  const rootObject = await readObjectResource(rootPath, context);
  const relationUri = readRelationUri(rootObject, relationName, true);
  if (!relationUri) {
    throw new ProviderRequestError(502, `smugmug response is missing the ${relationName} relation`);
  }
  return readListResource(relationUri, context, query);
}

async function readObjectResource(
  path: string,
  context: ApiKeyProviderContext,
  query: Record<string, QueryValue> = {},
  phase: SmugmugRequestPhase = "execute",
): Promise<JsonRecord> {
  const response = await smugmugRequest(path, query, context, phase);
  const primary = extractPrimaryValue(response);
  const value = optionalRecord(primary.value);
  if (!value) {
    throw new ProviderRequestError(502, "smugmug returned an invalid object response");
  }
  return value;
}

async function readListResource(
  path: string,
  context: ApiKeyProviderContext,
  query: Record<string, QueryValue> = {},
  phase: SmugmugRequestPhase = "execute",
): Promise<{ items: JsonRecord[]; pages: Partial<Record<string, unknown>> }> {
  const response = await smugmugRequest(path, query, context, phase);
  const primary = extractPrimaryValue(response);
  const items = Array.isArray(primary.value)
    ? primary.value.filter((item): item is JsonRecord => Boolean(optionalRecord(item)))
    : [];
  return {
    items,
    pages: normalizePages(optionalRecord(response.Pages), items.length),
  };
}

async function smugmugRequest(
  path: string,
  query: Record<string, QueryValue>,
  context: ApiKeyProviderContext,
  phase: SmugmugRequestPhase,
): Promise<JsonRecord> {
  const response = await context.fetcher(buildSmugmugUrl(path, query, context.apiKey), {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": providerUserAgent,
    },
    signal: context.signal,
  });
  const payload = await readSmugmugPayload(response);
  if (!response.ok) {
    throw createSmugmugError(response, payload, phase);
  }
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "smugmug returned an invalid JSON response");
  }
  const envelope = record as SmugmugEnvelope;
  const responseBody = optionalRecord(envelope.Response);
  if (!responseBody) {
    throw new ProviderRequestError(502, "smugmug response is missing Response data");
  }
  return responseBody;
}

async function readSmugmugPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, `smugmug returned invalid JSON with ${response.status}`);
    }
    return text;
  }
}

function createSmugmugError(response: Response, payload: unknown, phase: SmugmugRequestPhase): ProviderRequestError {
  const message =
    extractSmugmugMessage(payload) ?? response.statusText ?? `smugmug request failed with ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 400 || response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 400 || response.status === 404)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (phase === "execute" && response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && response.status === 403) {
    return new ProviderRequestError(403, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractSmugmugMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return (
    optionalString(record.Message) ??
    optionalString(record.message) ??
    optionalString(record.Error) ??
    optionalString(record.error)
  );
}

function buildSmugmugUrl(path: string, query: Record<string, QueryValue>, apiKey: string): string {
  const url = path.startsWith("http")
    ? parseTrustedSmugmugUrl(path)
    : new URL(resolveSmugmugPath(path), smugmugApiOrigin);
  url.searchParams.set("APIKey", apiKey);
  if (!url.searchParams.has("_verbosity")) {
    url.searchParams.set("_verbosity", "1");
  }
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function parseTrustedSmugmugUrl(path: string): URL {
  const url = new URL(path);
  if (url.protocol !== "https:" || url.origin !== smugmugApiOrigin) {
    throw new ProviderRequestError(502, `smugmug relation URL must use ${smugmugApiOrigin}`);
  }
  return url;
}

function resolveSmugmugPath(path: string): string {
  if (path.startsWith(smugmugApiBasePath)) return path;
  if (path.startsWith("/")) return `${smugmugApiBasePath}${path}`;
  return `${smugmugApiBasePath}/${path}`;
}

function extractPrimaryValue(response: JsonRecord): { key: string; value: unknown } {
  for (const [key, value] of Object.entries(response)) {
    if (!smugmugMetaKeys.has(key)) {
      return { key, value };
    }
  }
  throw new ProviderRequestError(502, "smugmug response is missing primary data");
}

function normalizePages(pages: JsonRecord | undefined, itemCount: number): Partial<Record<string, unknown>> {
  return compactObject({
    count: optionalInteger(pages?.Count) ?? itemCount,
    start: optionalInteger(pages?.Start) ?? 1,
    total: optionalInteger(pages?.Total) ?? itemCount,
    firstPage: optionalString(pages?.FirstPage),
    prevPage: optionalString(pages?.PrevPage),
    nextPage: optionalString(pages?.NextPage),
    lastPage: optionalString(pages?.LastPage),
    requestedCount: optionalInteger(pages?.RequestedCount) ?? itemCount,
  });
}

function readRelationUri(record: JsonRecord, relationName: string, required: boolean): string | null {
  const uris = optionalRecord(record.Uris);
  const relation = uris?.[relationName];
  const uri = (typeof relation === "string" ? relation : undefined) ?? optionalString(optionalRecord(relation)?.Uri);
  if (uri) return uri;
  if (required) {
    throw new ProviderRequestError(502, `smugmug response is missing the ${relationName} relation`);
  }
  return null;
}

function extractImageSizes(imageSizeDetails: JsonRecord): unknown {
  const usableSizes = Array.isArray(imageSizeDetails.UsableSizes)
    ? imageSizeDetails.UsableSizes.map((item) => String(item))
    : [];
  const sizes = Object.entries(imageSizeDetails)
    .filter(([key, value]) => key.startsWith("ImageSize") && Boolean(optionalRecord(value)))
    .map(([key, value]) => {
      const size = optionalRecord(value) ?? {};
      return compactObject({
        name: key,
        url: optionalString(size.Url),
        width: optionalInteger(size.Width),
        height: optionalInteger(size.Height),
        size: optionalInteger(size.Size),
        ext: optionalString(size.Ext),
        md5: optionalString(size.Md5),
      });
    })
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
  return { usableSizes, sizes };
}

function buildUserPath(nickname: string): string {
  return `/user/${encodeURIComponent(nickname)}`;
}

function buildFolderPath(nickname: string, folderPath: string): string {
  const pathSegments = splitFolderPath(folderPath).map((segment) => encodeURIComponent(segment));
  return pathSegments.length > 0
    ? `/folder/user/${encodeURIComponent(nickname)}/${pathSegments.join("/")}`
    : `/folder/user/${encodeURIComponent(nickname)}`;
}

function buildNodePath(nodeId: string): string {
  return `/node/${encodeURIComponent(nodeId)}`;
}

function buildAlbumPath(albumKey: string): string {
  return `/album/${encodeURIComponent(albumKey)}`;
}

function buildAlbumImagePath(albumKey: string, imageKey: string): string {
  return `/album/${encodeURIComponent(albumKey)}/image/${encodeURIComponent(imageKey)}`;
}

function buildImagePath(imageKey: string): string {
  return `/image/${encodeURIComponent(imageKey)}`;
}

function splitFolderPath(folderPath: string): string[] {
  const trimmed = trimSlashes(folderPath.trim());
  return trimmed ? trimmed.split("/").filter((segment) => segment.length > 0) : [];
}

function trimSlashes(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === "/") start += 1;
  while (end > start && value[end - 1] === "/") end -= 1;
  return value.slice(start, end);
}

function requireNickname(input: Record<string, unknown>): string {
  return readInputString(input.nickname, "nickname");
}

function readOptionalFolderPath(input: Record<string, unknown>): string {
  return optionalString(input.folderPath) ?? "";
}

function assertFolderIdMatches(folder: JsonRecord, folderId: string | undefined): void {
  if (!folderId) return;
  const actualFolderId = optionalString(folder.FolderID);
  if (actualFolderId && actualFolderId !== folderId) {
    throw new ProviderRequestError(400, "folderId does not match the resolved folder");
  }
}

function readInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}
