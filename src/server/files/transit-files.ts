import type { TransitFileRead, TransitFileStream, TransitFileUpload } from "../../core/types.ts";
import type { IStagedTransitFileService, StagedTransitFile, TransitFileDescriptor } from "./transit-file-store.ts";
import type { Stats } from "node:fs";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  assertFileSize,
  assertSafeFileId,
  contentTypeFromFileId,
  isSafeFileId,
  normalizeDescriptor,
  randomHex,
  safeExtension,
  TransitFileError,
  transitFileRead,
  transitFileResponse,
  uploadResult,
} from "./transit-file-store.ts";

export interface TransitFileOptions {
  rootDir: string;
  publicOrigin: string;
  ttlSeconds: number;
  maxBytes: number;
}

export class TransitFileService implements IStagedTransitFileService {
  private readonly rootDir: string;
  private readonly publicOrigin: string;
  private readonly ttlMs: number;
  readonly maxBytes: number;

  constructor(options: TransitFileOptions) {
    this.rootDir = options.rootDir;
    this.publicOrigin = options.publicOrigin;
    this.ttlMs = options.ttlSeconds * 1000;
    this.maxBytes = options.maxBytes;
  }

  async create(file: File): Promise<TransitFileUpload> {
    assertFileSize(file.size, this.maxBytes);
    return this.createFromStream({ body: file.stream(), name: file.name, mimeType: file.type });
  }

  async createFromStream(file: TransitFileStream): Promise<TransitFileUpload> {
    const fileId = `${randomHex(16)}${safeExtension(file.name)}`;
    const path = join(this.rootDir, fileId);
    const tempPath = `${path}.tmp`;
    const metadata = normalizeDescriptor({
      name: file.name || fileId,
      mimeType: file.mimeType || contentTypeFromFileId(fileId),
    });
    try {
      file.signal?.throwIfAborted();
      await this.cleanupExpired();
      const sizeBytes = await this.writeStream(file, tempPath);
      file.signal?.throwIfAborted();
      await writeFile(metadataPath(path), JSON.stringify(metadata), { flag: "wx", signal: file.signal });
      await rename(tempPath, path);
      file.signal?.throwIfAborted();
      return uploadResult(this.publicOrigin, fileId, { ...metadata, sizeBytes });
    } catch (error) {
      if (!file.body.locked) {
        await file.body.cancel(error).catch(() => undefined);
      }
      await Promise.all(
        [tempPath, path, metadataPath(path)].map((filePath) => unlink(filePath).catch(() => undefined)),
      );
      throw error;
    }
  }

  async createFromPath(file: StagedTransitFile): Promise<TransitFileUpload> {
    assertFileSize(file.sizeBytes, this.maxBytes);
    await this.cleanupExpired();
    await mkdir(this.rootDir, { recursive: true });

    const fileId = `${randomHex(16)}${safeExtension(file.name)}`;
    const path = join(this.rootDir, fileId);
    await rename(file.path, path);
    const metadata = normalizeDescriptor({
      name: file.name || fileId,
      mimeType: file.mimeType || contentTypeFromFileId(fileId),
    });
    await writeFile(metadataPath(path), JSON.stringify(metadata), { flag: "wx" });

    return uploadResult(this.publicOrigin, fileId, { ...metadata, sizeBytes: file.sizeBytes });
  }

  async read(fileId: string): Promise<TransitFileRead> {
    const { path, stats, metadata } = await this.locate(fileId);
    return transitFileRead(await readFile(path), { ...metadata, sizeBytes: stats.size });
  }

  async response(fileId: string): Promise<Response> {
    const { path, stats, metadata } = await this.locate(fileId);
    return transitFileResponse(Readable.toWeb(createReadStream(path)) as ReadableStream, {
      ...metadata,
      sizeBytes: stats.size,
    });
  }

  async delete(fileId: string): Promise<boolean> {
    assertSafeFileId(fileId);
    const path = join(this.rootDir, fileId);
    try {
      await unlink(path);
      await unlink(metadataPath(path)).catch(() => undefined);
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
          await unlink(metadataPath(path)).catch(() => undefined);
        }
      }),
    );
  }

  /** Resolve a live, unexpired file on disk together with its side-car metadata, or report it as missing. */
  private async locate(fileId: string): Promise<{ path: string; stats: Stats; metadata: TransitFileDescriptor }> {
    assertSafeFileId(fileId);
    const path = join(this.rootDir, fileId);
    const stats = await stat(path).catch(() => undefined);
    if (!stats?.isFile()) {
      throw new TransitFileError(404, "file_not_found", "Transit file was not found.");
    }
    if (Date.now() - stats.mtimeMs > this.ttlMs) {
      await unlink(path).catch(() => undefined);
      await unlink(metadataPath(path)).catch(() => undefined);
      throw new TransitFileError(404, "file_not_found", "Transit file was not found.");
    }

    const metadata = await this.readMetadata(path, fileId);
    return { path, stats, metadata };
  }

  private async readMetadata(path: string, fileId: string): Promise<TransitFileDescriptor> {
    const fallback = { name: fileId, mimeType: contentTypeFromFileId(fileId) };
    const text = await readFile(metadataPath(path), "utf8").catch(() => undefined);
    if (!text) {
      return fallback;
    }
    try {
      return normalizeDescriptor(JSON.parse(text) as Partial<TransitFileDescriptor>, fallback);
    } catch {
      return fallback;
    }
  }

  private async writeStream(file: TransitFileStream, tempPath: string): Promise<number> {
    let sizeBytes = 0;
    const maxBytes = this.maxBytes;
    const source = Readable.fromWeb(file.body as NodeReadableStream<Uint8Array>);
    const destination = createWriteStream(tempPath, { flags: "wx" });
    // Pipeline can reject while the file is still opening. Wait for close before unlinking it.
    const closed = new Promise<void>((resolve) => destination.once("close", resolve));
    try {
      await pipeline(
        source,
        async function* (source) {
          for await (const chunk of source) {
            sizeBytes += chunk.byteLength;
            assertFileSize(sizeBytes, maxBytes);
            yield chunk;
          }
        },
        destination,
        { signal: file.signal },
      );
    } finally {
      await closed;
    }
    return sizeBytes;
  }
}

function isManagedFileName(fileName: string): boolean {
  return isSafeFileId(fileName.replace(/\.(?:tmp|meta\.json)$/, ""));
}

function metadataPath(path: string): string {
  return `${path}.meta.json`;
}
