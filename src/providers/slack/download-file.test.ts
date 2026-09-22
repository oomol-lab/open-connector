import type { ExecutionContext, ExecutionResult, TransitFileUpload } from "../../core/types.ts";
import type { MockInstance } from "vitest";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeAction } from "../../core/execution.ts";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { TransitFileService } from "../../server/files/transit-files.ts";
import { provider as botProvider } from "../slackbot/definition.ts";
import { executors as botExecutors } from "../slackbot/executors.ts";
import { provider } from "./definition.ts";
import { executors } from "./executors.ts";

const privateUrl = "https://files.slack.com/files-pri/T123-F123/download/report.pdf";
const metadata = { id: "F123", name: "report.pdf", mimetype: "application/pdf", url_private_download: privateUrl };
let rootDir: string;
let store: TransitFileService;
let create: MockInstance<TransitFileService["create"]>;

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), "slack-download-"));
  store = new TransitFileService({ rootDir, publicOrigin: "https://connector.example", ttlSeconds: 60, maxBytes: 8 });
  create = vi.spyOn(store, "create");
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setDefaultGuardedFetchDnsLookup(null);
  await rm(rootDir, { recursive: true, force: true });
});

describe("Slack private file downloads", () => {
  it.each([false, true])("stores the bytes with the selected connection (bot: %s)", async (bot) => {
    const bytes = new Uint8Array([0, 255, 128, 42]);
    const requests = stubResponses([
      fileInfo(),
      new Response(bytes, { headers: { "content-type": "application/pdf" } }),
    ]);

    const result = await download({ bot });

    expect(result).toMatchObject({
      ok: true,
      output: { fileId: "F123", file: { name: "report.pdf", mimeType: "application/pdf", sizeBytes: 4 } },
    });
    const file = downloadedFile(result);
    const stored = await store.read(file.fileId);
    expect(new Uint8Array(await stored.file.arrayBuffer())).toEqual(bytes);
    expect(file.downloadUrl).toContain("https://connector.example/");
    expect(requests.map((request) => request.url)).toEqual(["https://slack.com/api/files.info?file=F123", privateUrl]);
    expect(requests.map((request) => request.headers.get("authorization"))).toEqual([
      "Bearer selected-token",
      "Bearer selected-token",
    ]);
    expect(JSON.stringify(result)).not.toContain("selected-token");
    expect(JSON.stringify(result)).not.toContain("files.slack.com");
  });

  it("falls back to url_private and preserves legitimate HTML files", async () => {
    stubResponses([
      fileInfo({ url_private_download: undefined, url_private: privateUrl, mimetype: "text/html", name: "page.html" }),
      new Response("<html>", { headers: { "content-type": "text/html; charset=utf-8" } }),
    ]);
    const result = await download();
    expect(result).toMatchObject({ ok: true, output: { file: { name: "page.html", sizeBytes: 6 } } });
  });

  it("keeps auth on same-origin redirects and removes it on a CDN redirect", async () => {
    const requests = stubResponses([
      fileInfo(),
      new Response(null, { status: 302, headers: { location: "/next" } }),
      new Response(null, { status: 302, headers: { location: "https://cdn.example/report.pdf" } }),
      new Response("file"),
    ]);
    expect(await download()).toMatchObject({ ok: true });
    expect(requests.map((request) => request.headers.get("authorization"))).toEqual([
      "Bearer selected-token",
      "Bearer selected-token",
      "Bearer selected-token",
      null,
    ]);
  });

  it("falls back when Slack returns empty filename and MIME metadata", async () => {
    stubResponses([fileInfo({ name: "", mimetype: "" }), new Response("file", { headers: { "content-type": "" } })]);

    expect(await download()).toMatchObject({
      ok: true,
      output: { fileId: "F123", file: { name: "F123", mimeType: "application/octet-stream" } },
    });
  });

  it.each([
    "https://evil.example/file",
    "https://files.slack.com.evil.example/file",
    "http://files.slack.com/file",
    "https://files.slack.com:444/file",
    "https://user:password@files.slack.com/file",
    "http://169.254.169.254/file",
  ])("rejects untrusted metadata URL %s before sending credentials", async (url) => {
    const requests = stubResponses([fileInfo({ url_private_download: url })]);
    expect(await download()).toMatchObject({ ok: false, error: { code: "provider_error" } });
    expect(requests).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("blocks a redirect to cloud metadata", async () => {
    const requests = stubResponses([
      fileInfo(),
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }),
    ]);
    expect(await download()).toMatchObject({ ok: false });
    expect(requests).toHaveLength(2);
    expect(create).not.toHaveBeenCalled();
  });

  it("validates DNS for the file host", async () => {
    setDefaultGuardedFetchDnsLookup(async (host) => [
      { address: host === "files.slack.com" ? "127.0.0.1" : "93.184.216.34", family: 4 },
    ]);
    const requests = stubResponses([fileInfo()]);
    expect(await download()).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("must not resolve") },
    });
    expect(requests).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([{ is_external: true }, { url_private_download: undefined }])(
    "rejects unavailable or external content: %j",
    async (file) => {
      const requests = stubResponses([fileInfo(file)]);
      expect(await download()).toMatchObject({
        ok: false,
        error: { code: "invalid_input", message: "This Slack file has no downloadable Slack-hosted content" },
      });
      expect(requests).toHaveLength(1);
      expect(create).not.toHaveBeenCalled();
    },
  );

  it.each(["file_not_found", "missing_scope", "invalid_auth", "ratelimited"])(
    "preserves Slack metadata errors: %s",
    async (error) => {
      const requests = stubResponses([Response.json({ ok: false, error })]);
      expect(await download()).toMatchObject({ ok: false, error: { message: error } });
      expect(requests).toHaveLength(1);
      expect(create).not.toHaveBeenCalled();
    },
  );

  it.each([401, 403, 404, 429, 500])("preserves download HTTP %s and discards the error body", async (status) => {
    const response = new Response("private upstream error details", { status });
    stubResponses([fileInfo(), response]);
    expect(await download()).toMatchObject({
      ok: false,
      error: { message: `Slack file download failed with HTTP ${status}`, details: { status } },
    });
    expect(response.bodyUsed).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects HTML sign-in responses", async () => {
    stubResponses([fileInfo(), new Response("<html>sign in</html>", { headers: { "content-type": "text/html" } })]);
    expect(await download()).toMatchObject({
      ok: false,
      error: { message: "Slack returned an HTML page instead of the requested file" },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects oversized metadata before downloading", async () => {
    const requests = stubResponses([fileInfo({ size: 9 })]);
    expect(await download()).toMatchObject({ ok: false, error: { details: { status: 413 } } });
    expect(requests).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([true, false])("enforces the response byte limit (content-length: %s)", async (withLength) => {
    const response = new Response("123456789", { headers: withLength ? { "content-length": "9" } : {} });
    stubResponses([fileInfo({ size: 1 }), response]);
    expect(await download()).toMatchObject({ ok: false, error: { details: { status: 413 } } });
    expect(response.bodyUsed).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it("requires transit storage before network access", async () => {
    const requests = stubResponses([]);
    expect(await download({ noStorage: true })).toMatchObject({
      ok: false,
      error: { message: "Slack download_file requires transit file storage" },
    });
    expect(requests).toHaveLength(0);
  });

  it.each([false, true])("cancels a pending body read (timeout: %s)", async (timeout) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let downloading!: () => void;
    const started = new Promise<void>((resolve) => {
      downloading = resolve;
    });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("https://slack.com/api/")) return fileInfo();
      const body = new ReadableStream<Uint8Array>({
        start(stream) {
          init!.signal!.addEventListener("abort", () => stream.error(init!.signal!.reason), { once: true });
        },
      });
      downloading();
      return new Response(body);
    });
    const result = download({ signal: controller.signal });
    await started;
    if (timeout) await vi.advanceTimersByTimeAsync(30_000);
    else controller.abort();
    expect(await result).toMatchObject({ ok: false, error: { details: { status: 504 } } });
    expect(create).not.toHaveBeenCalled();
  });
});

function fileInfo(overrides: Record<string, unknown> = {}): Response {
  return Response.json({ ok: true, file: { ...metadata, ...overrides } });
}

function stubResponses(responses: Response[]): Request[] {
  const requests: Request[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    const response = responses.shift();
    if (!response) throw new Error("Unexpected request");
    return response;
  });
  return requests;
}

interface DownloadOptions {
  bot?: boolean;
  noStorage?: boolean;
  signal?: AbortSignal;
}

function download(options: DownloadOptions = {}): Promise<ExecutionResult> {
  const selectedProvider = options.bot ? botProvider : provider;
  const executor = options.bot ? botExecutors["slackbot.download_file"] : executors["slack.download_file"];
  const context: ExecutionContext = {
    getCredential: async (service) => {
      expect(service).toBe(selectedProvider.service);
      return {
        authType: "oauth2",
        accessToken: "selected-token",
        tokenType: "Bearer",
        profile: { accountId: "U123", displayName: "Selected Slack connection", grantedScopes: ["files:read"] },
        metadata: { rawTokenType: options.bot ? "bot" : "user" },
      };
    },
    transitFiles: options.noStorage ? undefined : store,
    signal: options.signal,
  };
  const action = selectedProvider.actions.find((item) => item.name === "download_file")!;
  return executeAction(action, executor, { fileId: "F123" }, context);
}

function downloadedFile(result: ExecutionResult): TransitFileUpload {
  if (!result.ok) throw new Error(result.error?.message);
  return (result.output as { file: TransitFileUpload }).file;
}
