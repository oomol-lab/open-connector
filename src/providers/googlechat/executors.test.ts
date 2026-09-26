import type { ProviderFetch } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { getProviderActionHandler } from "../provider-runtime.ts";
import { googleChatActions } from "./actions.ts";
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

describe("Google Chat create_message", () => {
  const createdMessage = { name: "spaces/A/messages/M", text: "hi", thread: { name: "spaces/A/threads/T" } };

  /** Capture the outgoing request so assertions can inspect URL, method, and body. */
  function recordingFetcher(payload: unknown = createdMessage) {
    const sent: { url: URL; init: RequestInit }[] = [];
    const fetcher: ProviderFetch = async (url, init) => {
      sent.push({ url: new URL(String(url)), init: init ?? {} });
      return new Response(JSON.stringify(payload));
    };

    return { sent, fetcher };
  }

  function sentBody(init: RequestInit): Record<string, unknown> {
    return JSON.parse(String(init.body)) as Record<string, unknown>;
  }

  it("posts the text to the space messages collection", async () => {
    const { sent, fetcher } = recordingFetcher();

    await googleChatActionHandlers.create_message({ space: "A", text: "hi" }, { accessToken, fetcher });

    expect(sent).toHaveLength(1);
    expect(sent[0].url.origin + sent[0].url.pathname).toBe("https://chat.googleapis.com/v1/spaces/A/messages");
    expect(sent[0].init.method).toBe("POST");
    expect(sentBody(sent[0].init)).toEqual({ text: "hi" });
  });

  it("defaults to REPLY_MESSAGE_OR_FAIL when a thread is given without a reply option", async () => {
    const { sent, fetcher } = recordingFetcher();

    await googleChatActionHandlers.create_message(
      { space: "A", text: "hi", thread: "spaces/A/threads/T" },
      { accessToken, fetcher },
    );

    expect(sent[0].url.searchParams.get("messageReplyOption")).toBe("REPLY_MESSAGE_OR_FAIL");
    expect(sentBody(sent[0].init)).toEqual({ text: "hi", thread: { name: "spaces/A/threads/T" } });
  });

  it("keeps an explicit reply option instead of overriding it", async () => {
    const { sent, fetcher } = recordingFetcher();

    await googleChatActionHandlers.create_message(
      {
        space: "A",
        text: "hi",
        thread: "spaces/A/threads/T",
        messageReplyOption: "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD",
      },
      { accessToken, fetcher },
    );

    expect(sent[0].url.searchParams.get("messageReplyOption")).toBe("REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD");
  });

  it("omits the reply option entirely when no thread is given", async () => {
    const { sent, fetcher } = recordingFetcher();

    await googleChatActionHandlers.create_message({ space: "A", text: "hi" }, { accessToken, fetcher });

    expect(sent[0].url.searchParams.has("messageReplyOption")).toBe(false);
  });

  it("declares the thread dependency in the input schema", () => {
    const createMessage = googleChatActions.find((candidate) => candidate.name === "create_message");

    // The executor enforces this too, but only the schema is validated before the
    // handler runs, and only the schema is visible to callers inspecting the action.
    expect(createMessage?.inputSchema).toMatchObject({
      dependentRequired: { messageReplyOption: ["thread"] },
    });
  });

  it("rejects a reply option without a thread", async () => {
    const fetcher: ProviderFetch = async () => {
      throw new Error("must not be fetched");
    };

    await expect(
      googleChatActionHandlers.create_message(
        { space: "A", text: "hi", messageReplyOption: "REPLY_MESSAGE_OR_FAIL" },
        { accessToken, fetcher },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("passes the idempotency key through as requestId", async () => {
    const { sent, fetcher } = recordingFetcher();

    await googleChatActionHandlers.create_message(
      { space: "A", text: "hi", requestId: "client-key-1" },
      { accessToken, fetcher },
    );

    expect(sent[0].url.searchParams.get("requestId")).toBe("client-key-1");
  });

  it("preserves leading and trailing whitespace in the message body", async () => {
    const { sent, fetcher } = recordingFetcher();
    const text = "  indented\n  code  ";

    await googleChatActionHandlers.create_message({ space: "A", text }, { accessToken, fetcher });

    expect(sentBody(sent[0].init)).toEqual({ text });
  });

  it("normalizes a minimal response that only carries a resource name", async () => {
    const { fetcher } = recordingFetcher({ name: "spaces/A/messages/M" });

    await expect(
      googleChatActionHandlers.create_message({ space: "A", text: "hi" }, { accessToken, fetcher }),
    ).resolves.toEqual({ name: "spaces/A/messages/M", messageId: "M", spaceName: "spaces/A" });
  });

  describe("input validation", () => {
    const fetcher: ProviderFetch = async () => {
      throw new Error("invalid input must not be fetched");
    };
    const context = { accessToken, fetcher };

    it.each([
      ["a path-traversing space ID", { space: "spaces/..", text: "hi" }],
      ["a missing text", { space: "A" }],
      ["a whitespace-only text", { space: "A", text: "   " }],
      ["a thread that is not a full resource name", { space: "A", text: "hi", thread: "T" }],
      // A whitespace-only thread must fail loudly rather than degrade into "no
      // thread given", which would silently post a new message instead of a reply.
      ["a whitespace-only thread", { space: "A", text: "hi", thread: "   " }],
      ["a path-traversing thread ID", { space: "A", text: "hi", thread: "spaces/A/threads/.." }],
      ["a thread belonging to another space", { space: "A", text: "hi", thread: "spaces/B/threads/T" }],
    ])("rejects %s", async (_description, input) => {
      await expect(googleChatActionHandlers.create_message(input, context)).rejects.toMatchObject({ status: 400 });
    });
  });
});
describe("Google Chat find_direct_message", () => {
  const dmSpace = { name: "spaces/DM1", spaceType: "DIRECT_MESSAGE" };

  function recordingFetcher(response: () => Response) {
    const sent: { raw: string; url: URL; init: RequestInit }[] = [];
    const fetcher: ProviderFetch = async (url, init) => {
      sent.push({ raw: String(url), url: new URL(String(url)), init: init ?? {} });
      return response();
    };

    return { sent, fetcher };
  }

  function okFetcher() {
    return recordingFetcher(() => new Response(JSON.stringify(dmSpace)));
  }

  function errorFetcher(status: number, message: string) {
    return recordingFetcher(() => new Response(JSON.stringify({ error: { message } }), { status }));
  }

  it("looks the space up by email through the findDirectMessage endpoint", async () => {
    const { sent, fetcher } = okFetcher();

    const result = await googleChatActionHandlers.find_direct_message(
      { user: "person@example.com" },
      { accessToken, fetcher },
    );

    // The space lookup comes first; the peer resolution that follows is covered in
    // direct-message-peer.test.ts.
    expect(sent[0].url.origin + sent[0].url.pathname).toBe("https://chat.googleapis.com/v1/spaces:findDirectMessage");
    expect(sent[0].init.method ?? "GET").toBe("GET");
    expect(sent[0].url.searchParams.get("name")).toBe("users/person@example.com");
    expect(result).toMatchObject({ name: "spaces/DM1", spaceType: "DIRECT_MESSAGE" });
  });

  // The request layer already percent-encodes query values via URLSearchParams.
  // Encoding here as well would send a%2540b.com and Google would look up a
  // literal that no account owns — succeeding at the HTTP level, wrong at the
  // identity level. Assert on the raw URL, not just the decoded accessor,
  // because searchParams.get() would decode a double encoding back to something
  // that still looks plausible.
  it("does not percent-encode the address a second time", async () => {
    const { sent, fetcher } = okFetcher();

    await googleChatActionHandlers.find_direct_message({ user: "a.b+tag@example.co.jp" }, { accessToken, fetcher });

    expect(sent[0].raw).toContain("%40");
    expect(sent[0].raw).not.toContain("%2540");
    expect(sent[0].url.searchParams.get("name")).toBe("users/a.b+tag@example.co.jp");
  });

  it("accepts a bare numeric user id", async () => {
    const { sent, fetcher } = okFetcher();

    await googleChatActionHandlers.find_direct_message({ user: "123456789" }, { accessToken, fetcher });

    expect(sent[0].url.searchParams.get("name")).toBe("users/123456789");
  });

  it("preserves case instead of normalizing the address", async () => {
    const { sent, fetcher } = okFetcher();

    await googleChatActionHandlers.find_direct_message({ user: "Person.Name@Example.COM" }, { accessToken, fetcher });

    expect(sent[0].url.searchParams.get("name")).toBe("users/Person.Name@Example.COM");
  });

  it.each([
    ["the users/ prefix", "users/person@example.com"],
    ["the me alias", "me"],
    ["the app alias", "app"],
    ["a path separator", "person@example.com/../other"],
    ["a backslash", "person@example.com\\other"],
    ["inner whitespace", "person @example.com"],
    ["a zero-width character", "person​@example.com"],
    ["a newline", "person@example.com\nsecond"],
    ["a bare word", "notanemail"],
    ["a domain without a dot", "person@example"],
    ["an empty string", ""],
    ["an over-long value", `${"a".repeat(310)}@example.com`],
  ])("rejects %s", async (_description, user) => {
    const fetcher: ProviderFetch = async () => {
      throw new Error("an invalid user identifier must never reach the network");
    };

    await expect(
      googleChatActionHandlers.find_direct_message({ user }, { accessToken, fetcher }),
    ).rejects.toMatchObject({ status: 400 });
  });

  // Providers may only put the runtime's own error codes on the wire, so the
  // distinction travels in the status and the message rather than a custom code.
  it("keeps Google's 404 as a 404 that names the missing conversation", async () => {
    const { fetcher } = errorFetcher(404, "Requested entity was not found.");

    await expect(
      googleChatActionHandlers.find_direct_message({ user: "stranger@example.com" }, { accessToken, fetcher }),
    ).rejects.toMatchObject({
      status: 404,
      code: undefined,
      message: expect.stringContaining("no existing direct message space with users/stranger@example.com"),
    });
  });

  it("does not claim the conversation is merely missing", async () => {
    const { fetcher } = errorFetcher(404, "Requested entity was not found.");

    await expect(
      googleChatActionHandlers.find_direct_message({ user: "stranger@example.com" }, { accessToken, fetcher }),
    ).rejects.toThrow(/invalid or not visible/);
  });

  // Google reports an address it cannot resolve as 400 "malformed user resource
  // name", which reads as "you formatted it wrong" when the format was fine, and
  // points the caller at a users/ prefix this action rejects. Relabelling it is
  // the whole point; assert the message, since that is what reaches the caller.
  it("relabels Google's malformed-resource-name 400 as an unresolvable user", async () => {
    const { fetcher } = errorFetcher(
      400,
      "Missing or malformed user resource name in the request. Human user resource name must follow this format: users/{user}.",
    );

    await expect(
      googleChatActionHandlers.find_direct_message({ user: "nobody@example.com" }, { accessToken, fetcher }),
    ).rejects.toMatchObject({
      status: 400,
      code: undefined,
      message: expect.stringContaining("does not resolve to a Google account"),
    });
  });

  it("tells the caller not to add the users/ prefix Google asks for", async () => {
    const { fetcher } = errorFetcher(
      400,
      "Missing or malformed user resource name in the request. Human user resource name must follow this format: users/{user}.",
    );

    await expect(
      googleChatActionHandlers.find_direct_message({ user: "nobody@example.com" }, { accessToken, fetcher }),
    ).rejects.toThrow(/do not add that prefix/);
  });

  // Only that one wording is relabelled. Any other 400 keeps its own message, so
  // an unrelated failure is never disguised as a bad address.
  it("leaves an unrelated 400 alone", async () => {
    const { fetcher } = errorFetcher(400, "Request contains an invalid argument.");

    await expect(
      googleChatActionHandlers.find_direct_message({ user: "person@example.com" }, { accessToken, fetcher }),
    ).rejects.toMatchObject({ status: 400, code: undefined });
  });

  it("leaves non-404 provider failures untouched", async () => {
    const { fetcher } = errorFetcher(403, "Request had insufficient authentication scopes.");

    await expect(
      googleChatActionHandlers.find_direct_message({ user: "person@example.com" }, { accessToken, fetcher }),
    ).rejects.toMatchObject({ status: 403, code: undefined });
  });
});
