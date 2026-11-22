import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { executors, proxy } from "./executors.ts";

const credential: ResolvedCredential = {
  authType: "custom_credential",
  values: { apiKey: "stored-key", apiToken: "stored-token" },
  profile: { accountId: "member-1", displayName: "Test member", grantedScopes: ["read"] },
  metadata: {},
};
const context: ExecutionContext = { getCredential: async () => credential };
const authorization = 'OAuth oauth_consumer_key="stored-key", oauth_token="stored-token"';
const originalEndpoint = "/cards/card-1/attachments/attachment-1/download/image.png";
const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x80, 0xc3, 0x28]);

afterEach(() => vi.unstubAllGlobals());

describe("Trello card members", () => {
  it("requests and returns the assigned member IDs when reading a card", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ idMembers: ["member-1", "member-2"] }));
    vi.stubGlobal("fetch", fetcher);

    const result = await executors["trello.get_card"]!({ cardId: "card-1" }, context);
    expect(new URL(String(fetcher.mock.calls[0]![0])).searchParams.get("fields")?.split(",")).toContain("idMembers");
    expect(result).toEqual({ ok: true, output: { card: { memberIds: ["member-1", "member-2"] } } });
  });

  it("returns the assigned member IDs for each card on a board, including empty lists", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json([{ idMembers: ["member-1"] }, { idMembers: [] }]));
    vi.stubGlobal("fetch", fetcher);

    const result = await executors["trello.list_board_cards"]!({ boardId: "board-1" }, context);
    expect(new URL(String(fetcher.mock.calls[0]![0])).searchParams.get("fields")?.split(",")).toContain("idMembers");
    expect(result).toEqual({ ok: true, output: { cards: [{ memberIds: ["member-1"] }, { memberIds: [] }] } });
  });

  it("omits member IDs when the caller requests only the card name", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ name: "Buy supplies" }));
    vi.stubGlobal("fetch", fetcher);

    const result = await executors["trello.get_card"]!({ cardId: "card-1", fields: ["name"] }, context);
    expect(new URL(String(fetcher.mock.calls[0]![0])).searchParams.get("fields")).toBe("name");
    expect(result).toEqual({ ok: true, output: { card: { name: "Buy supplies" } } });
  });
});

describe("Trello proxy authentication", () => {
  it.each([
    [originalEndpoint, "image/png"],
    ["/cards/card-1/attachments/attachment-1/previews/preview-1/download/image.webp", "image/webp"],
  ])(
    "authenticates attachment downloads with stored credentials and preserves bytes: %s",
    async (endpoint, mimeType) => {
      const fetcher = vi.fn<typeof fetch>(
        async () => new Response(imageBytes, { headers: { "content-type": mimeType } }),
      );
      vi.stubGlobal("fetch", fetcher);

      const result = await proxy(
        {
          method: "GET",
          endpoint: `${endpoint}?key=endpoint-key&token=endpoint-token`,
          query: { key: "caller-key", token: "caller-token" },
          headers: { Authorization: "Bearer caller-token", accept: mimeType },
        },
        context,
      );

      expect(fetcher).toHaveBeenCalledTimes(1);
      const [url, init] = fetcher.mock.calls[0]!;
      expect(String(url)).toBe(`https://api.trello.com/1${endpoint}`);
      expect(new Headers(init?.headers).get("authorization")).toBe(authorization);
      expect(new Headers(init?.headers).get("accept")).toBe(mimeType);
      expect(result).toEqual({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": mimeType },
          bodyEncoding: "base64",
          data: Buffer.from(imageBytes).toString("base64"),
        },
      });
    },
  );

  it("keeps ordinary metadata reads and non-authentication query parameters working", async () => {
    const attachment = { id: "attachment-1", fileName: "image.png", isUpload: true };
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(attachment));
    vi.stubGlobal("fetch", fetcher);

    const result = await proxy(
      { method: "GET", endpoint: "/cards/card-1/attachments/attachment-1", query: { fields: "all" } },
      context,
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe("https://api.trello.com/1/cards/card-1/attachments/attachment-1?fields=all");
    expect(new Headers(init?.headers).get("authorization")).toBe(authorization);
    expect(result).toMatchObject({ ok: true, response: { status: 200, data: attachment } });
  });

  it("percent-encodes credential values in the OAuth header", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ id: "member-1" }));
    vi.stubGlobal("fetch", fetcher);
    const encodedContext: ExecutionContext = {
      getCredential: async () => ({ ...credential, values: { apiKey: 'key"&=', apiToken: "token +/!'()*é" } }),
    };

    await proxy({ method: "GET", endpoint: "/members/me" }, encodedContext);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new Headers(fetcher.mock.calls[0]![1]?.headers).get("authorization")).toBe(
      'OAuth oauth_consumer_key="key%22%26%3D", oauth_token="token%20%2B%2F%21%27%28%29%2A%C3%A9"',
    );
  });

  it("retains authentication on same-origin redirects and strips it before a file-host redirect", async () => {
    const requests: Array<{ url: string; headers: Headers }> = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      requests.push({ url: String(input), headers: new Headers(init?.headers) });
      if (requests.length === 1)
        return new Response(null, {
          status: 302,
          headers: { location: `${originalEndpoint.replace("/cards/", "/1/cards/")}?download=1` },
        });
      if (requests.length === 2)
        return new Response(null, {
          status: 302,
          headers: { location: "https://attachments.example/image.png?signature=temporary" },
        });
      return new Response(imageBytes, { headers: { "content-type": "image/png" } });
    });
    vi.stubGlobal("fetch", fetcher);

    const result = await proxy(
      { method: "GET", endpoint: originalEndpoint, headers: { accept: "image/png" } },
      context,
    );

    expect(requests).toHaveLength(3);
    expect(requests[0]!.headers.get("authorization")).toBe(authorization);
    expect(requests[1]!.headers.get("authorization")).toBe(authorization);
    expect(requests[2]!.headers.get("authorization")).toBeNull();
    expect(requests[2]!.headers.get("accept")).toBe("image/png");
    expect(requests[2]!.url).toBe("https://attachments.example/image.png?signature=temporary");
    expect(result).toMatchObject({
      ok: true,
      response: { bodyEncoding: "base64", data: Buffer.from(imageBytes).toString("base64") },
    });
  });

  it.each([
    [400, "invalid id", "invalid_input"],
    [404, "not found", "invalid_input"],
    [401, "invalid token", "authorization_failed"],
    [401, "invalid key", "authorization_failed"],
  ])("maps an upstream %i with %s to %s", async (status, message, code) => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response(message, { status })),
    );
    await expect(proxy({ method: "GET", endpoint: originalEndpoint }, context)).resolves.toMatchObject({
      ok: false,
      error: { code, details: { status } },
    });
  });

  it("preserves ambiguous upstream failures without requesting reauthorization", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response("unauthorized permission requested", { status: 401 })),
    );

    await expect(proxy({ method: "GET", endpoint: originalEndpoint }, context)).resolves.toMatchObject({
      ok: false,
      error: { code: "provider_error", message: "unauthorized permission requested", details: { status: 401 } },
    });
  });
});
