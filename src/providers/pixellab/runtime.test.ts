import type { TransitFileStore } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { describe, expect, it, vi } from "vitest";
import { pixellabActionHandlers } from "./runtime.ts";

const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngBase64 = Buffer.from(pngBytes).toString("base64");

interface RecordedRequest {
  url: string;
  init?: RequestInit;
}

describe("PixelLab runtime", () => {
  it("starts a text animation with transit image data and PixelLab field names", async () => {
    const requests: RecordedRequest[] = [];
    const context = createContext(
      requests,
      Response.json({
        background_job_id: "job-1",
        status: "processing",
        enhanced_prompt: "walking forward with a steady stride",
      }),
    );

    await expect(
      pixellabActionHandlers.start_text_animation!(
        {
          firstFrame: { fileId: "source-image" },
          action: "walking forward",
          frameCount: 8,
          noBackground: true,
          enhancePrompt: true,
        },
        context,
      ),
    ).resolves.toEqual({
      jobId: "job-1",
      status: "processing",
      enhancedPrompt: "walking forward with a steady stride",
    });

    expect(requests[0]?.url).toBe("https://api.pixellab.ai/v2/animate-with-text-v3");
    expect(requests[0]?.init?.method).toBe("POST");
    expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe("Bearer test-token");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      first_frame: {
        type: "base64",
        base64: `data:image/png;base64,${pngBase64}`,
        format: "png",
      },
      action: "walking forward",
      frame_count: 8,
      no_background: true,
      enhance_prompt: true,
    });
  });

  it("stores completed background-job images as transit files", async () => {
    const requests: RecordedRequest[] = [];
    const context = createContext(
      requests,
      Response.json({
        id: "job-2",
        status: "completed",
        created_at: "2026-07-17T01:02:03Z",
        last_response: {
          images: [{ type: "base64", base64: `data:image/png;base64,${pngBase64}`, format: "png" }],
        },
        usage: { type: "generations", generations: 1 },
      }),
    );

    await expect(pixellabActionHandlers.get_background_job!({ jobId: "job-2" }, context)).resolves.toEqual({
      jobId: "job-2",
      status: "completed",
      createdAt: "2026-07-17T01:02:03Z",
      images: [
        {
          fileId: "output-1",
          downloadUrl: "/api/files/output-1",
          sizeBytes: pngBytes.byteLength,
          name: "pixellab-image-001.png",
          mimeType: "image/png",
        },
      ],
      imageCount: 1,
      usage: { type: "generations", generations: 1 },
    });
  });

  it("maps PixelLab validation details and overload responses to stable errors", async () => {
    const context = createContext(
      [],
      Response.json(
        { detail: [{ msg: "frame_count must be even" }, { msg: "image is too large" }] },
        { status: 529, statusText: "" },
      ),
    );

    await expect(
      pixellabActionHandlers.start_text_animation!(
        { firstFrame: { fileId: "source-image" }, action: "walking", frameCount: 8 },
        context,
      ),
    ).rejects.toMatchObject({
      status: 429,
      message: "frame_count must be even; image is too large",
    });
  });

  it("normalizes a singular background-job image", async () => {
    const context = createContext(
      [],
      Response.json({
        id: "job-single",
        status: "completed",
        created_at: "2026-07-17T01:02:03Z",
        last_response: {
          image: { type: "base64", base64: pngBase64, format: "png" },
        },
      }),
    );

    await expect(pixellabActionHandlers.get_background_job!({ jobId: "job-single" }, context)).resolves.toMatchObject({
      jobId: "job-single",
      status: "completed",
      imageCount: 1,
      images: [{ name: "pixellab-image-001.png", mimeType: "image/png" }],
    });
  });

  it("keeps resource metadata but removes base64 images from a background-job result", async () => {
    const context = createContext(
      [],
      Response.json({
        id: "job-resource",
        status: "completed",
        created_at: "2026-07-17T01:02:03Z",
        last_response: {
          image: { type: "base64", base64: pngBase64, format: "png" },
          object_id: "object-1",
          selected_indices: [0, 2],
        },
      }),
    );

    await expect(pixellabActionHandlers.get_background_job!({ jobId: "job-resource" }, context)).resolves.toMatchObject(
      {
        result: { object_id: "object-1", selected_indices: [0, 2] },
        images: [{ name: "pixellab-image-001.png" }],
      },
    );
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
      if (fileId !== "source-image") {
        throw new Error(`Unknown test file: ${fileId}`);
      }
      return {
        file: new File([pngBytes], "character.png", { type: "image/png" }),
        sizeBytes: pngBytes.byteLength,
        name: "character.png",
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
