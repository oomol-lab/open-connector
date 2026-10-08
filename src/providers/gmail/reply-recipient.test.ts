import type { GmailMessageResource } from "./message.ts";

import { simpleParser } from "mailparser";
import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { validateActionInput } from "../../core/validation.ts";
import { gmailActions } from "./actions.ts";
import { gmailActionHandlers } from "./executors.ts";

const replyAction = gmailActions.find((action) => action.name === "reply_email")!;
const replyInput = { threadId: "original-thread", messageId: "original-message", body: "Following up" };

function fixture() {
  const message: GmailMessageResource = {
    id: "original-message",
    threadId: "original-thread",
    labelIds: ["SENT"],
    payload: {
      headers: [
        { name: "From", value: "Owner <owner@brand.example>" },
        { name: "Reply-To", value: "owner-replies@brand.example" },
        { name: "To", value: "contact@publisher.example" },
        { name: "Subject", value: "Notta Memo press invitation" },
        { name: "Message-ID", value: "<original@brand.example>" },
        { name: "References", value: "<root@brand.example> <ancestor@brand.example>" },
      ],
    },
  };
  const requests: Array<{ url: URL; init: RequestInit }> = [];
  const sent: Array<{ threadId: string; raw: string }> = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    if (url.pathname.endsWith("/messages/original-message") && !init.method) {
      expect(url.searchParams.get("format")).toBe("full");
      return Response.json(message);
    }
    if (url.pathname.endsWith("/messages/send") && init.method === "POST") {
      const body = JSON.parse(String(init.body));
      sent.push(body);
      return Response.json({ id: "sent-message", threadId: body.threadId });
    }
    throw new Error(`Unexpected Gmail request: ${init.method ?? "GET"} ${url.pathname}`);
  };
  return { message, requests, sent, context: { userId: "me", accessToken: "gmail-token", fetcher } };
}

describe("Gmail message reply recipient overrides", () => {
  it("accepts a recipient override without requiring it for existing callers", () => {
    expect(validateActionInput(replyAction, replyInput).valid).toBe(true);
    expect(validateActionInput(replyAction, { ...replyInput, to: "contact@publisher.example" }).valid).toBe(true);
  });

  it.each(["contact@publisher.example", "third-person@example.com"])(
    "sends a reply to %s while preserving the original reply headers",
    async (to) => {
      const test = fixture();
      const result = await gmailActionHandlers.reply_email({ ...replyInput, to }, test.context);

      expect(result).toEqual({ messageId: "sent-message", threadId: "original-thread" });
      expect(test.sent).toHaveLength(1);
      expect(test.sent[0]!.threadId).toBe("original-thread");
      const parsed = await simpleParser(Buffer.from(test.sent[0]!.raw, "base64url"));
      expect(parsed.to).toMatchObject({ value: [{ address: to }] });
      expect(parsed.subject).toBe("Re: Notta Memo press invitation");
      expect(parsed.inReplyTo).toBe("<original@brand.example>");
      expect(parsed.references).toEqual([
        "<root@brand.example>",
        "<ancestor@brand.example>",
        "<original@brand.example>",
      ]);
      expect(parsed.text?.trim()).toBe("Following up");
    },
  );

  it.each([true, false])(
    "keeps the original reply recipient when to is omitted and Reply-To is %s",
    async (hasReplyTo) => {
      const test = fixture();
      if (!hasReplyTo) {
        test.message.payload!.headers = test.message.payload!.headers!.filter((header) => header.name !== "Reply-To");
      }
      await gmailActionHandlers.reply_email(replyInput, test.context);
      const parsed = await simpleParser(Buffer.from(test.sent[0]!.raw, "base64url"));
      expect(parsed.to).toMatchObject({
        value: [{ address: hasReplyTo ? "owner-replies@brand.example" : "owner@brand.example" }],
      });
      expect(test.sent[0]!.threadId).toBe("original-thread");
    },
  );

  it.each([
    { name: "empty", to: "" },
    { name: "whitespace", to: " \t " },
    { name: "null", to: null },
    { name: "numeric", to: 123 },
    { name: "object", to: {} },
    { name: "array", to: [] },
    { name: "missing domain", to: "contact@" },
    { name: "missing local part", to: "@publisher.example" },
    { name: "malformed", to: "invalid-address" },
    { name: "header injection", to: "contact@publisher.example\r\nBcc: unwanted@example.com" },
  ])("rejects a $name override before contacting Gmail", async ({ to }) => {
    const test = fixture();
    const input = { ...replyInput, to };
    expect(validateActionInput(replyAction, input).valid).toBe(false);
    await expect(gmailActionHandlers.reply_email(input, test.context)).rejects.toMatchObject({ status: 400 });
    expect(test.requests).toEqual([]);
    expect(test.sent).toEqual([]);
  });
});
