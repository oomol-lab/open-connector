import { describe, expect, it, vi } from "vitest";
import { leonardoAiActionHandlers } from "./runtime.ts";

const parameters = {
  guidances: { image_reference: [{ image: { type: "URL", url: "https://example.com/photo.png" } }] },
  format: "png",
};

describe("Leonardo background removal", () => {
  it("uses the synchronous model with private ephemeral defaults", async () => {
    const response = {
      id: "generation-1",
      results: [{ url: "https://example.com/result.png", contentType: "image/png" }],
      cost: { amount: "0.1047", unit: "DOLLARS" },
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
    const output = await leonardoAiActionHandlers.remove_background({ parameters }, { apiKey: "test-key", fetcher });
    expect(output).toEqual(response);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe("https://cloud.leonardo.ai/api/rest/v2/generationssync");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
    expect(JSON.parse(String(init?.body))).toEqual({ model: "remove-bg", parameters, ephemeral: true, public: false });
  });

  it("preserves Base64 results and explicit storage options", async () => {
    const response = { id: "generation-2", results: [{ dataB64: "aW1hZ2U=", contentType: "image/png" }] };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
    const input = {
      parameters: { guidances: { image_reference: [{ image: { type: "BASE64", data: "aW1hZ2U=" } }] } },
      ephemeral: false,
      public: true,
      base64: true,
    };
    expect(await leonardoAiActionHandlers.remove_background(input, { apiKey: "test", fetcher })).toEqual(response);
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({ model: "remove-bg", ...input });
  });

  it("returns moderation results even when every image is blocked", async () => {
    const response = { id: "generation-3", results: [], blockedCount: 1 };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
    expect(await leonardoAiActionHandlers.remove_background({ parameters }, { apiKey: "test", fetcher })).toEqual(
      response,
    );
  });

  it.each(["http://example.com/image.png", "https://127.0.0.1/image.png", "https://169.254.169.254/image.png"])(
    "rejects unsafe image URL %s before egress",
    async (url) => {
      const fetcher = vi.fn<typeof fetch>();
      const input = { parameters: { guidances: { image_reference: [{ image: { type: "URL", url } }] } } };
      await expect(
        leonardoAiActionHandlers.remove_background(input, { apiKey: "test", fetcher }),
      ).rejects.toMatchObject({ status: 400 });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("validates replacement background URLs too", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      leonardoAiActionHandlers.remove_background(
        {
          parameters: {
            ...parameters,
            guidances: {
              ...parameters.guidances,
              background_image_reference: [{ image: { type: "URL", url: "https://localhost/bg.png" } }],
            },
          },
        },
        { apiKey: "test", fetcher },
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects a malformed success envelope", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "generation-4" }));
    await expect(
      leonardoAiActionHandlers.remove_background({ parameters }, { apiKey: "test", fetcher }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("preserves upstream authentication failures", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: "Invalid key" }, { status: 401 }));
    await expect(
      leonardoAiActionHandlers.remove_background({ parameters }, { apiKey: "test", fetcher }),
    ).rejects.toMatchObject({ status: 401, message: "Invalid key" });
  });
});
