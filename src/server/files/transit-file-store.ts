import type { TransitFileAccess, TransitFileRead, TransitFileStore, TransitFileUpload } from "../../core/types.ts";

import { extname } from "node:path";

/** The user-facing name and MIME type every backend keeps beside a transit file's bytes. */
export interface TransitFileDescriptor {
  name: string;
  mimeType: string;
}

/** A descriptor plus the byte size every upload answer and download response reports. */
export interface TransitFileInfo extends TransitFileDescriptor {
  sizeBytes: number;
}

/** Stored side-car metadata for one transit file. */
export interface TransitFileMetadata extends TransitFileInfo {
  createdAt: string;
  /** Scope the file is bound to, absent for an unscoped file. */
  scope?: string;
}

export interface StagedTransitFile {
  path: string;
  sizeBytes: number;
  name: string;
  mimeType: string;
  scope?: string;
}

export interface ITransitFileService extends TransitFileStore {
  response(fileId: string, access?: TransitFileAccess): Promise<Response>;
  cleanupExpired(): Promise<void>;
  /** Delete every file bound to `scope` and report how many were removed. */
  deleteByScope(scope: string): Promise<number>;
}

export interface IStagedTransitFileService extends ITransitFileService {
  createFromPath(file: StagedTransitFile): Promise<TransitFileUpload>;
}

export class TransitFileError extends Error {
  readonly status: 400 | 404 | 413;
  readonly code: string;

  constructor(status: 400 | 404 | 413, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Operator access (no `access`) sees every file; any other caller sees only files of its own scope. */
export function canAccessFile(fileScope: string | undefined, access: TransitFileAccess | undefined): boolean {
  return access === undefined || (fileScope || undefined) === access.scope;
}

/** Report a file the caller may not see as missing, with the same error as a file that does not exist. */
export function assertFileAccess(fileScope: string | undefined, access: TransitFileAccess | undefined): void {
  if (!canAccessFile(fileScope, access))
    throw new TransitFileError(404, "file_not_found", "Transit file was not found.");
}

/** Wrap a store so every call is bound to one scope: new files carry it and reads only see files of that scope. */
export function bindTransitFilesToScope(store: TransitFileStore, scope: string | undefined): TransitFileStore {
  const access: TransitFileAccess = scope === undefined ? {} : { scope };
  const bound: TransitFileStore = {
    get maxBytes() {
      return store.maxBytes;
    },
    create: (file) => store.create(file, scope === undefined ? undefined : { scope }),
    read: (fileId) => store.read(fileId, access),
    delete: (fileId) => store.delete(fileId, access),
  };
  if (store.createFromStream) {
    const createFromStream = store.createFromStream.bind(store);
    bound.createFromStream = (file) => createFromStream(scope === undefined ? file : { ...file, scope });
  }
  if (store.response) {
    const response = store.response.bind(store);
    bound.response = (fileId) => response(fileId, access);
  }
  return bound;
}

/** Reject a payload larger than the backend's configured upload limit. */
export function assertFileSize(size: number, maxBytes: number): void {
  if (size > maxBytes) {
    throw new TransitFileError(413, "file_too_large", `Transit file must be ${maxBytes} bytes or smaller.`);
  }
}

/** Wrap a transit file's bytes in the download response every backend serves. */
export function transitFileResponse(body: BodyInit, info: TransitFileInfo): Response {
  return new Response(body, {
    headers: {
      "content-length": String(info.sizeBytes),
      "content-type": info.mimeType,
      "content-disposition": contentDispositionForFileName(info.name),
    },
  });
}

/** Materialize a transit file's bytes as the `File` the executor-facing read contract returns. */
export function transitFileRead(bytes: ArrayBuffer | Uint8Array<ArrayBuffer>, info: TransitFileInfo): TransitFileRead {
  return {
    file: new File([bytes], info.name, { type: info.mimeType }),
    sizeBytes: info.sizeBytes,
    name: info.name,
    mimeType: info.mimeType,
  };
}

/** Describe a stored transit file to its uploader, with a download URL rooted at `publicOrigin`. */
export function uploadResult(publicOrigin: string, fileId: string, info: TransitFileInfo): TransitFileUpload {
  return {
    fileId,
    downloadUrl: `${publicOrigin.replace(/\/+$/, "")}/api/files/${encodeURIComponent(fileId)}`,
    sizeBytes: info.sizeBytes,
    name: info.name,
    mimeType: info.mimeType,
  };
}

/**
 * Build the `content-disposition` value for a transit file download.
 *
 * Header values are ByteStrings, so a name holding a character above U+00FF
 * throws while the response is constructed and the download fails. Such names
 * travel in the RFC 6266 `filename*` parameter, and `filename` keeps an
 * ASCII-only form for clients that do not read `filename*`.
 */
export function contentDispositionForFileName(name: string): string {
  // Metadata written before the write-time repair (or supplied by a caller)
  // can still hold an unpaired surrogate. `encodeURIComponent` throws on it,
  // which would fail every download for the whole lifetime of the file.
  const repaired = name.toWellFormed();
  const asciiName = repaired.replace(/[^\u0020-\u007e]/gu, "_").replace(/["\\]/g, "_");
  if (!/[\u0080-\u{10ffff}]/u.test(repaired)) {
    return `attachment; filename="${asciiName}"`;
  }

  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeExtendedValue(repaired)}`;
}

/** Percent-encode a file name as an RFC 8187 `ext-value`, which allows fewer literals than a URI component. */
function encodeExtendedValue(name: string): string {
  return encodeURIComponent(name).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function contentTypeFromFileId(fileId: string): string {
  const dotIndex = fileId.lastIndexOf(".");
  const extension = dotIndex === -1 ? "" : fileId.slice(dotIndex).toLowerCase();
  switch (extension) {
    case ".css":
      return "text/css";
    case ".csv":
      return "text/csv";
    case ".gif":
      return "image/gif";
    case ".gz":
      return "application/gzip";
    case ".html":
      return "text/html";
    case ".jpeg":
    case ".jpg":
      return "image/jpeg";
    case ".js":
      return "text/javascript";
    case ".json":
      return "application/json";
    case ".md":
      return "text/markdown";
    case ".mp3":
      return "audio/mpeg";
    case ".mp4":
      return "video/mp4";
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".tar":
      return "application/x-tar";
    case ".txt":
      return "text/plain";
    case ".wav":
      return "audio/wav";
    case ".webm":
      return "video/webm";
    case ".webp":
      return "image/webp";
    case ".xml":
      return "application/xml";
    case ".zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}

/** Transit file ids are generated locally, so a well-formed id is `<32 hex>[.<extension>]`. */
export function isSafeFileId(fileId: string): boolean {
  return /^[a-f0-9]{32}(?:\.[a-z0-9]{1,16})?$/.test(fileId);
}

/** Reject an id that could escape the backend key space, reporting it as a missing file. */
export function assertSafeFileId(fileId: string): void {
  if (!isSafeFileId(fileId)) {
    throw new TransitFileError(404, "file_not_found", "Transit file was not found.");
  }
}

/** Keep the uploaded name's extension when it is short and alphanumeric, otherwise drop it. */
export function safeExtension(name: string): string {
  const extension = extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,16}$/.test(extension) ? extension : "";
}

/** Hex-encode `byteLength` cryptographically random bytes from Web Crypto. */
export function randomHex(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Key holding a transit file's bytes, shared by the KV, R2 and S3 backends. */
export function objectKey(fileId: string): string {
  return `transit/${fileId}`;
}

/** Key holding a transit file's side-car metadata, shared by the KV and R2 backends. */
export function metadataKey(fileId: string): string {
  return `transit/${fileId}.meta.json`;
}

/** Trim a stored name and MIME type, substituting the matching fallback for a missing or blank value. */
export function normalizeDescriptor(
  input: Partial<TransitFileDescriptor>,
  fallback: TransitFileDescriptor = { name: "file", mimeType: "application/octet-stream" },
): TransitFileDescriptor {
  return {
    // Repair unpaired UTF-16 surrogates at the storage boundary so every
    // backend and every later reader sees a well-formed name.
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim().toWellFormed() : fallback.name,
    mimeType: typeof input.mimeType === "string" && input.mimeType.trim() ? input.mimeType.trim() : fallback.mimeType,
  };
}

/** Decode a stored metadata document, filling in every field a backend may have written partially or not at all. */
export function normalizeMetadata(input: Partial<TransitFileMetadata>): TransitFileMetadata {
  return {
    ...normalizeDescriptor(input),
    createdAt: typeof input.createdAt === "string" && input.createdAt ? input.createdAt : new Date().toISOString(),
    sizeBytes: typeof input.sizeBytes === "number" && Number.isFinite(input.sizeBytes) ? input.sizeBytes : 0,
    ...(typeof input.scope === "string" && input.scope ? { scope: input.scope } : {}),
  };
}

/**
 * Delete every file of one scope from a store that keeps metadata in `transit/<id>.meta.json` sidecars (KV, R2).
 * `listPage` returns one page of keys under `transit/` and the cursor of the next page.
 */
export async function deleteScopedSidecarFiles(
  scope: string,
  listPage: (cursor: string | undefined) => Promise<{ keys: string[]; cursor?: string }>,
  readScope: (fileId: string) => Promise<string | undefined>,
  remove: (fileId: string) => Promise<unknown>,
): Promise<number> {
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const page = await listPage(cursor);
    for (const key of page.keys) {
      if (!key.endsWith(".meta.json")) continue;
      const fileId = key.slice("transit/".length, -".meta.json".length);
      if (!isSafeFileId(fileId) || (await readScope(fileId)) !== scope) continue;
      await remove(fileId);
      deleted += 1;
    }
    cursor = page.cursor;
  } while (cursor);
  return deleted;
}
