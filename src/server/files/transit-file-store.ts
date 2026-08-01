export interface TransitFileUpload {
  fileId: string;
  downloadUrl: string;
  sizeBytes: number;
  name: string;
  mimeType: string;
}

export interface TransitFileRead {
  file: File;
  sizeBytes: number;
  name: string;
  mimeType: string;
}

export interface ITransitFileService {
  readonly maxBytes: number;
  create(file: File): Promise<TransitFileUpload>;
  read(fileId: string): Promise<TransitFileRead>;
  response?(fileId: string): Promise<Response>;
  delete(fileId: string): Promise<boolean>;
  cleanupExpired(): Promise<void>;
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

export function createTransitFileResponse(file: TransitFileRead): Response {
  return new Response(file.file.stream(), {
    headers: {
      "content-length": String(file.sizeBytes),
      "content-type": file.mimeType,
      "content-disposition": contentDispositionForFileName(file.name),
    },
  });
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
