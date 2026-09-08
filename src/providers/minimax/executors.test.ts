import { describe, expect, it, vi } from "vitest";
import { minimaxActionHandlers } from "./executors.ts";

describe("MiniMax H3 watermark forwarding", () => {
  for (const watermark of [true, false, undefined]) {
    it(`preserves the watermark option ${watermark}`, async () => {
      const input = {
        model: "MiniMax-H3",
        content: [{ type: "text", text: "Ocean at sunrise" }],
        resolution: "768P",
        duration: 4,
        ratio: "16:9",
        aigc_watermark: watermark,
      };
      const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        expect(body.aigc_watermark).toBe(watermark);
        expect(Object.hasOwn(body, "aigc_watermark")).toBe(watermark !== undefined);
        return Response.json({ task_id: "task-1" });
      });
      const result = await minimaxActionHandlers.create_video_generation_v2(input, {
        apiKey: "test-key",
        apiBaseUrl: "https://api.minimax.io",
        fetcher: fetcher as typeof fetch,
      });
      expect(result).toEqual({ task_id: "task-1" });
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  }
});
