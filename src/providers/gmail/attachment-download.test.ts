import type { ExecutionContext, ExecutionResult, ResolvedCredential, TransitFileUpload } from "../../core/types.ts";
import type { ServerResponse } from "node:http";

import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeAction } from "../../core/execution.ts";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { TransitFileService } from "../../server/files/transit-files.ts";
import { provider } from "./definition.ts";
import { executors, proxy } from "./executors.ts";

const nativeFetch = globalThis.fetch;
const cleanups: Array<() => Promise<void>> = [];
const block = Buffer.from(Array.from({ length: 48 * 1024 }, (_, index) => index % 256));
const encodedBlock = block.toString("base64url");
const credential: ResolvedCredential = {
  authType: "oauth2",
  accessToken: "gmail-stream-token",
  tokenType: "Bearer",
  profile: { accountId: "gmail:test", displayName: "Gmail test", grantedScopes: [] },
  metadata: {},
};

afterEach(async () => {
  vi.unstubAllGlobals();
  setDefaultGuardedFetchDnsLookup(undefined);
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("Gmail attachment HTTP and transit file boundary", () => {
  it("writes before upstream EOF and downloads an intact file whose JSON exceeds the proxy cap", async () => {
    const blocks = 384;
    const size = blocks * block.length + 2;
    expect(blocks * encodedBlock.length).toBeGreaterThan(20 * 1024 * 1024);
    const release = Promise.withResolvers<void>();
    const fixture = await createFixture(async (response) => {
      await pipeline(
        Readable.from(
          (async function* () {
            yield '{"data":"';
            for (let index = 0; index < blocks; index++) {
              // Split inside base64 quanta, with neither the encoded JSON nor decoded file materialized.
              yield encodedBlock.slice(0, 1);
              yield encodedBlock.slice(1, 8197);
              yield encodedBlock.slice(8197);
              if (index === 1) await release.promise;
            }
            yield `-_8","size":${size}}`;
          })(),
        ),
        response,
      );
    });
    const pending = download(fixture.context);
    try {
      await expect.poll(() => partialBytes(fixture.root)).toBeGreaterThan(0);
      expect((await readdir(fixture.root)).every((name) => name.endsWith(".tmp"))).toBe(true);
    } finally {
      release.resolve();
    }
    const result = await pending;
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error?.message);
    const file = result.output as TransitFileUpload;
    expect(file).toMatchObject({ sizeBytes: size, name: "report.bin", mimeType: "application/octet-stream" });
    expect(fixture.requests).toEqual([
      {
        url: "https://gmail.googleapis.com/gmail/v1/users/me/messages/message/attachments/attachment?fields=data,size",
        authorization: "Bearer gmail-stream-token",
      },
    ]);
    const response = await nativeFetch(file.downloadUrl);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe(String(size));
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="report.bin"');
    const actual = createHash("sha256");
    let received = 0;
    for await (const chunk of response.body!) {
      actual.update(chunk);
      received += chunk.length;
    }
    const expected = createHash("sha256");
    for (let index = 0; index < blocks; index++) expected.update(block);
    expected.update(Buffer.from([251, 255]));
    expect(received).toBe(size);
    expect(actual.digest("hex")).toBe(expected.digest("hex"));
    expect((await readdir(fixture.root)).sort()).toEqual([file.fileId, `${file.fileId}.meta.json`]);
  }, 20_000);

  it("keeps the ordinary Gmail JSON proxy capped at 20 MiB", async () => {
    const fixture = await createFixture(async (response) => {
      await pipeline(
        Readable.from(
          (async function* () {
            yield '{"data":"';
            for (let index = 0; index < 330; index++) yield encodedBlock;
            yield `","size":${330 * block.length}}`;
          })(),
        ),
        response,
      );
    });
    const result = await proxy(
      { method: "GET", endpoint: "/users/me/messages/message/attachments/attachment" },
      fixture.context,
    );
    expect(result).toMatchObject({ ok: false, error: { details: { status: 413 } } });
    expect(await readdir(fixture.root)).toEqual([]);
  });

  it.each(["truncated", "size mismatch", "invalid base64", "duplicate data"])(
    "removes partial data after %s",
    async (failure) => {
      const fixture = await createFixture((response) => {
        const endings: Record<string, string> = {
          "truncated": "",
          "size mismatch": '","size":1}',
          "invalid base64": '!","size":49152}',
          "duplicate data": '","data":"","size":49152}',
        };
        response.end(`{"data":"${encodedBlock}${endings[failure]}`);
      });
      expect(await download(fixture.context)).toMatchObject({ ok: false, error: { details: { status: 502 } } });
      expect(await readdir(fixture.root)).toEqual([]);
    },
  );

  it.each(["disconnect", "cancel"])("cleans up a stalled transfer on %s and closes upstream", async (failure) => {
    let upstream: ServerResponse | undefined;
    let closed = false;
    const fixture = await createFixture((response) => {
      upstream = response;
      response.on("close", () => {
        closed = true;
      });
      response.write(`{"data":"${encodedBlock}`);
    });
    const abort = new AbortController();
    const pending = download({ ...fixture.context, signal: abort.signal });
    await expect.poll(() => partialBytes(fixture.root)).toBeGreaterThan(0);
    if (failure === "cancel") abort.abort();
    else upstream!.destroy();
    expect(await pending).toMatchObject({ ok: false });
    await expect.poll(() => closed).toBe(true);
    expect(await readdir(fixture.root)).toEqual([]);
  });

  it("enforces the decoded storage limit and cancels upstream", async () => {
    let closed = false;
    const fixture = await createFixture((response) => {
      response.on("close", () => {
        closed = true;
      });
      response.write(`{"data":"${encodedBlock}`);
    }, 1024);
    expect(await download(fixture.context)).toMatchObject({ ok: false, error: { details: { status: 413 } } });
    await expect.poll(() => closed).toBe(true);
    expect(await readdir(fixture.root)).toEqual([]);
  });

  it.each(["rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded", "quotaExceeded"])(
    "classifies attachment quota reason %s as rate limited",
    async (reason) => {
      const fixture = await createFixture((response) => {
        response.statusCode = 403;
        response.end(JSON.stringify({ error: { message: "Quota exceeded", errors: [{ reason }] } }));
      });
      expect(await download(fixture.context)).toMatchObject({
        ok: false,
        error: { code: "rate_limited", message: "Quota exceeded", details: { status: 403 } },
      });
      expect(await readdir(fixture.root)).toEqual([]);
    },
  );

  it("preserves upstream errors and refuses a store without streaming support before fetching", async () => {
    const fixture = await createFixture((response) => {
      response.statusCode = 403;
      response.end(JSON.stringify({ error: { message: "Permission denied" } }));
    });
    expect(await download(fixture.context)).toMatchObject({
      ok: false,
      error: { code: "authorization_failed", message: "Permission denied", details: { status: 403 } },
    });
    expect(await readdir(fixture.root)).toEqual([]);
    fixture.requests.length = 0;
    const transitFiles = {
      maxBytes: fixture.service.maxBytes,
      create: fixture.service.create.bind(fixture.service),
      read: fixture.service.read.bind(fixture.service),
      delete: fixture.service.delete.bind(fixture.service),
    };
    expect(await download({ ...fixture.context, transitFiles })).toMatchObject({
      ok: false,
      error: { details: { status: 400 } },
    });
    expect(fixture.requests).toEqual([]);
  });
});

function download(context: ExecutionContext): Promise<ExecutionResult> {
  return executeAction(
    provider.actions.find((action) => action.name === "download_attachment")!,
    executors["gmail.download_attachment"],
    { messageId: "message", attachmentId: "attachment", fileName: "report.bin" },
    context,
  );
}

async function partialBytes(root: string): Promise<number> {
  const names = await readdir(root);
  const name = names.find((entry) => entry.endsWith(".tmp"));
  return name ? (await stat(join(root, name))).size : 0;
}

async function createFixture(
  upstream: (response: ServerResponse) => void | Promise<void>,
  maxBytes = 32 * 1024 * 1024,
) {
  const root = await mkdtemp(join(tmpdir(), "gmail-stream-"));
  let service: TransitFileService;
  const server = createServer(async (request, response) => {
    try {
      if (request.url === "/upstream") {
        response.setHeader("content-type", "application/json");
        await upstream(response);
      } else {
        const file = await service.response(request.url!.split("/").at(-1)!);
        file.headers.forEach((value, key) => response.setHeader(key, value));
        await pipeline(Readable.from(file.body!), response);
      }
    } catch {
      response.destroy();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP listener");
  const origin = `http://127.0.0.1:${address.port}`;
  service = new TransitFileService({ rootDir: root, publicOrigin: origin, ttlSeconds: 60, maxBytes });
  cleanups.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });
  const requests: Array<{ url: string; authorization: string | null }> = [];
  setDefaultGuardedFetchDnsLookup(null);
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization") });
    return nativeFetch(`${origin}/upstream`, init);
  });
  const context: ExecutionContext = { getCredential: async () => credential, transitFiles: service };
  return { root, service, context, requests };
}
