import type { CredentialValidationResult, TransitFileWriter } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { createHash, createHmac } from "node:crypto";
import { basename, extname } from "node:path";
import {
  compactObject,
  looseArray,
  optionalBoolean,
  optionalIntegerLike,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, readBoundedResponseBytes } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const imaApiBaseUrl = "https://ima.qq.com";

const defaultListLimit = 20;
const maxImaDownloadBytes = 200 * 1024 * 1024;
const smallFileLimit = 10 * 1024 * 1024;
const imageFileLimit = 30 * 1024 * 1024;
const cosUploadTimeoutMs = 300_000;

const imaUploadableTypesByExtension = {
  pdf: { mediaType: 1, contentType: "application/pdf" },
  doc: { mediaType: 3, contentType: "application/msword" },
  docx: {
    mediaType: 3,
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  ppt: { mediaType: 4, contentType: "application/vnd.ms-powerpoint" },
  pptx: {
    mediaType: 4,
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
  xls: { mediaType: 5, contentType: "application/vnd.ms-excel" },
  xlsx: {
    mediaType: 5,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  csv: { mediaType: 5, contentType: "text/csv" },
  md: { mediaType: 7, contentType: "text/markdown" },
  markdown: { mediaType: 7, contentType: "text/markdown" },
  png: { mediaType: 9, contentType: "image/png" },
  jpg: { mediaType: 9, contentType: "image/jpeg" },
  jpeg: { mediaType: 9, contentType: "image/jpeg" },
  webp: { mediaType: 9, contentType: "image/webp" },
  txt: { mediaType: 13, contentType: "text/plain" },
  xmind: { mediaType: 14, contentType: "application/x-xmind" },
  mp3: { mediaType: 15, contentType: "audio/mpeg" },
  m4a: { mediaType: 15, contentType: "audio/x-m4a" },
  wav: { mediaType: 15, contentType: "audio/wav" },
  aac: { mediaType: 15, contentType: "audio/aac" },
};

const imaUploadableTypesByContentType = new Map<string, number>(
  Object.values(imaUploadableTypesByExtension).map((value) => [value.contentType, value.mediaType]),
);
imaUploadableTypesByContentType.set("text/x-markdown", 7);
imaUploadableTypesByContentType.set("application/md", 7);
imaUploadableTypesByContentType.set("application/markdown", 7);
imaUploadableTypesByContentType.set("application/vnd.xmind.workbook", 14);
imaUploadableTypesByContentType.set("application/zip", 14);

const unsupportedVideoExtensions = new Set([
  "mp4",
  "avi",
  "mov",
  "mkv",
  "wmv",
  "flv",
  "webm",
  "m4v",
  "rmvb",
  "rm",
  "3gp",
]);
const unsupportedVideoContentTypes = new Set([
  "video/mp4",
  "video/x-msvideo",
  "video/quicktime",
  "video/x-matroska",
  "video/x-ms-wmv",
  "video/x-flv",
  "video/webm",
]);

const imaCredentialCodes = new Set([20004]);
const imaInvalidInputCodes = new Set([
  100001, 100002, 100004, 100005, 100006, 100008, 100009, 310001, 110001, 110011, 110012, 110020, 110030, 210001,
  210035,
]);
const imaRateLimitedCodes = new Set([20002, 110021]);

export interface ImaRuntimeContext {
  clientId: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  transitFiles?: TransitFileWriter;
}

interface ImaRequestInput {
  clientId: string;
  apiKey: string;
  path: string;
  body: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: "validate" | "execute";
}

interface ImaEnvelope<T> {
  code?: unknown;
  msg?: unknown;
  data?: T;
}

interface ImaMediaInfo {
  mediaType: number;
  url: string | null;
  headers: Record<string, string> | null;
  notebookId: string | null;
  accessible: boolean;
}

interface ImaUploadFileMetadata {
  fileName: string;
  fileExt: string;
  fileSize: number;
  mediaType: number;
  contentType: string;
}

interface ImaCosCredential {
  token: string;
  secretId: string;
  secretKey: string;
  startTime: number;
  expiredTime: number;
  bucketName: string;
  region: string;
  cosKey: string;
}

interface ImaRepeatedNameResult {
  name: string;
  isRepeated: boolean;
}

type ImaActionHandler = (input: Record<string, unknown>, context: ImaRuntimeContext) => Promise<unknown>;

export const imaActionHandlers: ProviderActionHandlers<"ima", ImaActionHandler> = {
  search_notes(input, context) {
    return searchImaNotes(input, context);
  },
  list_notebooks(input, context) {
    return listImaNotebooks(input, context);
  },
  list_notes(input, context) {
    return listImaNotes(input, context);
  },
  get_note_content(input, context) {
    return getImaNoteContent(input, context);
  },
  create_note(input, context) {
    return createImaNote(input, context);
  },
  append_note(input, context) {
    return appendImaNote(input, context);
  },
  search_knowledge_bases(input, context) {
    return searchImaKnowledgeBases(input, context);
  },
  get_knowledge_bases(input, context) {
    return getImaKnowledgeBases(input, context);
  },
  list_addable_knowledge_bases(input, context) {
    return listAddableImaKnowledgeBases(input, context);
  },
  list_knowledge_items(input, context) {
    return listImaKnowledgeItems(input, context);
  },
  search_knowledge_items(input, context) {
    return searchImaKnowledgeItems(input, context);
  },
  import_urls(input, context) {
    return importImaUrls(input, context);
  },
  add_note_to_knowledge_base(input, context) {
    return addImaNoteToKnowledgeBase(input, context);
  },
  check_repeated_names(input, context) {
    return checkImaRepeatedNames(input, context);
  },
  upload_file_to_knowledge_base(input, context) {
    return uploadImaFileToKnowledgeBase(input, context);
  },
  get_media_info(input, context) {
    return getImaMediaInfo(input, context);
  },
  get_knowledge_item_original(input, context) {
    return getImaKnowledgeItemOriginal(input, context);
  },
};

export async function validateImaCredential(
  input: Record<string, string>,
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const clientId = requireImaField(input.clientId, "clientId");
  const apiKey = requireImaField(input.apiKey, "apiKey");
  const payload = await imaRequest<{ note_folder_infos?: unknown[] }>({
    clientId,
    apiKey,
    path: "openapi/note/v1/list_notebook",
    body: {
      cursor: "0",
      limit: 1,
    },
    fetcher: options.fetcher,
    signal: options.signal,
    phase: "validate",
  });

  const firstNotebook = looseArray(payload.note_folder_infos)
    .map((item) => normalizeNotebook(item))
    .find(isPresent);

  return {
    profile: {
      accountId: clientId,
      displayName: clientId,
    },
    grantedScopes: [],
    metadata: compactObject({
      clientId,
      validationEndpoint: "/openapi/note/v1/list_notebook",
      firstNotebookId: firstNotebook?.folderId,
      firstNotebookName: firstNotebook?.name,
    }),
  };
}

async function searchImaNotes(input: Record<string, unknown>, context: ImaRuntimeContext): Promise<unknown> {
  const query = requireImaField(input.query, "query");
  const searchType = optionalString(input.searchType) === "content" ? "content" : "title";
  const start = readInteger(input.start) ?? 0;
  const limit = readInteger(input.limit) ?? defaultListLimit;
  const isContentSearch = searchType === "content";
  const payload = await imaRequest<{
    search_note_infos?: unknown[];
    is_end?: unknown;
    total_hit_num?: unknown;
  }>({
    ...context,
    path: "openapi/note/v1/search_note",
    body: {
      search_type: isContentSearch ? 1 : 0,
      sort_type: mapNoteSortType(input.sortType),
      query_info: isContentSearch ? { content: query } : { title: query },
      start,
      end: start + limit,
    },
    phase: "execute",
  });

  const notes = looseArray(payload.search_note_infos)
    .map((item) => normalizeSearchNote(item))
    .filter(isPresent);
  const isEnd = optionalBoolean(payload.is_end) ?? true;
  return {
    notes,
    isEnd,
    totalHitCount: readInteger(payload.total_hit_num) ?? 0,
    nextStart: isEnd ? null : start + limit,
  };
}

async function listImaNotebooks(input: Record<string, unknown>, context: ImaRuntimeContext): Promise<unknown> {
  const payload = await imaRequest<{
    note_folder_infos?: unknown[];
    next_cursor?: unknown;
    is_end?: unknown;
  }>({
    ...context,
    path: "openapi/note/v1/list_notebook",
    body: {
      cursor: optionalString(input.cursor) ?? "0",
      limit: readInteger(input.limit) ?? defaultListLimit,
    },
    phase: "execute",
  });

  const isEnd = optionalBoolean(payload.is_end) ?? true;
  return {
    notebooks: looseArray(payload.note_folder_infos)
      .map((item) => normalizeNotebook(item))
      .filter(isPresent),
    nextCursor: isEnd ? null : (optionalString(payload.next_cursor) ?? null),
    isEnd,
  };
}

async function listImaNotes(input: Record<string, unknown>, context: ImaRuntimeContext): Promise<unknown> {
  const payload = await imaRequest<{
    note_book_list?: unknown[];
    next_cursor?: unknown;
    is_end?: unknown;
  }>({
    ...context,
    path: "openapi/note/v1/list_note",
    body: compactObject({
      folder_id: optionalString(input.folderId),
      sort_type: mapNoteSortType(input.sortType),
      cursor: optionalString(input.cursor) ?? "",
      limit: readInteger(input.limit) ?? defaultListLimit,
    }),
    phase: "execute",
  });

  const isEnd = optionalBoolean(payload.is_end) ?? true;
  return {
    notes: looseArray(payload.note_book_list)
      .map((item) => normalizeListedNote(item))
      .filter(isPresent),
    nextCursor: isEnd ? null : (optionalString(payload.next_cursor) ?? null),
    isEnd,
  };
}

async function getImaNoteContent(
  input: Record<string, unknown>,
  context: ImaRuntimeContext,
): Promise<{
  content: string;
  targetContentFormat: "plain_text" | "json";
}> {
  const targetContentFormat = optionalString(input.targetContentFormat) === "json" ? "json" : "plain_text";
  const payload = await imaRequest<{ content?: unknown }>({
    ...context,
    path: "openapi/note/v1/get_doc_content",
    body: {
      note_id: requireImaField(input.noteId, "noteId"),
      target_content_format: targetContentFormat === "json" ? 2 : 0,
    },
    phase: "execute",
  });

  return {
    content: optionalString(payload.content) ?? "",
    targetContentFormat,
  };
}

async function createImaNote(input: Record<string, unknown>, context: ImaRuntimeContext): Promise<unknown> {
  const payload = await imaRequest<{ note_id?: unknown }>({
    ...context,
    path: "openapi/note/v1/import_doc",
    body: compactObject({
      content_format: 1,
      content: requireImaText(input.content, "content"),
      folder_id: optionalString(input.folderId),
      folder_name: optionalString(input.folderName),
    }),
    phase: "execute",
  });

  return {
    noteId: requireImaField(payload.note_id, "noteId"),
  };
}

async function appendImaNote(input: Record<string, unknown>, context: ImaRuntimeContext): Promise<unknown> {
  const payload = await imaRequest<{ note_id?: unknown }>({
    ...context,
    path: "openapi/note/v1/append_doc",
    body: {
      note_id: requireImaField(input.noteId, "noteId"),
      content_format: 1,
      content: requireImaText(input.content, "content"),
    },
    phase: "execute",
  });

  return {
    noteId: requireImaField(payload.note_id, "noteId"),
  };
}

async function searchImaKnowledgeBases(input: Record<string, unknown>, context: ImaRuntimeContext): Promise<unknown> {
  const payload = await imaRequest<{
    info_list?: unknown[];
    next_cursor?: unknown;
    is_end?: unknown;
  }>({
    ...context,
    path: "openapi/wiki/v1/search_knowledge_base",
    body: {
      query: optionalString(input.query) ?? "",
      cursor: optionalString(input.cursor) ?? "",
      limit: readInteger(input.limit) ?? defaultListLimit,
    },
    phase: "execute",
  });

  const isEnd = optionalBoolean(payload.is_end) ?? true;
  return {
    knowledgeBases: looseArray(payload.info_list)
      .map((item) => normalizeKnowledgeBase(item))
      .filter(isPresent),
    nextCursor: isEnd ? null : (optionalString(payload.next_cursor) ?? null),
    isEnd,
  };
}

async function getImaKnowledgeBases(input: Record<string, unknown>, context: ImaRuntimeContext): Promise<unknown> {
  const requestedIds = asStringArray(input.knowledgeBaseIds);
  if (new Set(requestedIds).size !== requestedIds.length) {
    throw new ProviderRequestError(400, "knowledgeBaseIds must not contain duplicate IDs");
  }
  const payload = await imaRequest<{ infos?: unknown }>({
    ...context,
    path: "openapi/wiki/v1/get_knowledge_base",
    body: {
      ids: requestedIds,
    },
    phase: "execute",
  });

  const infoMap = optionalRecord(payload.infos) ?? {};
  return {
    knowledgeBases: requestedIds.map((id) => normalizeKnowledgeBase(infoMap[id], id)).filter(isPresent),
  };
}

async function listAddableImaKnowledgeBases(
  input: Record<string, unknown>,
  context: ImaRuntimeContext,
): Promise<unknown> {
  const payload = await imaRequest<{
    addable_knowledge_base_list?: unknown[];
    next_cursor?: unknown;
    is_end?: unknown;
  }>({
    ...context,
    path: "openapi/wiki/v1/get_addable_knowledge_base_list",
    body: {
      cursor: optionalString(input.cursor) ?? "",
      limit: readInteger(input.limit) ?? defaultListLimit,
    },
    phase: "execute",
  });

  const isEnd = optionalBoolean(payload.is_end) ?? true;
  return {
    knowledgeBases: looseArray(payload.addable_knowledge_base_list)
      .map((item) => normalizeKnowledgeBase(item))
      .filter(isPresent),
    nextCursor: isEnd ? null : (optionalString(payload.next_cursor) ?? null),
    isEnd,
  };
}

async function listImaKnowledgeItems(input: Record<string, unknown>, context: ImaRuntimeContext): Promise<unknown> {
  const payload = await imaRequest<{
    knowledge_list?: unknown[];
    current_path?: unknown[];
    next_cursor?: unknown;
    is_end?: unknown;
  }>({
    ...context,
    path: "openapi/wiki/v1/get_knowledge_list",
    body: compactObject({
      knowledge_base_id: requireImaField(input.knowledgeBaseId, "knowledgeBaseId"),
      folder_id: optionalString(input.folderId),
      cursor: optionalString(input.cursor) ?? "",
      limit: readInteger(input.limit) ?? defaultListLimit,
    }),
    phase: "execute",
  });

  const isEnd = optionalBoolean(payload.is_end) ?? true;
  return {
    items: looseArray(payload.knowledge_list)
      .map((item) => normalizeKnowledgeItem(item))
      .filter(isPresent),
    currentPath: looseArray(payload.current_path)
      .map((item) => normalizeKnowledgeFolder(item))
      .filter(isPresent),
    nextCursor: isEnd ? null : (optionalString(payload.next_cursor) ?? null),
    isEnd,
  };
}

async function searchImaKnowledgeItems(input: Record<string, unknown>, context: ImaRuntimeContext): Promise<unknown> {
  const payload = await imaRequest<{
    info_list?: unknown[];
    next_cursor?: unknown;
    is_end?: unknown;
  }>({
    ...context,
    path: "openapi/wiki/v1/search_knowledge",
    body: {
      query: requireImaField(input.query, "query"),
      cursor: optionalString(input.cursor) ?? "",
      knowledge_base_id: requireImaField(input.knowledgeBaseId, "knowledgeBaseId"),
    },
    phase: "execute",
  });

  const isEnd = optionalBoolean(payload.is_end) ?? true;
  return {
    items: looseArray(payload.info_list)
      .map((item) => normalizeKnowledgeItem(item))
      .filter(isPresent),
    nextCursor: isEnd ? null : (optionalString(payload.next_cursor) ?? null),
    isEnd,
  };
}

async function importImaUrls(input: Record<string, unknown>, context: ImaRuntimeContext): Promise<unknown> {
  const payload = await imaRequest<{ results?: unknown }>({
    ...context,
    path: "openapi/wiki/v1/import_urls",
    body: compactObject({
      knowledge_base_id: requireImaField(input.knowledgeBaseId, "knowledgeBaseId"),
      folder_id: optionalString(input.folderId),
      urls: asStringArray(input.urls),
    }),
    phase: "execute",
  });

  const resultMap = optionalRecord(payload.results) ?? {};
  return {
    results: Object.entries(resultMap).map(([url, value]) => {
      const result = optionalRecord(value) ?? {};
      return {
        url,
        retCode: readInteger(result.ret_code) ?? -1,
        mediaId: optionalString(result.media_id) ?? null,
      };
    }),
  };
}

async function addImaNoteToKnowledgeBase(input: Record<string, unknown>, context: ImaRuntimeContext): Promise<unknown> {
  const payload = await imaRequest<{ media_id?: unknown }>({
    ...context,
    path: "openapi/wiki/v1/add_knowledge",
    body: compactObject({
      media_type: 11,
      title: requireImaField(input.title, "title"),
      knowledge_base_id: requireImaField(input.knowledgeBaseId, "knowledgeBaseId"),
      folder_id: optionalString(input.folderId),
      note_info: {
        content_id: requireImaField(input.noteId, "noteId"),
      },
    }),
    phase: "execute",
  });

  return {
    mediaId: requireImaField(payload.media_id, "mediaId"),
  };
}

async function checkImaRepeatedNames(input: Record<string, unknown>, context: ImaRuntimeContext): Promise<unknown> {
  return {
    results: await requestImaRepeatedNames(
      {
        knowledgeBaseId: requireImaField(input.knowledgeBaseId, "knowledgeBaseId"),
        folderId: optionalString(input.folderId),
        files: looseArray(input.files).map((item) => {
          const raw = optionalRecord(item) ?? {};
          return {
            name: requireImaField(raw.name, "files.name"),
            mediaType: requirePositiveInteger(raw.mediaType, "files.mediaType"),
          };
        }),
      },
      context,
    ),
  };
}

async function uploadImaFileToKnowledgeBase(
  input: Record<string, unknown>,
  context: ImaRuntimeContext,
): Promise<unknown> {
  const knowledgeBaseId = requireImaField(input.knowledgeBaseId, "knowledgeBaseId");
  const fileName = requireImaFileName(input.fileName);
  const contentType = optionalString(input.contentType);
  const sourceUrl = assertPublicHttpUrl(requireImaField(input.fileUrl, "fileUrl"), {
    fieldName: "fileUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
  const duplicatePolicy = optionalString(input.duplicatePolicy) ?? "fail";

  const downloaded = await downloadUrlBytes(sourceUrl, context);
  const metadata = resolveImaUploadFileMetadata(
    fileName,
    contentType ?? downloaded.contentType,
    downloaded.bytes.byteLength,
  );
  const repeated = await requestImaRepeatedNames(
    {
      knowledgeBaseId,
      folderId: optionalString(input.folderId),
      files: [{ name: metadata.fileName, mediaType: metadata.mediaType }],
    },
    context,
  );
  const duplicate = repeated.some((item) => item.name === metadata.fileName && item.isRepeated);
  const finalMetadata = duplicate ? resolveDuplicateUploadMetadata(metadata, duplicatePolicy) : metadata;
  const created = await createImaMedia(knowledgeBaseId, finalMetadata, context);
  await uploadImaFileToCos(downloaded.bytes, finalMetadata, created.cosCredential, context);
  const mediaId = await addImaUploadedFileKnowledge(
    {
      knowledgeBaseId,
      folderId: optionalString(input.folderId),
      metadata: finalMetadata,
      mediaId: created.mediaId,
      cosKey: created.cosCredential.cosKey,
    },
    context,
  );

  return {
    mediaId,
    fileName: finalMetadata.fileName,
    mediaType: finalMetadata.mediaType,
    contentType: finalMetadata.contentType,
    fileSize: finalMetadata.fileSize,
    duplicate,
  };
}

async function requestImaRepeatedNames(
  input: {
    knowledgeBaseId: string;
    folderId?: string;
    files: Array<{ name: string; mediaType: number }>;
  },
  context: ImaRuntimeContext,
): Promise<ImaRepeatedNameResult[]> {
  if (input.files.length === 0) {
    throw new ProviderRequestError(400, "files is required");
  }

  const payload = await imaRequest<{ results?: unknown[] }>({
    ...context,
    path: "openapi/wiki/v1/check_repeated_names",
    body: compactObject({
      knowledge_base_id: input.knowledgeBaseId,
      folder_id: input.folderId,
      params: input.files.map((file) => ({
        name: file.name,
        media_type: file.mediaType,
      })),
    }),
    phase: "execute",
  });

  return looseArray(payload.results).map((item) => {
    const raw = optionalRecord(item) ?? {};
    return {
      name: optionalString(raw.name) ?? "",
      isRepeated: optionalBoolean(raw.is_repeated) ?? false,
    };
  });
}

async function createImaMedia(
  knowledgeBaseId: string,
  metadata: ImaUploadFileMetadata,
  context: ImaRuntimeContext,
): Promise<{ mediaId: string; cosCredential: ImaCosCredential }> {
  const payload = await imaRequest<{
    media_id?: unknown;
    cos_credential?: unknown;
  }>({
    ...context,
    path: "openapi/wiki/v1/create_media",
    body: {
      file_name: metadata.fileName,
      file_size: metadata.fileSize,
      content_type: metadata.contentType,
      knowledge_base_id: knowledgeBaseId,
      file_ext: metadata.fileExt,
    },
    phase: "execute",
  });

  return {
    mediaId: requireImaField(payload.media_id, "mediaId"),
    cosCredential: normalizeImaCosCredential(payload.cos_credential),
  };
}

async function uploadImaFileToCos(
  bytes: Uint8Array,
  metadata: ImaUploadFileMetadata,
  credential: ImaCosCredential,
  context: ImaRuntimeContext,
): Promise<void> {
  const hostname = `${credential.bucketName}.cos.${credential.region}.myqcloud.com`;
  const pathname = `/${credential.cosKey}`;
  const signHeaders = {
    "content-length": String(bytes.byteLength),
    host: hostname,
  };
  const authorization = buildImaCosAuthorization({
    secretId: credential.secretId,
    secretKey: credential.secretKey,
    method: "PUT",
    pathname,
    headers: signHeaders,
    startTime: String(credential.startTime),
    expiredTime: String(credential.expiredTime),
  });
  const timeout = AbortSignal.timeout(cosUploadTimeoutMs);
  const signal = context.signal ? AbortSignal.any([context.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await context.fetcher(`https://${hostname}${pathname}`, {
      method: "PUT",
      headers: {
        "content-type": metadata.contentType,
        "content-length": String(bytes.byteLength),
        authorization,
        "x-cos-security-token": credential.token,
      },
      body: Buffer.from(bytes),
      signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      timeout.aborted ? 504 : 502,
      error instanceof Error ? `IMA COS upload failed: ${error.message}` : "IMA COS upload failed",
      error,
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ProviderRequestError(
      response.status,
      `IMA COS upload failed with status ${response.status}${text ? `: ${text}` : ""}`,
      text,
    );
  }
}

async function addImaUploadedFileKnowledge(
  input: {
    knowledgeBaseId: string;
    folderId?: string;
    metadata: ImaUploadFileMetadata;
    mediaId: string;
    cosKey: string;
  },
  context: ImaRuntimeContext,
): Promise<string> {
  const payload = await imaRequest<{ media_id?: unknown }>({
    ...context,
    path: "openapi/wiki/v1/add_knowledge",
    body: compactObject({
      media_type: input.metadata.mediaType,
      media_id: input.mediaId,
      title: input.metadata.fileName,
      knowledge_base_id: input.knowledgeBaseId,
      folder_id: input.folderId,
      file_info: {
        cos_key: input.cosKey,
        file_size: input.metadata.fileSize,
        file_name: input.metadata.fileName,
      },
    }),
    phase: "execute",
  });

  return requireImaField(payload.media_id ?? input.mediaId, "mediaId");
}

async function requestImaMediaInfo(mediaId: string, context: ImaRuntimeContext): Promise<ImaMediaInfo> {
  const payload = await imaRequest<{
    media_type?: unknown;
    url_info?: unknown;
    notebook_ext_info?: unknown;
  }>({
    ...context,
    path: "openapi/wiki/v1/get_media_info",
    body: {
      media_id: mediaId,
    },
    phase: "execute",
  });

  const urlInfo = optionalRecord(payload.url_info);
  const notebookExtInfo = optionalRecord(payload.notebook_ext_info);
  const url = optionalString(urlInfo?.url) ?? null;
  const notebookId = optionalString(notebookExtInfo?.notebook_id) ?? null;
  return {
    mediaType: readInteger(payload.media_type) ?? 0,
    url,
    headers: asStringMapOrNull(urlInfo?.headers),
    notebookId,
    accessible: Boolean(url || notebookId),
  };
}

async function getImaMediaInfo(input: Record<string, unknown>, context: ImaRuntimeContext): Promise<ImaMediaInfo> {
  return requestImaMediaInfo(requireImaField(input.mediaId, "mediaId"), context);
}

async function getImaKnowledgeItemOriginal(
  input: Record<string, unknown>,
  context: ImaRuntimeContext,
): Promise<unknown> {
  const mediaInfo = await requestImaMediaInfo(requireImaField(input.mediaId, "mediaId"), context);
  if (mediaInfo.notebookId) {
    const noteContent = await getImaNoteContent({ noteId: mediaInfo.notebookId }, context);
    return {
      mediaInfo,
      content: noteContent.content,
      file: null,
    };
  }

  if (!mediaInfo.url) {
    return {
      mediaInfo,
      content: null,
      file: null,
    };
  }

  if (!context.transitFiles) {
    throw new ProviderRequestError(500, "get_knowledge_item_original requires local transit file storage.");
  }

  const response = await context.fetcher(mediaInfo.url, {
    method: "GET",
    headers: mediaInfo.headers ?? {},
    signal: context.signal,
  });
  if (!response.ok) {
    throw new ProviderRequestError(502, `IMA media URL download failed with status ${response.status}`);
  }

  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: maxImaDownloadBytes,
    fieldName: "IMA media URL",
    createError: (message) => new ProviderRequestError(400, message),
  });
  const mimeType = response.headers.get("content-type") ?? "application/octet-stream";
  const name = optionalString(input.fileName) ?? inferFileNameFromUrl(mediaInfo.url, mimeType);
  const upload = await context.transitFiles.create(new File([Buffer.from(bytes)], name, { type: mimeType }));

  return {
    mediaInfo,
    content: null,
    file: {
      fileId: upload.fileId,
      downloadUrl: upload.downloadUrl,
      sizeBytes: upload.sizeBytes,
      name,
      mimeType,
    },
  };
}

async function downloadUrlBytes(
  sourceUrl: URL,
  context: ImaRuntimeContext,
): Promise<{ bytes: Uint8Array; contentType?: string }> {
  let response: Response;
  try {
    response = await context.fetcher(sourceUrl, {
      method: "GET",
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `IMA upload source download failed: ${error.message}`
        : "IMA upload source download failed",
      error,
    );
  }

  if (!response.ok) {
    throw new ProviderRequestError(502, `IMA upload source download failed with status ${response.status}`);
  }

  return {
    bytes: await readBoundedResponseBytes(response, {
      maxBytes: maxImaDownloadBytes,
      fieldName: "IMA upload source",
      createError: (message) => new ProviderRequestError(400, message),
    }),
    contentType: response.headers.get("content-type") ?? undefined,
  };
}

async function imaRequest<T>(input: ImaRequestInput): Promise<T> {
  let response: Response;
  let responseText: string;
  try {
    response = await input.fetcher(`${imaApiBaseUrl}/${input.path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "ima-openapi-clientid": input.clientId,
        "ima-openapi-apikey": input.apiKey,
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(input.body),
      signal: input.signal,
    });
    responseText = await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : "IMA request failed";
    throw new ProviderRequestError(
      isImaTimeoutError(error) ? 504 : 502,
      isImaTimeoutError(error) ? `IMA request timed out: ${message}` : `IMA request failed: ${message}`,
      error,
    );
  }

  if (response.status === 429) {
    throw new ProviderRequestError(429, "IMA rate limit reached");
  }

  const parsed = parseImaResponse(responseText);
  if (!parsed) {
    throw new ProviderRequestError(502, `IMA returned a non-JSON response with status ${response.status}`);
  }

  const envelope = parsed as ImaEnvelope<T>;
  const code = readInteger(envelope.code);
  if (code === 0) {
    return (envelope.data ?? {}) as T;
  }

  const message = optionalString(envelope.msg) ?? `IMA request failed with code ${code ?? response.status}`;
  throw mapImaError(code, message, input.phase);
}

function mapImaError(code: number | undefined, message: string, phase: "validate" | "execute"): ProviderRequestError {
  if (code != null && imaRateLimitedCodes.has(code)) {
    return new ProviderRequestError(429, message);
  }
  if (code != null && imaCredentialCodes.has(code)) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (code != null && imaInvalidInputCodes.has(code)) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function parseImaResponse(value: string): unknown {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function requireImaField(value: unknown, fieldName: string): string {
  const resolved = optionalString(value)?.trim();
  if (!resolved) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return resolved;
}

function requireImaFileName(value: unknown): string {
  const fileName = requireImaField(value, "fileName");
  if (fileName.includes("/") || fileName.includes("\\")) {
    throw new ProviderRequestError(400, "fileName must not include path separators");
  }
  return fileName;
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  const resolved = readInteger(value);
  if (resolved == null || resolved <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return resolved;
}

function requireImaText(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} is required`);
}

function readInteger(value: unknown): number | undefined {
  return optionalIntegerLike(value, "integer", (message) => new ProviderRequestError(502, message));
}

function mapNoteSortType(value: unknown): number {
  switch (optionalString(value)) {
    case "create_time":
      return 1;
    case "title":
      return 2;
    case "size":
      return 3;
    default:
      return 0;
  }
}

function normalizeSearchNote(value: unknown): Record<string, unknown> | null {
  const raw = optionalRecord(value);
  if (!raw) {
    return null;
  }

  return normalizeNoteBasic(optionalRecord(raw.note_book_info), asStringMapOrNull(raw.highlightInfo));
}

function normalizeListedNote(value: unknown): Record<string, unknown> | null {
  const raw = optionalRecord(value);
  return raw ? normalizeNoteBasic(raw, null) : null;
}

function normalizeNoteBasic(
  value: Record<string, unknown> | undefined,
  highlightInfo: Record<string, string> | null,
): Record<string, unknown> | null {
  const raw = value ?? {};
  const noteExtInfo = optionalRecord(raw.note_ext_info);
  const noteId = optionalString(raw.note_id);
  if (!noteId) {
    return null;
  }

  return {
    noteId,
    title: optionalString(raw.title) ?? null,
    summary: optionalString(raw.summary) ?? null,
    createTime: readInteger(raw.create_time) ?? null,
    modifyTime: readInteger(raw.modify_time) ?? null,
    folderId: optionalString(noteExtInfo?.folder_id) ?? null,
    folderName: optionalString(noteExtInfo?.folder_name) ?? null,
    highlightInfo,
  };
}

function normalizeNotebook(value: unknown): Record<string, unknown> | null {
  const basicInfo = optionalRecord(value);
  const folderId = optionalString(basicInfo?.folder_id);
  if (!folderId) {
    return null;
  }

  return {
    folderId,
    name: optionalString(basicInfo?.name) ?? null,
    noteCount: readInteger(basicInfo?.note_number) ?? null,
    createTime: readInteger(basicInfo?.create_time) ?? null,
    modifyTime: readInteger(basicInfo?.modify_time) ?? null,
    parentFolderId: optionalString(basicInfo?.parent_folder_id) ?? null,
    folderType: normalizeNotebookType(basicInfo?.folder_type),
  };
}

function normalizeKnowledgeBase(value: unknown, fallbackId?: string): Record<string, unknown> | null {
  const raw = optionalRecord(value);
  const id = optionalString(raw?.id) ?? fallbackId;
  if (!id) {
    return null;
  }

  return {
    id,
    name: optionalString(raw?.name) ?? null,
    coverUrl: optionalString(raw?.cover_url) ?? null,
    description: optionalString(raw?.description) ?? null,
    recommendedQuestions: asStringArray(raw?.recommended_questions),
  };
}

function normalizeKnowledgeItem(value: unknown): Record<string, unknown> | null {
  const raw = optionalRecord(value);
  if (!raw) {
    return null;
  }

  const folderId = optionalString(raw.folder_id);
  const mediaId = optionalString(raw.media_id);
  if (folderId || (!mediaId && optionalString(raw.name))) {
    return normalizeKnowledgeFolder(raw);
  }
  if (!mediaId) {
    return null;
  }

  return {
    itemType: "knowledge",
    mediaId,
    folderId: null,
    title: optionalString(raw.title) ?? null,
    name: null,
    parentFolderId: optionalString(raw.parent_folder_id) ?? null,
    fileCount: null,
    folderCount: null,
    isTop: null,
    highlightContent: optionalString(raw.highlight_content) ?? null,
  };
}

function normalizeKnowledgeFolder(value: unknown): Record<string, unknown> | null {
  const raw = optionalRecord(value);
  const folderId = optionalString(raw?.folder_id);
  if (!folderId) {
    return null;
  }

  return {
    itemType: "folder",
    mediaId: null,
    folderId,
    title: null,
    name: optionalString(raw?.name) ?? null,
    parentFolderId: optionalString(raw?.parent_folder_id) ?? null,
    fileCount: readInteger(raw?.file_number) ?? null,
    folderCount: readInteger(raw?.folder_number) ?? null,
    isTop: optionalBoolean(raw?.is_top) ?? null,
    highlightContent: optionalString(raw?.highlight_content) ?? null,
  };
}

function normalizeNotebookType(value: unknown): "user_created" | "all_notes" | "uncategorized" | null {
  switch (readInteger(value)) {
    case 0:
      return "user_created";
    case 1:
      return "all_notes";
    case 2:
      return "uncategorized";
    default:
      return null;
  }
}

function resolveImaUploadFileMetadata(
  fileName: string,
  inputContentType: string | undefined,
  fileSize: number,
): ImaUploadFileMetadata {
  const fileExt = extname(fileName).replace(/^\./, "").toLowerCase();
  if (!fileExt) {
    throw new ProviderRequestError(400, "fileName must include a file extension");
  }
  if (unsupportedVideoExtensions.has(fileExt)) {
    throw new ProviderRequestError(400, `video files are not supported: .${fileExt}`);
  }
  const normalizedContentType = inputContentType?.split(";")[0]?.trim().toLowerCase();
  if (normalizedContentType && unsupportedVideoContentTypes.has(normalizedContentType)) {
    throw new ProviderRequestError(400, `video content is not supported: ${normalizedContentType}`);
  }

  const mediaTypeByContentType = normalizedContentType
    ? imaUploadableTypesByContentType.get(normalizedContentType)
    : undefined;
  const extensionMapping = imaUploadableTypesByExtension[fileExt as keyof typeof imaUploadableTypesByExtension];
  const mediaType = mediaTypeByContentType ?? extensionMapping?.mediaType;
  const contentType = mediaTypeByContentType != null ? normalizedContentType : extensionMapping?.contentType;
  if (!mediaType || !contentType) {
    throw new ProviderRequestError(400, `unsupported IMA upload file type${fileExt ? `: .${fileExt}` : ""}`);
  }

  const sizeLimit = getImaUploadSizeLimit(mediaType);
  if (fileSize > sizeLimit) {
    throw new ProviderRequestError(
      400,
      `file size ${fileSize} exceeds the ${sizeLimit} byte IMA limit for this file type`,
    );
  }

  return {
    fileName,
    fileExt,
    fileSize,
    mediaType,
    contentType,
  };
}

function resolveDuplicateUploadMetadata(
  metadata: ImaUploadFileMetadata,
  duplicatePolicy: string,
): ImaUploadFileMetadata {
  if (duplicatePolicy === "fail") {
    throw new ProviderRequestError(409, `file already exists: ${metadata.fileName}`);
  }
  if (duplicatePolicy !== "keep_both") {
    throw new ProviderRequestError(400, "duplicatePolicy must be fail or keep_both");
  }

  const suffix = formatTimestampForFileName(new Date());
  const extension = extname(metadata.fileName);
  const baseName = extension ? metadata.fileName.slice(0, -extension.length) : metadata.fileName;
  return {
    ...metadata,
    fileName: `${baseName}_${suffix}${extension}`,
  };
}

function normalizeImaCosCredential(value: unknown): ImaCosCredential {
  const raw = optionalRecord(value);
  if (!raw) {
    throw new ProviderRequestError(502, "IMA create_media response missing cos_credential");
  }

  return {
    token: requireImaField(raw.token, "cosCredential.token"),
    secretId: requireImaField(raw.secret_id, "cosCredential.secretId"),
    secretKey: requireImaField(raw.secret_key, "cosCredential.secretKey"),
    startTime: requirePositiveInteger(raw.start_time, "cosCredential.startTime"),
    expiredTime: requirePositiveInteger(raw.expired_time, "cosCredential.expiredTime"),
    bucketName: requireImaField(raw.bucket_name, "cosCredential.bucketName"),
    region: requireImaField(raw.region, "cosCredential.region"),
    cosKey: requireImaField(raw.cos_key, "cosCredential.cosKey"),
  };
}

function buildImaCosAuthorization(input: {
  secretId: string;
  secretKey: string;
  method: string;
  pathname: string;
  headers: Record<string, string>;
  startTime: string;
  expiredTime: string;
}): string {
  const keyTime = `${input.startTime};${input.expiredTime}`;
  const signKey = hmacSha1(input.secretKey, keyTime);
  const headerKeys = Object.keys(input.headers).sort();
  const httpHeaders = headerKeys
    .map((key) => `${key.toLowerCase()}=${encodeURIComponent(input.headers[key] ?? "")}`)
    .join("&");
  const httpString = `${input.method.toLowerCase()}\n${input.pathname}\n\n${httpHeaders}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1(httpString)}\n`;
  const signature = hmacSha1(signKey, stringToSign);
  const headerList = headerKeys.map((key) => key.toLowerCase()).join(";");

  return [
    "q-sign-algorithm=sha1",
    `q-ak=${input.secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${headerList}`,
    "q-url-param-list=",
    `q-signature=${signature}`,
  ].join("&");
}

function hmacSha1(key: string, value: string): string {
  return createHmac("sha1", key).update(value).digest("hex");
}

function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function getImaUploadSizeLimit(mediaType: number): number {
  if (mediaType === 5 || mediaType === 7 || mediaType === 13 || mediaType === 14) {
    return smallFileLimit;
  }
  if (mediaType === 9) {
    return imageFileLimit;
  }
  return maxImaDownloadBytes;
}

function formatTimestampForFileName(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return [
    value.getFullYear(),
    pad(value.getMonth() + 1),
    pad(value.getDate()),
    pad(value.getHours()),
    pad(value.getMinutes()),
    pad(value.getSeconds()),
  ].join("");
}

function inferFileNameFromUrl(value: string, mimeType: string): string {
  try {
    const url = new URL(value);
    const rawName = basename(url.pathname);
    if (rawName) {
      return rawName;
    }
  } catch {
    // IMA returned the URL; this only provides a local fallback filename.
  }

  const extension = inferExtensionFromMimeType(mimeType);
  return extension ? `ima-original.${extension}` : "ima-original";
}

function inferExtensionFromMimeType(mimeType: string): string | null {
  const normalized = mimeType.split(";")[0]?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  for (const [extension, value] of Object.entries(imaUploadableTypesByExtension)) {
    if (value.contentType === normalized) {
      return extension;
    }
  }

  const subtype = normalized.split("/")[1];
  if (!subtype || subtype.startsWith("vnd.")) {
    return null;
  }
  return subtype.replace(/[^a-z0-9]+/g, "") || null;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => optionalString(item)).filter((item): item is string => item != null);
}

function asStringMapOrNull(value: unknown): Record<string, string> | null {
  const raw = optionalRecord(value);
  if (!raw) {
    return null;
  }

  const entries = Object.entries(raw)
    .map(([key, child]) => {
      const normalized = optionalString(child);
      return normalized == null ? null : [key, normalized];
    })
    .filter((entry): entry is [string, string] => entry != null);

  return entries.length > 0 ? Object.fromEntries(entries) : {};
}

function isImaTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.name === "TimeoutError" ||
      (error as Error & { code?: unknown }).code === "ECONNABORTED")
  );
}
