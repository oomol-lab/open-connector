import { describe, expect, it } from "vitest";
import { validateActionInput } from "../../core/validation.ts";
import { minimaxActions } from "./actions.ts";
import { credentialValidators, minimaxActionHandlers } from "./executors.ts";

const textToVideo = minimaxActions.find((action) => action.name === "text_to_video")!;
const imageToVideo = minimaxActions.find((action) => action.name === "image_to_video")!;
const downloadVideo = minimaxActions.find((action) => action.name === "download_video")!;

describe("MiniMax video actions", () => {
  it("rejects models that do not support the selected generation mode", () => {
    expect(
      validateActionInput(textToVideo, {
        model: "I2V-01",
        prompt: "A calm lake at sunrise.",
      }).valid,
    ).toBe(false);
    expect(
      validateActionInput(textToVideo, {
        model: "MiniMax-Hailuo-2.3-Fast",
        prompt: "A calm lake at sunrise.",
      }).valid,
    ).toBe(false);
    expect(
      validateActionInput(imageToVideo, {
        model: "T2V-01",
        first_frame_image: "https://example.com/frame.png",
      }).valid,
    ).toBe(false);
  });

  it("rejects unsupported duration and resolution values", () => {
    expect(
      validateActionInput(textToVideo, {
        model: "MiniMax-Hailuo-2.3",
        prompt: "A calm lake at sunrise.",
        duration: 7,
      }).valid,
    ).toBe(false);
    expect(
      validateActionInput(textToVideo, {
        model: "MiniMax-Hailuo-2.3",
        prompt: "A calm lake at sunrise.",
        resolution: "banana",
      }).valid,
    ).toBe(false);
    expect(
      validateActionInput(imageToVideo, {
        model: "MiniMax-Hailuo-02",
        first_frame_image: "https://example.com/frame.png",
        duration: 10,
        resolution: "512P",
      }).valid,
    ).toBe(true);
  });

  it("declares retrieved file ids as strings", () => {
    expect(downloadVideo.outputSchema).toMatchObject({
      properties: {
        file: {
          properties: {
            file_id: { type: "string" },
          },
        },
      },
    });
  });

  it("maps successful HTTP responses with MiniMax error status to failures", async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          base_resp: {
            status_code: 1004,
            status_msg: "invalid api key",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    await expect(
      minimaxActionHandlers.text_to_video(
        {
          model: "MiniMax-Hailuo-2.3",
          prompt: "A calm lake at sunrise.",
        },
        {
          apiKey: "invalid",
          apiBaseUrl: "https://api.minimax.io",
          fetcher,
        },
      ),
    ).rejects.toMatchObject({
      status: 401,
      message: "invalid api key",
    });
  });

  it("validates China-region credentials against the China API host", async () => {
    const urls: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ data: [{ id: "MiniMax-M3" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const result = await credentialValidators.apiKey!(
      {
        apiKey: "china-key",
        values: { apiKey: "china-key", region: "china" },
      },
      { fetcher },
    );

    expect(urls).toEqual(["https://api.minimaxi.com/v1/models"]);
    expect(result?.metadata).toMatchObject({
      apiBaseUrl: "https://api.minimaxi.com",
    });
  });

  it("rejects unsupported credential regions", async () => {
    const fetcher: typeof fetch = async () => {
      throw new Error("unexpected request");
    };

    await expect(
      credentialValidators.apiKey!(
        {
          apiKey: "test-key",
          values: { apiKey: "test-key", region: "europe" },
        },
        { fetcher },
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "minimax region must be global or china",
    });
  });
});
