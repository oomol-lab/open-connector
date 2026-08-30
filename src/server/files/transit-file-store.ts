import type { TransitFileRead, TransitFileUpload } from "../../core/types.ts";

import { extname } from "node:path";

export type { TransitFileRead, TransitFileUpload };

/** Stored side-car metadata for one transit file. */
export interface TransitFileMetadata {
  name: string;
  mimeType: string;
  createdAt: string;
  sizeBytes: number;
}

export interface StagedTransitFile {
  path: string;
  sizeBytes: number;
  name: string;
  mimeType: string;
}

export interface ITransitFileService {
  readonly maxBytes: number;
  create(file: File): Promise<TransitFileUpload>;
  read(fileId: string): Promise<TransitFileRead>;
  response(fileId: string): Promise<Response>;
  delete(fileId: string): Promise<boolean>;
  cleanupExpired(): Promise<void>;
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

/**
 * Build the `content-disposition` value for a transit file download.
 *
 * Header values are ByteStrings, so a name holding a character above U+00FF
 * throws while the response is constructed and the download fails. Such names
 * travel in the RFC 6266 `filename*` parameter, and `filename` keeps an
 * ASCII-only form for clients that do not read `filename*`.
 */
export function contentDispositionForFileName(name: string): string {
  const asciiName = name.replace(/[^\u0020-\u007e]/gu, "_").replace(/["\\]/g, "_");
  if (!/[\u0080-\u{10ffff}]/u.test(name)) {
    return `attachment; filename="${asciiName}"`;
  }

  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeExtendedValue(name)}`;
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

export function randomHex(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function objectKey(fileId: string): string {
  return `transit/${fileId}`;
}

export function metadataKey(fileId: string): string {
  return `transit/${fileId}.meta.json`;
}

/** Fill in every metadata field a backend may have stored partially or not at all. */
export function normalizeMetadata(input: Partial<TransitFileMetadata>): TransitFileMetadata {
  return {
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : "file",
    mimeType:
      typeof input.mimeType === "string" && input.mimeType.trim() ? input.mimeType.trim() : "application/octet-stream",
    createdAt: typeof input.createdAt === "string" && input.createdAt ? input.createdAt : new Date().toISOString(),
    sizeBytes: typeof input.sizeBytes === "number" && Number.isFinite(input.sizeBytes) ? input.sizeBytes : 0,
  };
}
