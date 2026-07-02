import type { ITransitFileService, TransitFileRead, TransitFileUpload } from "./transit-file-store.ts";

import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { finished } from "node:stream/promises";
import { contentTypeFromFileId, TransitFileError } from "./transit-file-store.ts";

export interface TransitFileOptions {
  rootDir: string;
  publicOrigin: string;
  ttlSeconds: number;
  maxBytes: number;
}

interface TransitFileMetadata {
  name: string;
  mimeType: string;
}

export class TransitFileService implements ITransitFileService {
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
    const metadata = normalizeMetadata({
      name: file.name || fileId,
      mimeType: file.type || contentTypeFromFileId(fileId),
    });
    await writeFile(metadataPath(path), JSON.stringify(metadata), { flag: "wx" });

    return {
      fileId,
      downloadUrl: `${this.publicOrigin}/api/files/${encodeURIComponent(fileId)}`,
      sizeBytes,
      name: metadata.name,
      mimeType: metadata.mimeType,
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

    const metadata = await this.readMetadata(path, fileId);
    return {
      file: new File([await readFile(path)], metadata.name, { type: metadata.mimeType }),
      sizeBytes: stats.size,
      name: metadata.name,
      mimeType: metadata.mimeType,
    };
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

  private async readMetadata(path: string, fileId: string): Promise<TransitFileMetadata> {
    const fallback = { name: fileId, mimeType: contentTypeFromFileId(fileId) };
    const text = await readFile(metadataPath(path), "utf8").catch(() => undefined);
    if (!text) {
      return fallback;
    }
    try {
      return normalizeMetadata(JSON.parse(text) as Partial<TransitFileMetadata>, fallback);
    } catch {
      return fallback;
    }
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

function assertSafeFileId(fileId: string): void {
  if (!isSafeFileId(fileId)) {
    throw new TransitFileError(404, "file_not_found", "Transit file was not found.");
  }
}

function isSafeFileId(fileId: string): boolean {
  return /^[a-f0-9]{32}(?:\.[a-z0-9]{1,16})?$/.test(fileId);
}

function isManagedFileName(fileName: string): boolean {
  return (
    isSafeFileId(fileName) ||
    /^[a-f0-9]{32}(?:\.[a-z0-9]{1,16})?\.tmp$/.test(fileName) ||
    /^[a-f0-9]{32}(?:\.[a-z0-9]{1,16})?\.meta\.json$/.test(fileName)
  );
}

function safeExtension(name: string): string {
  const extension = extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,16}$/.test(extension) ? extension : "";
}

function metadataPath(path: string): string {
  return `${path}.meta.json`;
}

function normalizeMetadata(
  input: Partial<TransitFileMetadata>,
  fallback: TransitFileMetadata = { name: "file", mimeType: "application/octet-stream" },
): TransitFileMetadata {
  const name = typeof input.name === "string" && input.name.trim() ? input.name.trim() : fallback.name;
  const mimeType =
    typeof input.mimeType === "string" && input.mimeType.trim() ? input.mimeType.trim() : fallback.mimeType;
  return { name, mimeType };
}
