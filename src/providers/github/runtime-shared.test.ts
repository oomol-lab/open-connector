import { describe, expect, it, vi } from "vitest";
import { githubRequestTextTail } from "./runtime-shared.ts";

describe("GitHub text responses", () => {
  it("returns complete text below the tail limit", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => chunkedTextResponse(["hello ", "world"]));

    const result = await githubRequestTextTail({
      path: "/repos/oomol/test/actions/jobs/1/logs",
      accessToken: "secret",
      fetcher,
      maxBytes: 32,
    });

    expect(result).toEqual({
      text: "hello world",
      sizeBytes: 11,
      returnedBytes: 11,
      truncated: false,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.com/repos/oomol/test/actions/jobs/1/logs",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer secret" }),
      }),
    );
  });

  it("retains the trailing bytes across response chunks", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => chunkedTextResponse(["abc", "def", "ghi"]));

    const result = await githubRequestTextTail({
      path: "/logs",
      accessToken: "secret",
      fetcher,
      maxBytes: 5,
    });

    expect(result).toEqual({
      text: "efghi",
      sizeBytes: 9,
      returnedBytes: 5,
      truncated: true,
    });
  });

  it("drops an incomplete UTF-8 character at the beginning of a truncated tail", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => chunkedTextResponse(["a😀bc"]));

    const result = await githubRequestTextTail({
      path: "/logs",
      accessToken: "secret",
      fetcher,
      maxBytes: 5,
    });

    expect(result).toEqual({
      text: "bc",
      sizeBytes: 7,
      returnedBytes: 2,
      truncated: true,
    });
  });

  it("normalizes GitHub errors instead of returning their body as logs", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ message: "Not Found" }, { status: 404 }));

    await expect(
      githubRequestTextTail({
        path: "/logs",
        accessToken: "secret",
        fetcher,
        maxBytes: 5,
      }),
    ).rejects.toMatchObject({ status: 404, message: "Not Found" });
  });
});

function chunkedTextResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/plain" } },
  );
}
