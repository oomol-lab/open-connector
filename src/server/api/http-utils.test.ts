import type { Context } from "hono";

import { describe, expect, it } from "vitest";
import { HttpRequestError, readJsonBody } from "./http-utils.ts";

describe("readJsonBody", () => {
  it("decodes a multibyte JSON body split across chunks at the size limit", async () => {
    const encoded = new TextEncoder().encode('{"name":"你好"}');
    const splitAt = encoded.indexOf(0xe5) + 1;
    const request = jsonStreamRequest([encoded.slice(0, splitAt), encoded.slice(splitAt)], true);

    await expect(readJsonBody(contextFor(request), encoded.byteLength)).resolves.toEqual({ name: "你好" });
  });

  it("cancels a chunked request as soon as it exceeds the size limit", async () => {
    const encoder = new TextEncoder();
    let cancelled = false;
    const request = jsonStreamRequest([encoder.encode('{"name":'), encoder.encode('"too large"}')], false, () => {
      cancelled = true;
    });

    await expect(readJsonBody(contextFor(request), 10)).rejects.toMatchObject({
      code: "payload_too_large",
      status: 413,
    } satisfies Partial<HttpRequestError>);
    expect(cancelled).toBe(true);
  });
});

function jsonStreamRequest(chunks: Uint8Array[], close: boolean, onCancel?: () => void): Request {
  return new Request("http://localhost/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        if (close) {
          controller.close();
        }
      },
      cancel() {
        onCancel?.();
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

function contextFor(request: Request): Context {
  return {
    req: {
      header(name: string) {
        return request.headers.get(name) ?? undefined;
      },
      raw: request,
    },
  } as Context;
}
