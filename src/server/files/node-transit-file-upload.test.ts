import { mkdir, mkdtemp, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupStagedTransitFiles, createNodeTransitFileUpload } from "./node-transit-file-upload.ts";
import { TransitFileService } from "./transit-files.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("createNodeTransitFileUpload", () => {
  it("stages multipart input on disk before creating a local transit file", async () => {
    const { root, service, tempDir } = await createService();
    const upload = createNodeTransitFileUpload({ transitFiles: service, tempDir });

    const result = await upload(fileRequest("hello transit", "report.TXT", "text/plain"));

    expect(result).toMatchObject({ sizeBytes: 13, name: "report.TXT", mimeType: "text/plain" });
    await expect(service.read(result.fileId).then((stored) => stored.file.text())).resolves.toBe("hello transit");
    await expect(readdir(tempDir)).resolves.toEqual([]);
    expect(await readdir(join(root, "files"))).toHaveLength(2);
  });

  it("preserves a Unicode file name", async () => {
    const { service, tempDir } = await createService();
    const upload = createNodeTransitFileUpload({ transitFiles: service, tempDir });

    const result = await upload(fileRequest("invoice", "发票.pdf", "application/pdf"));

    expect(result.name).toBe("发票.pdf");
    await expect(service.read(result.fileId).then((stored) => stored.name)).resolves.toBe("发票.pdf");
  });

  it("rejects an oversized stream and removes the partial temporary file", async () => {
    const { service, tempDir } = await createService({ maxBytes: 4 });
    const upload = createNodeTransitFileUpload({ transitFiles: service, tempDir });

    await expect(upload(fileRequest("12345", "large.bin"))).rejects.toMatchObject({
      status: 413,
      code: "file_too_large",
    });
    await expect(readdir(tempDir)).resolves.toEqual([]);
  });

  it("rejects multipart input without the file field", async () => {
    const { service, tempDir } = await createService();
    const upload = createNodeTransitFileUpload({ transitFiles: service, tempDir });
    const form = new FormData();
    form.set("message", "missing");

    await expect(
      upload(new Request("http://localhost/api/files", { method: "POST", body: form })),
    ).rejects.toMatchObject({
      status: 400,
      code: "invalid_input",
    });
    await expect(readdir(tempDir)).resolves.toEqual([]);
  });

  it("rejects an extra non-file field and removes the staged file", async () => {
    const { service, tempDir } = await createService();
    const createFromPath = vi.spyOn(service, "createFromPath");
    const upload = createNodeTransitFileUpload({ transitFiles: service, tempDir });
    const form = new FormData();
    form.set("file", new File(["payload"], "report.txt"));
    form.set("message", "extra");

    await expect(
      upload(new Request("http://localhost/api/files", { method: "POST", body: form })),
    ).rejects.toMatchObject({
      status: 400,
      code: "invalid_input",
    });
    expect(createFromPath).not.toHaveBeenCalled();
    await expect(readdir(tempDir)).resolves.toEqual([]);
  });

  it("rejects an extra file part and removes the staged file", async () => {
    const { service, tempDir } = await createService();
    const createFromPath = vi.spyOn(service, "createFromPath");
    const upload = createNodeTransitFileUpload({ transitFiles: service, tempDir });
    const form = new FormData();
    form.append("file", new File(["first"], "first.txt"));
    form.append("file", new File(["second"], "second.txt"));

    await expect(
      upload(new Request("http://localhost/api/files", { method: "POST", body: form })),
    ).rejects.toMatchObject({
      status: 400,
      code: "invalid_input",
    });
    expect(createFromPath).not.toHaveBeenCalled();
    await expect(readdir(tempDir)).resolves.toEqual([]);
  });

  it("removes the staged file when backend creation fails", async () => {
    const { service, tempDir } = await createService();
    vi.spyOn(service, "createFromPath").mockRejectedValue(new Error("storage unavailable"));
    const upload = createNodeTransitFileUpload({ transitFiles: service, tempDir });

    await expect(upload(fileRequest("payload", "report.txt"))).rejects.toThrow("storage unavailable");
    await expect(readdir(tempDir)).resolves.toEqual([]);
  });
});

describe("cleanupStagedTransitFiles", () => {
  it("removes only expired managed temporary files", async () => {
    const root = await createRoot();
    const tempDir = join(root, "tmp");
    await mkdir(tempDir);
    const expired = join(tempDir, `${"a".repeat(32)}.tmp`);
    const current = join(tempDir, `${"b".repeat(32)}.tmp`);
    const unrelated = join(tempDir, "keep.txt");
    await Promise.all([writeFile(expired, "old"), writeFile(current, "new"), writeFile(unrelated, "keep")]);
    const old = new Date(Date.now() - 120_000);
    await utimes(expired, old, old);

    await cleanupStagedTransitFiles(tempDir, 60_000);

    await expect(stat(expired)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(current)).resolves.toBeDefined();
    await expect(stat(unrelated)).resolves.toBeDefined();
  });
});

async function createService(options: { maxBytes?: number } = {}): Promise<{
  root: string;
  service: TransitFileService;
  tempDir: string;
}> {
  const root = await createRoot();
  return {
    root,
    service: new TransitFileService({
      rootDir: join(root, "files"),
      publicOrigin: "http://localhost:3000",
      ttlSeconds: 60,
      maxBytes: options.maxBytes ?? 1024 * 1024,
    }),
    tempDir: join(root, "tmp"),
  };
}

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "connect-transit-upload-"));
  roots.push(root);
  return root;
}

function fileRequest(contents: string, name: string, mimeType = "application/octet-stream"): Request {
  const form = new FormData();
  form.set("file", new File([contents], name, { type: mimeType }));
  return new Request("http://localhost/api/files", { method: "POST", body: form });
}
