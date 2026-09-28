import * as fs from "node:fs";
import { mkdtemp, readdir, rm, stat, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransitFileError } from "./transit-file-store.ts";
import { TransitFileService } from "./transit-files.ts";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, createWriteStream: vi.fn(actual.createWriteStream) };
});

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("TransitFileService", () => {
  it("rejects a locked source without opening a destination", async () => {
    const { rootDir, service } = await createService();
    const body = new ReadableStream<Uint8Array>();
    const reader = body.getReader();
    try {
      await expect(
        service.createFromStream({ body, name: "locked.bin", mimeType: "application/octet-stream" }),
      ).rejects.toMatchObject({ code: "ERR_INVALID_STATE" });
      expect(fs.createWriteStream).not.toHaveBeenCalled();
      expect(await readdir(rootDir)).toEqual([]);
    } finally {
      reader.releaseLock();
    }
  });

  it("waits for close after a destination error before removing the temporary file", async () => {
    const { rootDir, service } = await createService();
    const opened = Promise.withResolvers<fs.WriteStream>();
    const closing = Promise.withResolvers<void>();
    const releaseClose = Promise.withResolvers<void>();
    const { createWriteStream } = await vi.importActual<typeof fs>("node:fs");
    vi.mocked(fs.createWriteStream).mockImplementationOnce((path) => {
      const destination = createWriteStream(path, {
        flags: "wx",
        fs: {
          open: fs.open,
          close(fd, callback) {
            closing.resolve();
            void releaseClose.promise.then(() => fs.close(fd, callback));
          },
          write: fs.write,
          writev: fs.writev,
        },
      });
      destination.once("open", () => opened.resolve(destination));
      return destination;
    });
    const body = new ReadableStream<Uint8Array>();
    const failure = new Error("Destination write failed");
    let settled = false;
    const pending = service
      .createFromStream({ body, name: "partial.bin", mimeType: "application/octet-stream" })
      .catch((error: unknown) => {
        settled = true;
        return error;
      });
    try {
      const destination = await opened.promise;
      destination.emit("error", failure);
      await closing.promise;
      await setImmediate();
      expect(settled).toBe(false);
      expect((await readdir(rootDir)).some((name) => name.endsWith(".tmp"))).toBe(true);
    } finally {
      releaseClose.resolve();
    }
    expect(await pending).toBe(failure);
    expect(await readdir(rootDir)).toEqual([]);
  });

  it("waits for a pending file open to close before cleaning up a failed source", async () => {
    const { rootDir, service } = await createService();
    const releaseOpen = Promise.withResolvers<void>();
    const opened = Promise.withResolvers<fs.WriteStream>();
    const { createWriteStream } = await vi.importActual<typeof fs>("node:fs");
    vi.mocked(fs.createWriteStream).mockImplementationOnce((path) => {
      const destination = createWriteStream(path, {
        flags: "wx",
        fs: {
          open(path, flags, mode, callback) {
            opened.resolve(destination);
            void releaseOpen.promise.then(() => fs.open(path, flags, mode, callback));
          },
          close: fs.close,
          write: fs.write,
          writev: fs.writev,
        },
      });
      return destination;
    });
    let source: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        source = controller;
      },
    });
    const failure = new Error("Malformed upstream payload");
    let settled = false;
    const pending = service
      .createFromStream({ body, name: "partial.bin", mimeType: "application/octet-stream" })
      .catch((error: unknown) => {
        settled = true;
        return error;
      });
    try {
      const destination = await opened.promise;
      source!.error(failure);
      await expect.poll(() => destination.destroyed).toBe(true);
      expect(settled).toBe(false);
    } finally {
      releaseOpen.resolve();
    }
    expect(await pending).toBe(failure);
    expect(await readdir(rootDir)).toEqual([]);
  });

  it("cancels a stalled source and removes the partial write when its signal aborts", async () => {
    const { rootDir, service } = await createService();
    const abort = new AbortController();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(64 * 1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    const pending = service.createFromStream({
      body,
      name: "partial.bin",
      mimeType: "application/octet-stream",
      signal: abort.signal,
    });
    await expect
      .poll(async () => {
        const entries = await readdir(rootDir).catch(() => []);
        const name = entries.find((entry) => entry.endsWith(".tmp"));
        return name ? (await stat(join(rootDir, name))).size : 0;
      })
      .toBeGreaterThan(0);
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toBe(true);
    expect(await readdir(rootDir)).toEqual([]);
  });

  it("enforces the streaming size limit itself and cancels unread input", async () => {
    const { rootDir, service } = await createService();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(64 * 1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(
      service.createFromStream({ body, name: "large.bin", mimeType: "application/octet-stream" }),
    ).rejects.toMatchObject({ status: 413 });
    expect(cancelled).toBe(true);
    expect(await readdir(rootDir)).toEqual([]);
  });

  it("cancels the input if storage fails before the write starts", async () => {
    const { rootDir, service } = await createService();
    await writeFile(rootDir, "not a directory");
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    await expect(service.createFromStream({ body, name: "file", mimeType: "text/plain" })).rejects.toThrow();
    expect(cancelled).toBe(true);
  });

  it("treats an expired file as not found and removes it with its side-car", async () => {
    const { rootDir, service } = await createService();
    const read = await service.create(new File(["expired read"], "read.pdf", { type: "application/pdf" }));
    const response = await service.create(new File(["expired response"], "response.txt", { type: "text/plain" }));
    await expire(rootDir, read.fileId, response.fileId);

    // One call per file id: the expiry branch unlinks before it throws, so a second read of the same id
    // would land in the missing-file branch instead. The class matters because connect-server maps the
    // response by `instanceof TransitFileError`.
    const expired = await service.read(read.fileId).catch((error: unknown) => error);
    expect(expired).toBeInstanceOf(TransitFileError);
    expect(expired).toMatchObject({ status: 404, code: "file_not_found" });
    await expect(service.response(response.fileId)).rejects.toMatchObject({ status: 404, code: "file_not_found" });

    // Both removal paths must agree: no orphan .meta.json is left behind.
    await expect(readdir(rootDir)).resolves.toEqual([]);
  });

  it("sweeps expired files and their side-cars while keeping live uploads", async () => {
    const { rootDir, service } = await createService();
    const expired = await service.create(new File(["old"], "old.txt", { type: "text/plain" }));
    const live = await service.create(new File(["new"], "new.txt", { type: "text/plain" }));
    await expire(rootDir, expired.fileId);

    await service.cleanupExpired();

    await expect(readdir(rootDir).then((names) => names.sort())).resolves.toEqual([
      live.fileId,
      `${live.fileId}.meta.json`,
    ]);
    await expect(service.read(live.fileId).then((stored) => stored.file.text())).resolves.toBe("new");
  });

  it("falls back to the file id and the extension mime type when the side-car is missing or malformed", async () => {
    const { rootDir, service } = await createService();
    const missing = await service.create(new File(["no side-car"], "invoice.pdf", { type: "application/pdf" }));
    const malformed = await service.create(new File(["broken side-car"], "notes.md", { type: "text/markdown" }));
    await unlink(join(rootDir, `${missing.fileId}.meta.json`));
    await writeFile(join(rootDir, `${malformed.fileId}.meta.json`), "{");

    await expect(service.read(missing.fileId)).resolves.toMatchObject({
      name: missing.fileId,
      mimeType: "application/pdf",
      sizeBytes: 11,
    });
    await expect(service.read(malformed.fileId)).resolves.toMatchObject({
      name: malformed.fileId,
      mimeType: "text/markdown",
    });
  });

  it("deletes a stored file with its side-car and reports an unknown id as no deletion", async () => {
    const { rootDir, service } = await createService();
    const upload = await service.create(new File(["bye"], "bye.txt", { type: "text/plain" }));

    await expect(service.delete(upload.fileId)).resolves.toBe(true);
    await expect(readdir(rootDir)).resolves.toEqual([]);
    await expect(service.delete(upload.fileId)).resolves.toBe(false);
    await expect(service.delete(`${"a".repeat(32)}.txt`)).resolves.toBe(false);
  });
});

async function createService(): Promise<{ rootDir: string; service: TransitFileService }> {
  const root = await mkdtemp(join(tmpdir(), "connect-transit-files-"));
  roots.push(root);
  const rootDir = join(root, "files");
  return {
    rootDir,
    service: new TransitFileService({
      rootDir,
      publicOrigin: "http://localhost:3000",
      ttlSeconds: 60,
      maxBytes: 1024 * 1024,
    }),
  };
}

/** Backdate the stored bytes past the TTL, the way a file that has been sitting on disk ages out. */
async function expire(rootDir: string, ...fileIds: string[]): Promise<void> {
  const old = new Date(Date.now() - 120_000);
  await Promise.all(fileIds.map((fileId) => utimes(join(rootDir, fileId), old, old)));
}
