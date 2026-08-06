import type { MuxContext } from "./runtime.ts";

import { describe, expect, it, vi } from "vitest";
import { muxActionHandlers } from "./runtime.ts";

function context(fetcher: typeof fetch): MuxContext {
  return {
    tokenId: "token-id",
    tokenSecret: "token-secret",
    fetcher,
  };
}

function upload(id = "upload-123"): Record<string, unknown> {
  return {
    id,
    cors_origin: "https://example.com",
    status: "waiting",
    timeout: 3600,
    url: "https://storage.googleapis.com/mux-upload",
  };
}

describe("Mux extended video actions", () => {
  it("updates asset metadata and preserves an empty passthrough value", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ data: { id: "asset-123", status: "ready" } }));

    await muxActionHandlers.update_asset!(
      {
        assetId: "asset/123",
        passthrough: "",
        meta: { title: "Updated title", externalId: "record-7" },
      },
      context(fetcher),
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe("https://api.mux.com/video/v1/assets/asset%2F123");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({
      passthrough: "",
      meta: { title: "Updated title", external_id: "record-7" },
    });
    expect(init?.headers).toMatchObject({
      authorization: `Basic ${Buffer.from("token-id:token-secret").toString("base64")}`,
    });
  });

  it("maps Direct Upload create, list, retrieve, and cancel endpoints", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const pathname = new URL(url).pathname;
      if (pathname.endsWith("/uploads") && init?.method === "POST") {
        return Response.json({ data: upload() });
      }
      if (pathname.endsWith("/uploads") && (!init?.method || init.method === "GET")) {
        return Response.json({ data: [upload()], page: 2, limit: 10, total: 11 });
      }
      if (url.endsWith("/uploads/upload-123")) {
        return Response.json({ data: { ...upload(), status: "asset_created", asset_id: "asset-123" } });
      }
      return Response.json({ data: { ...upload(), status: "cancelled" } });
    });
    const muxContext = context(fetcher);

    const created = await muxActionHandlers.create_direct_upload!(
      {
        corsOrigin: "https://example.com",
        newAssetSettings: {
          playbackPolicies: ["public"],
          videoQuality: "plus",
          meta: { title: "Upload" },
        },
        test: true,
        timeout: 120,
      },
      muxContext,
    );
    expect(created).toEqual({ upload: upload() });
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({
      cors_origin: "https://example.com",
      new_asset_settings: {
        playback_policies: ["public"],
        video_quality: "plus",
        meta: { title: "Upload" },
      },
      test: true,
      timeout: 120,
    });

    await muxActionHandlers.list_direct_uploads!({ limit: 10, page: 2 }, muxContext);
    await muxActionHandlers.get_direct_upload!({ uploadId: "upload-123" }, muxContext);
    await muxActionHandlers.cancel_direct_upload!({ uploadId: "upload-123" }, muxContext);

    expect(fetcher.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url)}`)).toEqual([
      "POST https://api.mux.com/video/v1/uploads",
      "GET https://api.mux.com/video/v1/uploads?limit=10&page=2",
      "GET https://api.mux.com/video/v1/uploads/upload-123",
      "PUT https://api.mux.com/video/v1/uploads/upload-123/cancel",
    ]);
  });

  it("resolves a playback ID to its asset or live stream", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        data: { id: "playback-123", object: { id: "live-123", type: "live_stream" }, policy: "public" },
      }),
    );

    const result = await muxActionHandlers.get_playback_id!({ playbackId: "playback/123" }, context(fetcher));

    expect(result).toEqual({
      playbackId: {
        id: "playback-123",
        object: { id: "live-123", type: "live_stream" },
        policy: "public",
      },
    });
    expect(String(fetcher.mock.calls[0]![0])).toBe("https://api.mux.com/video/v1/playback-ids/playback%2F123");
  });
});
