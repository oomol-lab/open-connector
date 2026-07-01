import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";

export interface TransitFileOptions {
  rootDir: string;
  publicOrigin: string;
  ttlSeconds: number;
  maxBytes: number;
}

export interface TransitFileUpload {
  fileId: string;
  downloadUrl: string;
  sizeBytes: number;
}

export interface TransitFileRead {
  path: string;
  sizeBytes: number;
  contentType: string;
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

export class TransitFileService {
  private readonly rootDir: string;
  private readonly publicOrigin: string;
  private readonly ttlMs: number;
  private readonly maxBytes: number;

  constructor(options: TransitFileOptions) {
    this.rootDir = options.rootDir;
    this.publicOrigin = options.publicOrigin.replace(/\/+$/, "");
    this.ttlMs = options.ttlSeconds * 1000;
    this.maxBytes = options.maxBytes;
  }

  async create(file: File): Promise<TransitFileUpload> {
    this.assertFileSize(file.size);
    await this.cleanupExpired();
    await mkdir(this.rootDir, { recursive: true });

    const fileId = `${randomBytes(16).toString("hex")}${safeExtension(file.name)}`;
    const path = join(this.rootDir, fileId);
    const tempPath = `${path}.tmp`;
    const sizeBytes = await this.writeFile(file, tempPath);
    await rename(tempPath, path);

    return {
      fileId,
      downloadUrl: `${this.publicOrigin}/api/files/${encodeURIComponent(fileId)}`,
      sizeBytes,
    };
  }

  async read(fileId: string): Promise<TransitFileRead> {
    assertSafeFileId(fileId);
    const path = join(this.rootDir, fileId);
    const stats = await stat(path).catch(() => undefined);
    if (!stats?.isFile()) {
      throw new TransitFileError(404, "file_not_found", "Transit file was not found.");
    }
    if (Date.now() - stats.mtimeMs > this.ttlMs) {
      await unlink(path).catch(() => undefined);
      throw new TransitFileError(404, "file_not_found", "Transit file was not found.");
    }

    return {
      path,
      sizeBytes: stats.size,
      contentType: contentTypeFromFileId(fileId),
    };
  }

  async delete(fileId: string): Promise<boolean> {
    assertSafeFileId(fileId);
    const path = join(this.rootDir, fileId);
    try {
      await unlink(path);
      return true;
    } catch {
      return false;
    }
  }

  async cleanupExpired(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    const cutoff = Date.now() - this.ttlMs;
    const entries = await readdir(this.rootDir, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.isFile() || !isManagedFileName(entry.name)) {
          return;
        }
        const path = join(this.rootDir, entry.name);
        const stats = await stat(path).catch(() => undefined);
        if (stats && stats.mtimeMs < cutoff) {
          await unlink(path).catch(() => undefined);
        }
      }),
    );
  }

  private assertFileSize(size: number): void {
    if (size > this.maxBytes) {
      throw new TransitFileError(413, "file_too_large", `Transit file must be ${this.maxBytes} bytes or smaller.`);
    }
  }

  private async writeFile(file: File, tempPath: string): Promise<number> {
    const writer = createWriteStream(tempPath, { flags: "wx" });
    const reader = file.stream().getReader();
    let sizeBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        sizeBytes += value.byteLength;
        this.assertFileSize(sizeBytes);
        if (!writer.write(value)) {
          await once(writer, "drain");
        }
      }
      writer.end();
      await finished(writer);
      return sizeBytes;
    } catch (error) {
      writer.destroy();
      await unlink(tempPath).catch(() => undefined);
      throw error;
    } finally {
      reader.releaseLock();
    }
  }
}

export function createTransitFileResponse(file: TransitFileRead): Response {
  return new Response(Readable.toWeb(createReadStream(file.path)) as ReadableStream, {
    headers: {
      "content-length": String(file.sizeBytes),
      "content-type": file.contentType,
    },
  });
}

function assertSafeFileId(fileId: string): void {
  if (!isSafeFileId(fileId)) {
    throw new TransitFileError(404, "file_not_found", "Transit file was not found.");
  }
}

function isSafeFileId(fileId: string): boolean {
  return /^[a-f0-9]{32}(?:\.[a-z0-9]{1,16})?$/.test(fileId);
}

function isManagedFileName(fileName: string): boolean {
  return isSafeFileId(fileName) || /^[a-f0-9]{32}(?:\.[a-z0-9]{1,16})?\.tmp$/.test(fileName);
}

function safeExtension(name: string): string {
  const extension = extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,16}$/.test(extension) ? extension : "";
}

function contentTypeFromFileId(fileId: string): string {
  switch (extname(fileId).toLowerCase()) {
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
