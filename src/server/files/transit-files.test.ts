import { mkdtemp, readdir, rm, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TransitFileError } from "./transit-file-store.ts";
import { TransitFileService } from "./transit-files.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("TransitFileService", () => {
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
