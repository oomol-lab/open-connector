import type { ProviderFetch } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { getProviderActionHandler } from "../provider-runtime.ts";
import { googleChatActionHandlers } from "./executors.ts";

const accessToken = "test-token";

describe("Google Chat resource names", () => {
  const fetcher: ProviderFetch = async () => {
    throw new Error("invalid resource names must not be fetched");
  };
  const context = { accessToken, fetcher };

  it.each([
    ["a single-dot space ID", "get_space", { space: "." }],
    ["a double-dot space ID", "list_messages", { space: "spaces/.." }],
    ["a single-dot bare message ID", "get_message", { space: "A", message: "." }],
    ["a double-dot space ID in a message name", "get_message", { message: "spaces/../messages/B" }],
    ["a double-dot message ID in a message name", "get_message", { message: "spaces/A/messages/.." }],
  ])("rejects %s", async (_description, action, input) => {
    await expect(getProviderActionHandler(googleChatActionHandlers, action)!(input, context)).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("Google Chat message normalization", () => {
  it("preserves message content whitespace", async () => {
    const fetcher: ProviderFetch = async () =>
      new Response(
        JSON.stringify({
          messages: [
            {
              name: "spaces/A/messages/B.B",
              text: "  keep me  ",
              formattedText: "\n*keep me*\n",
              argumentText: "  keep me  ",
            },
          ],
        }),
      );

    await expect(googleChatActionHandlers.list_messages({ space: "A" }, { accessToken, fetcher })).resolves.toEqual({
      messages: [
        {
          name: "spaces/A/messages/B.B",
          messageId: "B.B",
          spaceName: "spaces/A",
          text: "  keep me  ",
          formattedText: "\n*keep me*\n",
          argumentText: "  keep me  ",
        },
      ],
      nextPageToken: null,
    });
  });
});
