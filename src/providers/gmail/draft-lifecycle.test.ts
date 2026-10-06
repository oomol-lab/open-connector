import { simpleParser } from "mailparser";
import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { defaultProviderJsonMaxResponseBytes } from "../provider-runtime.ts";
import { gmailActionHandlers } from "./executors.ts";
import { encodeMimeMessage } from "./mime.ts";

const suppliedAttachments = [
  { filename: "report.txt", mimeType: "text/plain", contentBase64: Buffer.from("report bytes").toString("base64") },
  { mimeType: "image/png", contentId: "logo", contentBase64: Buffer.from([0, 137, 255]).toString("base64") },
];
const html = '  <p>hello<img src="cid:logo"></p>\n ';

function fixture(initialRaw?: string) {
  let raw = initialRaw ?? "";
  const requests: Array<{ url: URL; init: RequestInit }> = [];
  const sent: string[] = [];
  const target = {
    id: "original",
    threadId: "thread-1",
    payload: {
      headers: [
        { name: "Subject", value: "Topic" },
        { name: "From", value: "sender@example.com" },
        { name: "Message-ID", value: "<original@example.com>" },
        { name: "References", value: "<root@example.com>" },
      ],
    },
  };
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    if (url.pathname.endsWith("/threads/thread-1")) return Response.json({ id: "thread-1", messages: [target] });
    if (url.pathname.endsWith("/messages/original")) return Response.json(target);
    if (url.pathname.endsWith("/drafts/draft-1") && !init.method) {
      expect(url.searchParams.get("format")).toBe("raw");
      return Response.json({ id: "draft-1", message: { id: "message-1", threadId: "thread-1", raw } });
    }
    const body = JSON.parse(String(init.body));
    if (url.pathname.endsWith("/messages/send")) {
      sent.push(body.raw);
      return Response.json({ id: "sent-1", threadId: "thread-1" });
    }
    if (url.pathname.endsWith("/drafts/send")) {
      expect(body).toEqual({ id: "draft-1" });
      sent.push(raw);
      return Response.json({ id: "sent-1", threadId: "thread-1" });
    }
    raw = body.message.raw;
    return Response.json({
      id: "draft-1",
      message: { id: "message-1", threadId: body.message.threadId ?? "thread-1" },
    });
  };
  return { context: { userId: "me", accessToken: "gmail-token", fetcher }, requests, sent, raw: () => raw };
}

describe("Gmail attachment workflows", () => {
  it.each([
    { name: "send_email", handler: gmailActionHandlers.send_email, sends: true, reply: false },
    { name: "create_draft", handler: gmailActionHandlers.create_draft, sends: false, reply: false },
    { name: "create_email_draft", handler: gmailActionHandlers.create_email_draft, sends: false, reply: false },
    { name: "reply_email", handler: gmailActionHandlers.reply_email, sends: true, reply: true },
    { name: "reply_to_thread", handler: gmailActionHandlers.reply_to_thread, sends: true, reply: true },
  ])("composes supplied files and inline images through $name", async ({ handler, sends, reply }) => {
    const test = fixture();
    await handler(
      {
        to: "reader@example.com",
        subject: "Topic",
        body: html,
        isHtml: true,
        messageId: "original",
        threadId: "thread-1",
        attachments: suppliedAttachments,
      },
      test.context,
    );
    const parsed = await simpleParser(Buffer.from(sends ? test.sent[0]! : test.raw(), "base64url"), {
      skipImageLinks: true,
    });
    expect(parsed.html).toBe(html);
    expect(parsed.attachments).toHaveLength(2);
    expect(parsed.attachments.find((file) => file.cid === "logo")?.content).toEqual(Buffer.from([0, 137, 255]));
    expect(parsed.attachments.find((file) => file.filename === "report.txt")?.content.toString()).toBe("report bytes");
    if (reply) expect(parsed.inReplyTo).toBe("<original@example.com>");
  });

  it("creates, updates and sends the original draft without losing attachments or reply headers", async () => {
    const test = fixture();
    await gmailActionHandlers.create_email_draft(
      { to: "reader@example.com", body: html, isHtml: true, attachments: suppliedAttachments },
      test.context,
    );
    const originalBody = Buffer.from(test.raw(), "base64url").toString().split("\r\n\r\n").slice(1).join("\r\n\r\n");
    await gmailActionHandlers.update_draft({ draftId: "draft-1", subject: "updated", cc: [], bcc: "" }, test.context);
    const updated = Buffer.from(test.raw(), "base64url").toString();
    expect(updated.split("\r\n\r\n").slice(1).join("\r\n\r\n")).toBe(originalBody);
    const updateRequest = test.requests.find((request) => request.init.method === "PUT")!;
    expect(JSON.parse(String(updateRequest.init.body)).message.threadId).toBe("thread-1");
    await gmailActionHandlers.send_draft({ draftId: "draft-1" }, test.context);
    const sent = await simpleParser(Buffer.from(test.sent[0]!, "base64url"), { skipImageLinks: true });
    expect(sent.subject).toBe("updated");
    expect(sent.html).toBe(html);
    expect(sent.attachments).toHaveLength(2);
  });

  it("preserves threading headers and accepts an empty body and subject when explicitly supplied", async () => {
    const original = encodeMimeMessage({
      to: ["reader@example.com"],
      subject: "original",
      body: html,
      isHtml: true,
      inReplyTo: "<parent@example.com>",
      references: "<root@example.com> <parent@example.com>",
    });
    const test = fixture(original);
    await gmailActionHandlers.update_draft(
      { draftId: "draft-1", subject: "", body: "", cc: [], bcc: [] },
      test.context,
    );
    const parsed = await simpleParser(Buffer.from(test.raw(), "base64url"));
    expect(parsed.subject ?? "").toBe("");
    expect(parsed.html || "").toBe("");
    expect(parsed.inReplyTo).toBe("<parent@example.com>");
    expect(parsed.references).toEqual(["<root@example.com>", "<parent@example.com>"]);
  });

  it("allows attachment-sized raw responses above the default JSON cap", async () => {
    const fileBytes = 12 * 1024 * 1024;
    const raw = encodeMimeMessage({
      to: ["reader@example.com"],
      attachments: [
        {
          mimeType: "application/octet-stream",
          contentBase64: Buffer.alloc(fileBytes, 1).toString("base64"),
          disposition: "attachment",
        },
      ],
    });
    expect(raw.length).toBeGreaterThan(defaultProviderJsonMaxResponseBytes);
    const test = fixture(raw);
    await gmailActionHandlers.update_draft({ draftId: "draft-1", subject: "large file" }, test.context);
    expect((await simpleParser(Buffer.from(test.raw(), "base64url"))).attachments[0]?.content.byteLength).toBe(
      fileBytes,
    );
  }, 15_000);

  it("refuses unavailable raw MIME and unsupported edits before updating the stored draft", async () => {
    const test = fixture();
    await expect(
      gmailActionHandlers.update_draft({ draftId: "draft-1", body: "new" }, test.context),
    ).rejects.toMatchObject({ status: 502 });
    expect(test.requests.some((request) => request.init.method === "PUT")).toBe(false);
    const signed = fixture(
      Buffer.from("Subject: signed\r\nContent-Type: multipart/signed; boundary=b\r\n\r\nopaque").toString("base64url"),
    );
    await expect(
      gmailActionHandlers.update_draft({ draftId: "draft-1", attachments: [] }, signed.context),
    ).rejects.toMatchObject({ status: 400 });
    expect(signed.requests.some((request) => request.init.method === "PUT")).toBe(false);
  });
});
