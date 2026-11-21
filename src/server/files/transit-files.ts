import type { TransitFileAccess, TransitFileRead, TransitFileStream, TransitFileUpload } from "../../core/types.ts";
import type { IStagedTransitFileService, StagedTransitFile, TransitFileDescriptor } from "./transit-file-store.ts";
import type { Stats } from "node:fs";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, opendir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  assertFileAccess,
  assertFileSize,
  canAccessFile,
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

type StoredDescriptor = TransitFileDescriptor & { scope?: string };

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

  async create(file: File, options?: TransitFileAccess): Promise<TransitFileUpload> {
    assertFileSize(file.size, this.maxBytes);
    return this.createFromStream({
      body: file.stream(),
      name: file.name,
      mimeType: file.type,
      ...(options?.scope === undefined ? {} : { scope: options.scope }),
    });
  }

  async createFromStream(file: TransitFileStream): Promise<TransitFileUpload> {
    const fileId = `${randomHex(16)}${safeExtension(file.name)}`;
    const path = join(this.rootDir, fileId);
    const tempPath = `${path}.tmp`;
    const metadata = {
      ...normalizeDescriptor({
        name: file.name || fileId,
        mimeType: file.mimeType || contentTypeFromFileId(fileId),
      }),
      ...(file.scope === undefined ? {} : { scope: file.scope }),
    };
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
    const metadata = {
      ...normalizeDescriptor({
        name: file.name || fileId,
        mimeType: file.mimeType || contentTypeFromFileId(fileId),
      }),
      ...(file.scope === undefined ? {} : { scope: file.scope }),
    };
    // The side-car goes first, as in createFromStream, so published data never lacks its scope.
    await writeFile(metadataPath(path), JSON.stringify(metadata), { flag: "wx" });
    try {
      await rename(file.path, path);
    } catch (error) {
      await unlink(metadataPath(path)).catch(() => undefined);
      throw error;
    }

    return uploadResult(this.publicOrigin, fileId, { ...metadata, sizeBytes: file.sizeBytes });
  }

  async read(fileId: string, access?: TransitFileAccess): Promise<TransitFileRead> {
    const { path, stats, metadata } = await this.locate(fileId, access);
    return transitFileRead(await readFile(path), { ...metadata, sizeBytes: stats.size });
  }

  async response(fileId: string, access?: TransitFileAccess): Promise<Response> {
    const { path, stats, metadata } = await this.locate(fileId, access);
    return transitFileResponse(Readable.toWeb(createReadStream(path)) as ReadableStream, {
      ...metadata,
      sizeBytes: stats.size,
    });
  }

  async delete(fileId: string, access?: TransitFileAccess): Promise<boolean> {
    assertSafeFileId(fileId);
    const path = join(this.rootDir, fileId);
    if (access !== undefined && !canAccessFile((await this.readMetadata(path, fileId)).scope, access)) return false;
    try {
      await unlink(path);
      await unlink(metadataPath(path)).catch(() => undefined);
      return true;
    } catch {
      return false;
    }
  }

  async deleteByScope(scope: string): Promise<number> {
    let deleted = 0;
    let failure: unknown;
    await mkdir(this.rootDir, { recursive: true });
    const handledSidecars = new Set<string>();
    const orphanSidecars: string[] = [];
    for await (const entry of await opendir(this.rootDir)) {
      if (!entry.isFile()) {
        continue;
      }
      if (entry.name.endsWith(".meta.json")) {
        const fileId = entry.name.slice(0, -".meta.json".length);
        if (isSafeFileId(fileId)) orphanSidecars.push(fileId);
        continue;
      }
      if (!isSafeFileId(entry.name)) {
        continue;
      }
      const path = join(this.rootDir, entry.name);
      try {
        const metadata = await this.readMetadata(path, entry.name);
        if (metadata.scope !== scope) {
          continue;
        }
        // Keep the side-car (the only scope marker) unless the data is gone, so a retry can still find the file.
        const removed = await unlink(path).then(
          () => true,
          (error: unknown) => {
            if (isMissingFile(error)) return false;
            throw error;
          },
        );
        if (removed) deleted += 1;
        handledSidecars.add(entry.name);
        await unlink(metadataPath(path)).catch((error: unknown) => {
          if (!isMissingFile(error)) throw error;
        });
      } catch (error) {
        // Finish the other files first; the failure is still reported, so the caller retries.
        failure ??= error;
      }
    }
    for (const fileId of orphanSidecars) {
      if (handledSidecars.has(fileId)) continue;
      const path = join(this.rootDir, fileId);
      try {
        const metadata = await this.readMetadata(path, fileId);
        if (metadata.scope !== scope) continue;
        if (await stat(path).catch(() => undefined)) continue;
        await unlink(metadataPath(path)).catch((error: unknown) => {
          if (!isMissingFile(error)) throw error;
        });
      } catch (error) {
        failure ??= error;
      }
    }
    if (failure !== undefined) throw failure;
    return deleted;
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
  private async locate(
    fileId: string,
    access?: TransitFileAccess,
  ): Promise<{ path: string; stats: Stats; metadata: StoredDescriptor }> {
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
    assertFileAccess(metadata.scope, access);
    return { path, stats, metadata };
  }

  private async readMetadata(path: string, fileId: string): Promise<StoredDescriptor> {
    const fallback = { name: fileId, mimeType: contentTypeFromFileId(fileId) };
    // Only a missing side-car means a legacy unscoped file; an unreadable one must not grant unscoped access.
    const text = await readFile(metadataPath(path), "utf8").catch((error: unknown) => {
      if (isMissingFile(error)) return undefined;
      throw error;
    });
    // An empty side-car is not a missing one: it falls through to the parse failure below.
    if (text === undefined) {
      return fallback;
    }
    let parsed: Partial<StoredDescriptor>;
    try {
      parsed = JSON.parse(text) as Partial<StoredDescriptor>;
    } catch {
      // Its scope is unknown, so only the operator may see it: no caller's scope matches this marker.
      return { ...fallback, scope: unreadableScope };
    }
    return {
      ...normalizeDescriptor(parsed, fallback),
      ...(typeof parsed.scope === "string" && parsed.scope ? { scope: parsed.scope } : {}),
    };
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

/** Not a valid scope (it contains a space), so it never equals the scope of a caller. */
const unreadableScope = " unreadable";

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}
