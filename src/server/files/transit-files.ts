import type { TransitFileRead, TransitFileStream, TransitFileUpload } from "../../core/types.ts";
import type { IStagedTransitFileService, StagedTransitFile, TransitFileDescriptor } from "./transit-file-store.ts";
import type { Stats } from "node:fs";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, opendir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
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

/** How often the write path may start a sweep of expired transit files. */
const sweepIntervalMs = 60_000;
/** How many directory entries a sweep stats at once. */
const sweepConcurrency = 64;

export class TransitFileService implements IStagedTransitFileService {
  private readonly rootDir: string;
  private readonly publicOrigin: string;
  private readonly ttlMs: number;
  readonly maxBytes: number;
  private sweeping: Promise<void> | undefined;
  private followUp: Promise<void> | undefined;
  private lastSweepAt = Number.NEGATIVE_INFINITY;

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
      this.sweepIfDue();
      await mkdir(this.rootDir, { recursive: true });
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
    this.sweepIfDue();
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

  /**
   * Remove expired files and their side-cars. One sweep runs at a time (a
   * caller arriving mid-sweep shares it), and the directory is walked in
   * bounded batches, so its size never turns into that many concurrent
   * filesystem requests on the heap.
   */
  cleanupExpired(): Promise<void> {
    if (this.sweeping) {
      // The running sweep may have read the directory before this call:
      // run one more after it, shared by every caller that arrives meanwhile.
      if (!this.followUp) {
        const next = (): Promise<void> => {
          this.followUp = undefined;
          return this.startSweep();
        };
        this.followUp = this.sweeping.then(next, next);
      }
      return this.followUp;
    }
    return this.startSweep();
  }

  private startSweep(): Promise<void> {
    if (this.sweeping) {
      return this.sweeping;
    }
    this.lastSweepAt = Date.now();
    this.sweeping = this.sweep().finally(() => {
      this.sweeping = undefined;
    });
    return this.sweeping;
  }

  /**
   * The write path's sweep: at most one every {@link sweepIntervalMs}, never
   * awaited. Sweeping on every write made each upload walk the whole
   * directory, so concurrent downloads into a store holding a day of files
   * queued hundreds of thousands of `stat` calls and exhausted the heap.
   */
  private sweepIfDue(): void {
    if (this.sweeping || Date.now() - this.lastSweepAt < sweepIntervalMs) {
      return;
    }
    void this.cleanupExpired().catch(() => undefined);
  }

  private async sweep(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    const cutoff = Date.now() - this.ttlMs;
    let batch: string[] = [];
    const flush = async (): Promise<void> => {
      await Promise.all(
        batch.map(async (name) => {
          const path = join(this.rootDir, name);
          const stats = await stat(path).catch(() => undefined);
          if (stats && stats.mtimeMs < cutoff) {
            await unlink(path).catch(() => undefined);
            await unlink(metadataPath(path)).catch(() => undefined);
          }
        }),
      );
      batch = [];
    };
    for await (const entry of await opendir(this.rootDir)) {
      if (!entry.isFile() || !isManagedFileName(entry.name)) {
        continue;
      }
      batch.push(entry.name);
      if (batch.length >= sweepConcurrency) {
        await flush();
      }
    }
    await flush();
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
