import type { TransitFileStore } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { pixellabImageActionHandlers } from "./runtime-image.ts";

const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngBase64 = Buffer.from(pngBytes).toString("base64");

interface RecordedRequest {
  url: string;
  init?: RequestInit;
}

describe("PixelLab image runtime", () => {
  it("starts Pro image generation with nested reference images and style options", async () => {
    const requests: RecordedRequest[] = [];
    const context = createContext(requests, Response.json({ background_job_id: "job-image-1", status: "processing" }));

    await expect(
      pixellabImageActionHandlers.start_generate_image!(
        {
          description: "a forest ranger",
          imageSize: { width: 64, height: 64 },
          referenceImages: [
            {
              file: { fileId: "subject-image" },
              width: 48,
              height: 64,
              usageDescription: "preserve the green cloak",
            },
          ],
          styleOptions: { colorPalette: true, outline: false },
        },
        context,
      ),
    ).resolves.toEqual({ jobId: "job-image-1", status: "processing" });

    expect(requests[0]?.url).toBe("https://api.pixellab.ai/v2/generate-image-v2");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      description: "a forest ranger",
      image_size: { width: 64, height: 64 },
      reference_images: [
        {
          image: {
            type: "base64",
            base64: `data:image/png;base64,${pngBase64}`,
            format: "png",
          },
          size: { width: 48, height: 64 },
          usage_description: "preserve the green cloak",
        },
      ],
      style_options: { color_palette: true, outline: false },
    });
  });

  it("stores a synchronous pixel-art conversion result", async () => {
    const context = createContext(
      [],
      Response.json({
        image: { type: "base64", base64: pngBase64, format: "png" },
        usage: { type: "usd", usd: 0.02 },
      }),
    );

    await expect(
      pixellabImageActionHandlers.convert_to_pixel_art!(
        {
          image: { fileId: "source-image" },
          imageSize: { width: 256, height: 256 },
          outputSize: { width: 64, height: 64 },
        },
        context,
      ),
    ).resolves.toEqual({
      image: {
        fileId: "output-1",
        downloadUrl: "/api/files/output-1",
        sizeBytes: pngBytes.byteLength,
        name: "pixellab-pixel-art-001.png",
        mimeType: "image/png",
      },
      usage: { type: "usd", usd: 0.02 },
    });
  });

  it("requires the input that matches the selected edit method", async () => {
    const context = createContext([], Response.json({ background_job_id: "unused" }));

    await expect(
      pixellabImageActionHandlers.start_edit_images!(
        {
          method: "edit_with_text",
          editImages: [{ file: { fileId: "source-image" }, width: 64, height: 64 }],
          imageSize: { width: 64, height: 64 },
        },
        context,
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "description is required when method is edit_with_text.",
    });
  });

  it("rejects Pixen dimensions whose total area exceeds the model limit", async () => {
    const context = createContext([], Response.json({ image: {} }));

    await expect(
      pixellabImageActionHandlers.create_pixen_image!(
        {
          description: "large character",
          imageSize: { width: 768, height: 512 },
        },
        context,
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "imageSize area cannot exceed 512 by 512 pixels.",
    });
  });

  it("normalizes both credit and subscription balances", async () => {
    const context = createContext(
      [],
      Response.json({
        credits: { type: "usd", usd: 12.5 },
        subscription: {
          type: "generations",
          status: "active",
          plan: "Pixel Artisan",
          generations: 450,
          total: 2000,
        },
      }),
    );

    await expect(pixellabImageActionHandlers.get_balance!({}, context)).resolves.toEqual({
      creditsUsd: 12.5,
      subscriptionStatus: "active",
      subscriptionPlan: "Pixel Artisan",
      generationsRemaining: 450,
      generationsTotal: 2000,
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
