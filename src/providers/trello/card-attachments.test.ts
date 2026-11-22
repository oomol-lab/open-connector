import type { ExecutionContext, TransitFileWriter } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { executors } from "./executors.ts";

const context: ExecutionContext = {
  getCredential: async () => ({
    authType: "custom_credential",
    values: { apiKey: "key", apiToken: "token" },
    profile: { accountId: "member", displayName: "Member", grantedScopes: [] },
    metadata: {},
  }),
};
const input = { cardId: "card", attachmentId: "attachment" };
const upload = {
  id: "attachment",
  name: "Screenshot",
  fileName: "first draft.png",
  mimeType: "image/png",
  isUpload: true,
};
const link = { id: "link", name: "Reference", url: "https://example.com/reference", isUpload: false, bytes: null };
const bytes = new Uint8Array([0, 128, 255, 10]);

afterEach(() => vi.unstubAllGlobals());

describe("Trello card attachments", () => {
  it("lists files and links and reads one attachment by its card and attachment IDs", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json([upload, link]))
      .mockResolvedValueOnce(Response.json(link));
    vi.stubGlobal("fetch", fetcher);
    await expect(executors["trello.list_card_attachments"]!({ cardId: "card" }, context)).resolves.toMatchObject({
      ok: true,
      output: { attachments: [upload, link] },
    });
    await expect(
      executors["trello.get_card_attachment"]!({ cardId: "card", attachmentId: "link" }, context),
    ).resolves.toMatchObject({ ok: true, output: { attachment: link } });
    expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      "/1/cards/card/attachments",
      "/1/cards/card/attachments/link",
    ]);
  });

  it("downloads the original file bytes using Trello header authentication", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(upload))
      .mockResolvedValueOnce(new Response(bytes));
    vi.stubGlobal("fetch", fetcher);
    const stored = {
      fileId: "transit-file",
      downloadUrl: "/api/files/transit-file",
      name: upload.fileName,
      mimeType: upload.mimeType,
      sizeBytes: bytes.length,
    };
    const create = vi.fn<TransitFileWriter["create"]>().mockResolvedValue(stored);
    const transitFiles = { maxBytes: 1024, create, read: vi.fn(), delete: vi.fn() };
    await expect(
      executors["trello.download_card_attachment"]!(input, { ...context, transitFiles }),
    ).resolves.toMatchObject({ ok: true, output: stored });
    const [url, init] = fetcher.mock.calls[1]!;
    expect(String(url)).toBe("https://api.trello.com/1/cards/card/attachments/attachment/download/first%20draft.png");
    expect(new Headers(init?.headers).get("authorization")).toBe('OAuth oauth_consumer_key="key", oauth_token="token"');
    const [file] = create.mock.calls[0]!;
    expect(file.name).toBe(upload.fileName);
    expect(file.type).toBe(upload.mimeType);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
  });

  it("returns an error for an external link without fetching its URL", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(link));
    vi.stubGlobal("fetch", fetcher);
    const transitFiles = { maxBytes: 1024, create: vi.fn(), read: vi.fn(), delete: vi.fn() };
    await expect(
      executors["trello.download_card_attachment"]!(
        { cardId: "card", attachmentId: "link" },
        { ...context, transitFiles },
      ),
    ).resolves.toMatchObject({ ok: false, error: { message: expect.stringContaining("external link") } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(transitFiles.create).not.toHaveBeenCalled();
  });
});
