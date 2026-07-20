import type { TransitFileStore } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { pixellabCharacterActionHandlers } from "./runtime-character.ts";
import { pixellabImageExtraActionHandlers } from "./runtime-image-extra.ts";
import { pixellabObjectActionHandlers } from "./runtime-object.ts";
import { pixellabUiActionHandlers } from "./runtime-ui.ts";

const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngBase64 = Buffer.from(pngBytes).toString("base64");

interface RecordedRequest {
  url: string;
  init?: RequestInit;
}

describe("PixelLab expanded runtime", () => {
  it("maps image rotation input and stores the synchronous result", async () => {
    const requests: RecordedRequest[] = [];
    const context = createContext(
      requests,
      Response.json({
        image: { type: "base64", base64: pngBase64, format: "png" },
        usage: { type: "generations", generations: 2 },
      }),
    );

    await expect(
      pixellabImageExtraActionHandlers.rotate_image!(
        {
          fromImage: { fileId: "source-image" },
          imageSize: { width: 64, height: 64 },
          fromDirection: "south",
          toDirection: "east",
        },
        context,
      ),
    ).resolves.toEqual({
      image: {
        fileId: "output-1",
        downloadUrl: "/api/files/output-1",
        sizeBytes: pngBytes.byteLength,
        name: "pixellab-rotated-001.png",
        mimeType: "image/png",
      },
      usage: { type: "generations", generations: 2 },
    });

    expect(requests[0]?.url).toBe("https://api.pixellab.ai/v2/rotate");
    expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({
      image_size: { width: 64, height: 64 },
      from_direction: "south",
      to_direction: "east",
      from_image: { type: "base64", format: "png" },
    });
  });

  it("starts styled rotation generation without a reference image", async () => {
    const requests: RecordedRequest[] = [];
    const context = createContext(
      requests,
      Response.json({ background_job_id: "job-rotations", status: "processing" }),
    );

    await expect(
      pixellabImageExtraActionHandlers.start_generate_rotations_pro!(
        {
          method: "create_with_style",
          description: "a knight in armor",
          imageSize: { width: 64, height: 64 },
        },
        context,
      ),
    ).resolves.toEqual({ jobId: "job-rotations", status: "processing" });

    expect(requests[0]?.url).toBe("https://api.pixellab.ai/v2/generate-8-rotations-v2");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      method: "create_with_style",
      image_size: { width: 64, height: 64 },
      description: "a knight in armor",
    });
  });

  it("requires a description for styled rotation generation", async () => {
    const context = createContext([], Response.json({ background_job_id: "unused" }));

    await expect(
      pixellabImageExtraActionHandlers.start_generate_rotations_pro!(
        {
          method: "create_with_style",
          imageSize: { width: 64, height: 64 },
        },
        context,
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "description is required when method is create_with_style.",
    });
  });

  it("normalizes UI asset creation and listing", async () => {
    const createContextValue = createContext(
      [],
      Response.json({ background_job_id: "job-ui", ui_asset_id: "ui-1", status: "processing" }),
    );
    await expect(
      pixellabUiActionHandlers.start_create_ui_asset!({ description: "stone inventory panel" }, createContextValue),
    ).resolves.toEqual({ jobId: "job-ui", status: "processing", uiAssetId: "ui-1" });

    const listContext = createContext(
      [],
      Response.json({
        ui_assets: [
          {
            id: "ui-1",
            name: "Inventory",
            prompt: "stone inventory panel",
            size: { width: 256, height: 256 },
            image_url: "https://cdn.pixellab.ai/ui-1.png",
            status: "completed",
            created_at: "2026-07-17T01:02:03Z",
          },
        ],
        total: 1,
      }),
    );
    await expect(pixellabUiActionHandlers.list_ui_assets!({ limit: 10, offset: 2 }, listContext)).resolves.toEqual({
      assets: [
        {
          id: "ui-1",
          name: "Inventory",
          prompt: "stone inventory panel",
          size: { width: 256, height: 256 },
          imageUrl: "https://cdn.pixellab.ai/ui-1.png",
          status: "completed",
          createdAt: "2026-07-17T01:02:03Z",
        },
      ],
      total: 1,
    });
  });

  it("normalizes character jobs and writes ZIP exports to bounded transit storage", async () => {
    const jobContext = createContext(
      [],
      Response.json({
        background_job_id: "job-character",
        character_id: "character-1",
        status: "queued",
      }),
    );
    await expect(
      pixellabCharacterActionHandlers.start_create_character_v3!({ description: "forest guardian" }, jobContext),
    ).resolves.toEqual({ jobId: "job-character", status: "queued", characterId: "character-1" });

    const zipBytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04]);
    const zipContext = createContext([], new Response(zipBytes, { headers: { "content-type": "application/zip" } }));
    await expect(
      pixellabCharacterActionHandlers.download_character_zip!({ characterId: "character-1" }, zipContext),
    ).resolves.toEqual({
      file: {
        fileId: "output-1",
        downloadUrl: "/api/files/output-1",
        sizeBytes: zipBytes.byteLength,
        name: "pixellab-character-character-1.zip",
        mimeType: "application/zip",
      },
    });
  });

  it("maps multi-direction object animation submissions", async () => {
    const requests: RecordedRequest[] = [];
    const context = createContext(
      requests,
      Response.json({
        animation_group_id: "0b72774e-5fc0-4da7-93e0-63a43347babc",
        mode: "v3",
        frame_count: 8,
        display_name: "Walk",
        description: "walking steadily",
        object_id: "object-1",
        submissions: [
          { direction: "south", status: "queued", background_job_id: "job-south" },
          { direction: "east", status: "rate_limited" },
        ],
      }),
    );

    await expect(
      pixellabObjectActionHandlers.start_animate_object!(
        {
          objectId: "object-1",
          animationDescription: "walking steadily",
          directions: ["south", "east"],
          frameCount: 8,
        },
        context,
      ),
    ).resolves.toMatchObject({
      animationGroupId: "0b72774e-5fc0-4da7-93e0-63a43347babc",
      objectId: "object-1",
      submissions: [
        { direction: "south", status: "queued", jobId: "job-south" },
        { direction: "east", status: "rate_limited" },
      ],
    });

    expect(requests[0]?.url).toBe("https://api.pixellab.ai/v2/objects/object-1/animations");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      mode: "v3",
      animation_description: "walking steadily",
      directions: ["south", "east"],
      frame_count: 8,
    });
  });

  it("enforces mutually exclusive eight-direction object image sources", async () => {
    const context = createContext([], Response.json({}));
    await expect(
      pixellabObjectActionHandlers.start_create_object_8_directions!(
        {
          description: "wooden barrel",
          referenceImage: { fileId: "source-image" },
          styleImage: { fileId: "source-image" },
        },
        context,
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "Only one of size, referenceImage, and styleImage may be provided.",
    });
  });
});

function createContext(requests: RecordedRequest[], response: Response): ApiKeyProviderContext {
  return {
    apiKey: "test-token",
    fetcher: vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requests.push({ url: input instanceof Request ? input.url : String(input), init });
      return response;
    }) as unknown as typeof fetch,
    transitFiles: createTransitFileStore(),
  };
}

function createTransitFileStore(): TransitFileStore {
  let outputCount = 0;
  return {
    maxBytes: 1024 * 1024,
    async read(fileId) {
      return {
        file: new File([pngBytes], `${fileId}.png`, { type: "image/png" }),
        sizeBytes: pngBytes.byteLength,
        name: `${fileId}.png`,
        mimeType: "image/png",
      };
    },
    async create(file) {
      outputCount += 1;
      return {
        fileId: `output-${outputCount}`,
        downloadUrl: `/api/files/output-${outputCount}`,
        sizeBytes: file.size,
        name: file.name,
        mimeType: file.type,
      };
    },
    async delete() {
      return true;
    },
  };
}
