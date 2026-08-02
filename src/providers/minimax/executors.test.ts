import { describe, expect, it, vi } from "vitest";
import { validateActionInput } from "../../core/validation.ts";
import { minimaxActions } from "./actions.ts";
import { minimaxActionHandlers } from "./executors.ts";

const apiBaseUrl = "https://api.minimax.io";

function createContext(fetcher: typeof fetch) {
  return {
    apiKey: "test-key",
    apiBaseUrl,
    fetcher,
  };
}

function jsonFetcher(payload: Record<string, unknown> = {}): typeof fetch {
  return vi.fn(async () => Response.json(payload)) as typeof fetch;
}

function requestBody(fetcher: typeof fetch): unknown {
  const init = vi.mocked(fetcher).mock.calls[0]![1] as RequestInit;
  return JSON.parse(String(init.body));
}

describe("MiniMax H3 video generation", () => {
  it("creates a v2 video generation task with multimodal content", async () => {
    const fetcher = jsonFetcher({ task_id: "task-1" });

    await minimaxActionHandlers.create_video_generation_v2(
      {
        model: " MiniMax-H3 ",
        content: [
          { type: "text", text: "city skyline" },
          { type: "image_url", image_url: { url: "https://example.com/frame.png" }, role: "first_frame" },
          { type: "audio_url", audio_url: { url: "https://example.com/ref.mp3" }, role: "reference_audio" },
        ],
        resolution: " 2K ",
        duration: 12,
        ratio: " 16:9 ",
        callback_url: " https://example.com/callback ",
      },
      createContext(fetcher),
    );

    expect(fetcher).toHaveBeenCalledWith(
      `${apiBaseUrl}/v2/video_generation`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(requestBody(fetcher)).toMatchObject({
      model: "MiniMax-H3",
      resolution: "2K",
      duration: 12,
      ratio: "16:9",
      callback_url: "https://example.com/callback",
      content: [
        { type: "text", text: "city skyline" },
        { type: "image_url", image_url: { url: "https://example.com/frame.png" }, role: "first_frame" },
        { type: "audio_url", audio_url: { url: "https://example.com/ref.mp3" }, role: "reference_audio" },
      ],
    });
  });

  it("validates the v2 media shape and required text prompt", () => {
    const action = minimaxActions.find((action) => action.id === "minimax.create_video_generation_v2")!;
    const input = {
      model: "MiniMax-H3",
      content: [
        { type: "text", text: "city skyline" },
        { type: "image_url", image_url: { url: "https://example.com/frame.png" }, role: "first_frame" },
      ],
      resolution: "768P",
      duration: 5,
    };

    expect(validateActionInput(action, input).valid).toBe(true);
    expect(
      validateActionInput(action, {
        ...input,
        content: [{ type: "image_url", image_url: { url: "https://example.com/frame.png" } }],
      }).valid,
    ).toBe(false);
    expect(
      validateActionInput(action, {
        ...input,
        content: [
          { type: "text", text: "city skyline" },
          { type: "video_url", video_url: "https://example.com/ref.mp4", role: "reference_video" },
        ],
      }).valid,
    ).toBe(false);
    expect(
      validateActionInput(action, {
        ...input,
        content: [
          { type: "text", text: "city skyline" },
          {
            type: "image_url",
            image_url: { url: "https://example.com/frame.png" },
            role: "reference_video",
          },
        ],
      }).valid,
    ).toBe(false);
  });

  it("validates v2 list status filters", () => {
    const action = minimaxActions.find((action) => action.id === "minimax.list_video_generation_v2")!;

    expect(validateActionInput(action, { filter: { status: "succeeded" } }).valid).toBe(true);
    expect(validateActionInput(action, { filter: { status: "Success" } }).valid).toBe(false);
  });

  it("routes v2 video query, list, and delete operations", async () => {
    const fetcher = jsonFetcher({ task_id: "task-1" });
    const context = createContext(fetcher);

    await minimaxActionHandlers.query_video_generation_v2({ task_id: "task/1" }, context);
    await minimaxActionHandlers.list_video_generation_v2(
      {
        page_num: 2,
        page_size: 10,
        filter: { status: "succeeded", task_ids: ["task-1", "task-2"], model: "MiniMax-H3", task_type: "text" },
      },
      context,
    );
    await minimaxActionHandlers.delete_video_generation_v2({ task_id: "task/1" }, context);

    expect(vi.mocked(fetcher).mock.calls.map(([url, init]) => [String(url), init?.method])).toEqual([
      [`${apiBaseUrl}/v2/query/video_generation/task%2F1`, "GET"],
      [
        `${apiBaseUrl}/v2/query/video_generation?page_num=2&page_size=10&filter.status=succeeded&filter.model=MiniMax-H3&filter.task_type=text&filter.task_ids=task-1&filter.task_ids=task-2`,
        "GET",
      ],
      [`${apiBaseUrl}/v2/video_generation/task%2F1`, "DELETE"],
    ]);
  });
});
