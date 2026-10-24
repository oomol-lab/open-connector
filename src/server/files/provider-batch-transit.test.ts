import type { ApiKeyProviderContext } from "../../providers/provider-executors.ts";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { runClayBatch } from "../../providers/clay/batch-runtime.ts";
import { TransitFileService } from "./transit-files.ts";
const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function fixture(uploadStatus = 200) {
  const rootDir = await mkdtemp(join(tmpdir(), "provider-batch-transit-"));
  directories.push(rootDir);
  const store = new TransitFileService({
    rootDir,
    publicOrigin: "https://files.example.com",
    maxBytes: 1024,
    ttlSeconds: 3600,
  });
  const read = vi.spyOn(store, "read").mockRejectedValue(new Error("Buffered read is forbidden"));
  const remove = vi.spyOn(store, "delete");
  const calls: string[] = [];
  const fetcher = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const value = String(url);
    calls.push(value);
    if (value === "https://93.184.216.34/input") {
      expect(new Headers(options?.headers).has("clay-api-key")).toBe(false);
      return new Response('{"id":"one","inputs":{}}\n');
    }
    if (value.endsWith("/upload-url"))
      return Response.json({ upload_url: "https://93.184.216.34/upload", file_id: "upstream-file" });
    if (value === "https://93.184.216.34/upload") {
      expect(options?.body).toBeInstanceOf(ReadableStream);
      expect(new Headers(options?.headers).has("clay-api-key")).toBe(false);
      expect(new Headers(options?.headers).get("content-length")).toBe("25");
      expect(await new Response(options?.body).text()).toBe('{"id":"one","inputs":{}}\n');
      return new Response(null, { status: uploadStatus });
    }
    if (value.endsWith("/start")) {
      expect(JSON.parse(String(options?.body))).toEqual({ file_id: "upstream-file" });
      return Response.json({ routine_run_id: "run", status: "in_progress" });
    }
    throw new Error(value);
  });
  const context: ApiKeyProviderContext = { apiKey: "secret", fetcher: fetcher as typeof fetch, transitFiles: store };
  return { context, read, remove, calls };
}
it("streams a staged file into a signed upload and deletes the temporary record", async () => {
  const f = await fixture();
  await expect(
    runClayBatch(f.context, { routine_id: "function:table", fileUrl: "https://93.184.216.34/input" }),
  ).resolves.toMatchObject({ routine_run_id: "run" });
  expect(f.read).not.toHaveBeenCalled();
  expect(f.remove).toHaveBeenCalledOnce();
  expect(f.calls).toHaveLength(4);
});
it("cleans the staged file when the signed upload fails without starting the job", async () => {
  const f = await fixture(500);
  await expect(
    runClayBatch(f.context, { routine_id: "function:table", fileUrl: "https://93.184.216.34/input" }),
  ).rejects.toMatchObject({ status: 500 });
  expect(f.read).not.toHaveBeenCalled();
  expect(f.remove).toHaveBeenCalledOnce();
  expect(f.calls).toHaveLength(3);
});
it("rejects a backend without streaming storage before fetching the source", async () => {
  const fetcher = vi.fn();
  await expect(
    runClayBatch(
      { apiKey: "secret", fetcher: fetcher as typeof fetch },
      { routine_id: "routine", fileUrl: "https://example.com/file" },
    ),
  ).rejects.toMatchObject({ status: 400 });
  expect(fetcher).not.toHaveBeenCalled();
});
it("rejects a private source URL before any network call", async () => {
  const f = await fixture();
  await expect(runClayBatch(f.context, { routine_id: "routine", fileUrl: "http://127.0.0.1/file" })).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  expect(f.remove).not.toHaveBeenCalled();
});
it("cleans staging when upload is cancelled", async () => {
  const f = await fixture();
  const fetcher = f.context.fetcher;
  f.context.fetcher = (async (url, options) => {
    if (String(url).endsWith("/upload")) throw new DOMException("Cancelled", "AbortError");
    return fetcher(url, options);
  }) as typeof fetch;
  await expect(
    runClayBatch(f.context, { routine_id: "routine", fileUrl: "https://93.184.216.34/input" }),
  ).rejects.toMatchObject({ status: 504 });
  expect(f.remove).toHaveBeenCalledOnce();
  expect(f.calls.some((url) => url.endsWith("/start"))).toBe(false);
});
it("enforces the storage byte cap on a source without Content-Length", async () => {
  const f = await fixture();
  const fetcher = f.context.fetcher;
  f.context.fetcher = (async (url, options) =>
    String(url).endsWith("/input") ? new Response("x".repeat(1025)) : fetcher(url, options)) as typeof fetch;
  await expect(
    runClayBatch(f.context, { routine_id: "routine", fileUrl: "https://93.184.216.34/input" }),
  ).rejects.toMatchObject({ status: 413 });
  expect(f.calls).toHaveLength(0);
  expect(f.remove).not.toHaveBeenCalled();
});
