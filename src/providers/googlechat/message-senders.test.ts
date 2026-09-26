import type { ProviderFetch } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { googleChatActionHandlers } from "./executors.ts";

const accessToken = "test-token";

interface FakeSender {
  name: string;
  type: string;
  displayName?: string;
}

interface FakeOptions {
  messages?: { name: string; sender?: FakeSender }[];
  batchStatus?: number;
  directory?: Record<string, string>;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function humanSender(id: string): FakeSender {
  return { name: `users/${id}`, type: "HUMAN" };
}

/** A fake of the Chat message endpoints plus the People batch lookup, recording every request. */
function fakeGoogle(options: FakeOptions) {
  const requests: URL[] = [];
  const fetcher: ProviderFetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.pathname === "/v1/people:batchGet") {
      if (options.batchStatus) {
        return json({ error: { code: options.batchStatus, message: "denied" } }, options.batchStatus);
      }
      const responses = url.searchParams.getAll("resourceNames").map((resourceName) => {
        const displayName = options.directory?.[resourceName.replace("people/", "")];
        return displayName
          ? {
              requestedResourceName: resourceName,
              person: {
                names: [{ displayName, metadata: { primary: true } }],
                emailAddresses: [{ value: `${displayName.toLowerCase()}@example.com`, metadata: { primary: true } }],
              },
            }
          : { requestedResourceName: resourceName, status: { code: 5, message: "not found" } };
      });
      return json({ responses });
    }
    if (url.pathname === "/v1/spaces/A/messages" && url.hostname === "chat.googleapis.com") {
      return json({ messages: options.messages ?? [] });
    }
    if (url.pathname.startsWith("/v1/spaces/A/messages/")) {
      return json(options.messages?.[0]);
    }
    throw new Error(`unexpected request ${url.toString()}`);
  };

  return { requests, fetcher };
}

function batchLookups(requests: URL[]): URL[] {
  return requests.filter((url) => url.pathname === "/v1/people:batchGet");
}

describe("Google Chat message sender names", () => {
  it("names each distinct human sender on a page with one directory lookup", async () => {
    const { requests, fetcher } = fakeGoogle({
      messages: [
        { name: "spaces/A/messages/1", sender: humanSender("1") },
        { name: "spaces/A/messages/2", sender: humanSender("2") },
        { name: "spaces/A/messages/3", sender: humanSender("1") },
        { name: "spaces/A/messages/4", sender: { name: "users/B", type: "BOT" } },
      ],
      directory: { "1": "Alice", "2": "Bob" },
    });

    const result = await googleChatActionHandlers.list_messages({ space: "A" }, { accessToken, fetcher });

    expect(result).toMatchObject({
      messages: [
        { sender: { name: "users/1", type: "HUMAN", displayName: "Alice", email: "alice@example.com" } },
        { sender: { name: "users/2", type: "HUMAN", displayName: "Bob", email: "bob@example.com" } },
        { sender: { name: "users/1", type: "HUMAN", displayName: "Alice", email: "alice@example.com" } },
        { sender: { name: "users/B", type: "BOT" } },
      ],
    });
    const lookups = batchLookups(requests);
    expect(lookups).toHaveLength(1);
    expect(lookups[0].searchParams.getAll("resourceNames")).toEqual(["people/1", "people/2"]);
  });

  it("leaves bot senders unnamed and out of the directory lookup", async () => {
    const { requests, fetcher } = fakeGoogle({
      messages: [{ name: "spaces/A/messages/1", sender: { name: "users/B", type: "BOT" } }],
    });

    const result = await googleChatActionHandlers.list_messages({ space: "A" }, { accessToken, fetcher });

    expect(result).toMatchObject({ messages: [{ sender: { name: "users/B", type: "BOT" } }] });
    expect((result as { messages: { sender: Record<string, unknown> }[] }).messages[0].sender).not.toHaveProperty(
      "displayName",
    );
    expect(batchLookups(requests)).toHaveLength(0);
  });

  it("still returns the messages when the directory lookup fails, saying why names are missing", async () => {
    const { fetcher } = fakeGoogle({
      messages: [{ name: "spaces/A/messages/1", sender: humanSender("1") }],
      batchStatus: 403,
    });

    const result = await googleChatActionHandlers.list_messages({ space: "A" }, { accessToken, fetcher });

    expect(result).toMatchObject({
      messages: [
        {
          name: "spaces/A/messages/1",
          sender: { name: "users/1", displayName: null, email: null, profileUnavailableReason: "people_forbidden" },
        },
      ],
    });
  });

  it("reports a sender the directory cannot find instead of dropping the message", async () => {
    const { fetcher } = fakeGoogle({
      messages: [{ name: "spaces/A/messages/1", sender: humanSender("9") }],
      directory: {},
    });

    const result = await googleChatActionHandlers.list_messages({ space: "A" }, { accessToken, fetcher });

    expect(result).toMatchObject({
      messages: [{ sender: { name: "users/9", displayName: null, profileUnavailableReason: "people_not_found" } }],
    });
  });

  it("splits more distinct senders than one lookup takes across several lookups", async () => {
    const ids = Array.from({ length: 201 }, (_, index) => String(index + 1));
    const { requests, fetcher } = fakeGoogle({
      messages: ids.map((id) => ({ name: `spaces/A/messages/${id}`, sender: humanSender(id) })),
      directory: Object.fromEntries(ids.map((id) => [id, `Person${id}`])),
    });

    const result = await googleChatActionHandlers.list_messages({ space: "A" }, { accessToken, fetcher });

    const lookups = batchLookups(requests);
    expect(lookups.map((url) => url.searchParams.getAll("resourceNames").length)).toEqual([200, 1]);
    expect((result as { messages: { sender: { displayName: string } }[] }).messages[200].sender.displayName).toBe(
      "Person201",
    );
  });

  it("keeps a sender name Google Chat already supplied and fills in only the email", async () => {
    const { fetcher } = fakeGoogle({
      messages: [{ name: "spaces/A/messages/1", sender: { ...humanSender("1"), displayName: "Chat Name" } }],
      directory: { "1": "Directory Name" },
    });

    const result = await googleChatActionHandlers.list_messages({ space: "A" }, { accessToken, fetcher });

    // Chat fills in displayName itself under app authentication but never an email.
    expect(result).toMatchObject({
      messages: [{ sender: { name: "users/1", displayName: "Chat Name", email: "directory name@example.com" } }],
    });
  });

  it("keeps a Chat-supplied sender name when the directory lookup fails", async () => {
    const { fetcher } = fakeGoogle({
      messages: [{ name: "spaces/A/messages/1", sender: { ...humanSender("1"), displayName: "Chat Name" } }],
      batchStatus: 403,
    });

    const result = await googleChatActionHandlers.list_messages({ space: "A" }, { accessToken, fetcher });

    const sender = (result as { messages: { sender: Record<string, unknown> }[] }).messages[0].sender;
    expect(sender).toMatchObject({ name: "users/1", displayName: "Chat Name", email: null });
    // profileUnavailableReason explains a null displayName; there is none here.
    expect(sender).not.toHaveProperty("profileUnavailableReason");
  });

  it("does not look anything up for messages without a sender", async () => {
    const { requests, fetcher } = fakeGoogle({ messages: [{ name: "spaces/A/messages/1" }] });

    await googleChatActionHandlers.list_messages({ space: "A" }, { accessToken, fetcher });

    expect(batchLookups(requests)).toHaveLength(0);
  });

  it("names the sender of a single message", async () => {
    const { fetcher } = fakeGoogle({
      messages: [{ name: "spaces/A/messages/1", sender: humanSender("1") }],
      directory: { "1": "Alice" },
    });

    const result = await googleChatActionHandlers.get_message(
      { message: "spaces/A/messages/1" },
      { accessToken, fetcher },
    );

    expect(result).toMatchObject({ sender: { name: "users/1", displayName: "Alice", email: "alice@example.com" } });
  });

  it("does not look up the sender of a message it just created", async () => {
    const requests: URL[] = [];
    const fetcher: ProviderFetch = async (input) => {
      requests.push(new URL(String(input)));
      return json({ name: "spaces/A/messages/1", sender: humanSender("1") });
    };

    await googleChatActionHandlers.create_message({ space: "A", text: "hi" }, { accessToken, fetcher });

    // The sender of a new message is always the caller, so a lookup would only cost a request.
    expect(requests).toHaveLength(1);
  });
});
