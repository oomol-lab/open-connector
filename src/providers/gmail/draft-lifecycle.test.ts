import type { GmailMessageResource } from "./message.ts";

import { Validator } from "@cfworker/json-schema";
import { simpleParser } from "mailparser";
import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { defaultProviderJsonMaxResponseBytes } from "../provider-runtime.ts";
import { gmailActions } from "./actions.ts";
import { gmailActionHandlers } from "./executors.ts";
import { encodeMimeMessage } from "./mime.ts";

const suppliedAttachments = [
  { filename: "report.txt", mimeType: "text/plain", contentBase64: Buffer.from("report bytes").toString("base64") },
  { mimeType: "image/png", contentId: "logo", contentBase64: Buffer.from([0, 137, 255]).toString("base64") },
];
const html = '  <p>hello<img src="cid:logo"></p>\n ';

function fixture(initialRaw?: string) {
  let raw = initialRaw ?? "";
  let revision = 0;
  let storedThreadId = "thread-1";
  const requests: Array<{ url: URL; init: RequestInit }> = [];
  const sent: string[] = [];
  const responseIds = { messageId: true, threadId: true };
  const target: GmailMessageResource = {
    id: "original",
    threadId: "thread-1",
    internalDate: "1000",
    payload: {
      headers: [
        { name: "Subject", value: "Topic" },
        { name: "From", value: "sender@example.com" },
        { name: "Message-ID", value: "<original@example.com>" },
        { name: "References", value: "<root@example.com>" },
      ],
    },
  };
  const messages = [target];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    const threadMatch = url.pathname.match(/\/threads\/([^/]+)$/);
    if (threadMatch && !init.method) {
      return Response.json({
        id: threadMatch[1],
        messages: messages.filter((message) => message.threadId === threadMatch[1]),
      });
    }
    const messageMatch = url.pathname.match(/\/messages\/([^/]+)$/);
    if (messageMatch && !init.method) {
      const message = messages.find((message) => message.id === messageMatch[1]);
      if (!message) return Response.json({ error: { message: "Message not found" } }, { status: 404 });
      return Response.json(message);
    }
    if (url.pathname.endsWith("/drafts") && !init.method) {
      return Response.json({
        drafts: [
          {
            id: "draft-1",
            message: {
              id: responseIds.messageId ? `message-${revision}` : undefined,
              threadId: responseIds.threadId ? storedThreadId : undefined,
            },
          },
        ],
        nextPageToken: "next-page",
      });
    }
    if (url.pathname.endsWith("/drafts/draft-1") && !init.method) {
      const format = url.searchParams.get("format");
      expect(["raw", "full"]).toContain(format);
      return Response.json({
        id: "draft-1",
        message: {
          id: responseIds.messageId ? `message-${revision}` : undefined,
          threadId: responseIds.threadId ? storedThreadId : undefined,
          raw: format === "raw" ? raw : undefined,
          payload: format === "full" ? target.payload : undefined,
        },
      });
    }
    const body = JSON.parse(String(init.body));
    if (url.pathname.endsWith("/messages/send")) {
      sent.push(body.raw);
      return Response.json({
        id: "sent-1",
        threadId: responseIds.threadId ? (body.threadId ?? storedThreadId) : undefined,
      });
    }
    if (url.pathname.endsWith("/drafts/send")) {
      expect(body).toEqual({ id: "draft-1" });
      sent.push(raw);
      return Response.json({ id: "sent-1", threadId: responseIds.threadId ? storedThreadId : undefined });
    }
    if (!url.pathname.endsWith("/drafts") && !url.pathname.endsWith("/drafts/draft-1")) {
      throw new Error(`Unexpected Gmail request: ${init.method ?? "GET"} ${url.pathname}`);
    }
    raw = body.message.raw;
    revision += 1;
    storedThreadId = body.message.threadId ?? storedThreadId;
    return Response.json({
      id: "draft-1",
      message: {
        id: responseIds.messageId ? `message-${revision}` : undefined,
        threadId: responseIds.threadId ? storedThreadId : undefined,
      },
    });
  };
  return {
    context: { userId: "me", accessToken: "gmail-token", fetcher },
    requests,
    sent,
    messages,
    target,
    responseIds,
    raw: () => raw,
  };
}

describe("Gmail attachment workflows", () => {
  it.each(["string", "array"])("preserves Unicode recipients in %s address lists when sending", async (format) => {
    const addresses = '"张三, 研发" <first@example.com>, 李四 <second@example.com>';
    const recipients = format === "array" ? [addresses] : addresses;
    const test = fixture();
    await gmailActionHandlers.send_email(
      { to: addresses, cc: recipients, bcc: recipients, body: "hello" },
      test.context,
    );
    const parsed = await simpleParser(Buffer.from(test.sent[0]!, "base64url"));
    const expected = {
      value: [
        { name: "张三, 研发", address: "first@example.com" },
        { name: "李四", address: "second@example.com" },
      ],
    };
    expect(parsed.to).toMatchObject(expected);
    expect(parsed.cc).toMatchObject(expected);
    expect(parsed.bcc).toMatchObject(expected);
  });

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
    const created = await gmailActionHandlers.create_email_draft(
      {
        replyToMessageId: "original",
        to: "reader@example.com",
        body: html,
        isHtml: true,
        attachments: suppliedAttachments,
      },
      test.context,
    );
    expect(created).toEqual({ draftId: "draft-1", messageId: "message-1", threadId: "thread-1" });
    const originalBody = Buffer.from(test.raw(), "base64url").toString().split("\r\n\r\n").slice(1).join("\r\n\r\n");
    const edited = await gmailActionHandlers.update_draft(
      { draftId: "draft-1", subject: "Re: Topic", cc: [], bcc: "" },
      test.context,
    );
    expect(edited).toEqual({ draftId: "draft-1", messageId: "message-2", threadId: "thread-1" });
    const updated = Buffer.from(test.raw(), "base64url").toString();
    expect(updated.split("\r\n\r\n").slice(1).join("\r\n\r\n")).toBe(originalBody);
    const updateRequest = test.requests.find((request) => request.init.method === "PUT")!;
    expect(JSON.parse(String(updateRequest.init.body)).message.threadId).toBe("thread-1");
    const output = await gmailActionHandlers.send_draft({ draftId: "draft-1" }, test.context);
    expect(output).toEqual({ messageId: "sent-1", threadId: "thread-1" });
    const sent = await simpleParser(Buffer.from(test.sent[0]!, "base64url"), { skipImageLinks: true });
    expect(sent.subject).toBe("Re: Topic");
    expect(sent.inReplyTo).toBe("<original@example.com>");
    expect(sent.references).toEqual(["<root@example.com>", "<original@example.com>"]);
    expect(sent.html).toBe(html);
    expect(sent.attachments).toHaveLength(2);
  });

  it("accepts an empty body and subject when editing an ordinary draft", async () => {
    const original = encodeMimeMessage({
      to: ["reader@example.com"],
      subject: "original",
      body: html,
      isHtml: true,
    });
    const test = fixture(original);
    await gmailActionHandlers.update_draft(
      { draftId: "draft-1", subject: "", body: "", cc: [], bcc: [] },
      test.context,
    );
    const parsed = await simpleParser(Buffer.from(test.raw(), "base64url"));
    expect(parsed.subject ?? "").toBe("");
    expect(parsed.html || "").toBe("");
    expect(parsed.inReplyTo).toBeUndefined();
    expect(parsed.references).toBeUndefined();
  });

  it.each([
    { name: "body", input: { body: "Edited body" }, subject: "Original topic", body: "Edited body" },
    { name: "subject", input: { subject: "Edited topic" }, subject: "Edited topic", body: "Original body" },
  ])(
    "edits an ordinary draft's $name with its current thread ID using compose access",
    async ({ input, subject, body }) => {
      const test = fixture(
        encodeMimeMessage({ to: ["reader@example.com"], subject: "Original topic", body: "Original body" }),
      );
      let mailboxReads = 0;
      const fetcher: typeof fetch = async (request, init) => {
        const url = new URL(String(request));
        if (/\/(?:threads|messages)\/[^/]+$/.test(url.pathname)) {
          mailboxReads += 1;
          return Response.json({ error: { message: "Insufficient permission" } }, { status: 403 });
        }
        return test.context.fetcher(request, init);
      };
      const result = await gmailActionHandlers.update_draft(
        { draftId: "draft-1", threadId: "thread-1", ...input },
        { ...test.context, fetcher },
      );
      expect(result).toEqual({ draftId: "draft-1", messageId: "message-1", threadId: "thread-1" });
      expect(mailboxReads).toBe(0);
      const parsed = await simpleParser(Buffer.from(test.raw(), "base64url"));
      expect(parsed.subject).toBe(subject);
      expect(parsed.text?.trim()).toBe(body);
      expect(parsed.inReplyTo).toBeUndefined();
      expect(parsed.references).toBeUndefined();
      const update = test.requests.find((request) => request.init.method === "PUT")!;
      expect(JSON.parse(String(update.init.body)).message.threadId).toBe("thread-1");
    },
  );

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
    // Encoding and parsing this 12 MiB attachment needs extra time in the full concurrent suite.
  }, 30_000);

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

describe("Gmail reply and draft threading", () => {
  it.each([
    { name: "encoded tabs", encoded: "=?UTF-8?Q?Project=09update?=", subject: "Project\tupdate" },
    { name: "UTF-7", encoded: "=?UTF-7?Q?Project_+IKw-_update?=", subject: "Project € update" },
  ])("preserves $name through replies, reply draft creation and edits", async ({ encoded, subject }) => {
    const test = fixture();
    test.target.payload!.headers!.find((header) => header.name === "Subject")!.value = encoded;
    await gmailActionHandlers.reply_email({ messageId: "original", threadId: "thread-1", body: "Reply" }, test.context);
    await gmailActionHandlers.reply_to_thread({ threadId: "thread-1", body: "Reply" }, test.context);
    await gmailActionHandlers.create_email_draft({ replyToMessageId: "original", body: "Reply" }, test.context);
    const created = test.raw();
    await gmailActionHandlers.update_draft({ draftId: "draft-1", replyToMessageId: "original" }, test.context);
    for (const raw of [...test.sent, created, test.raw()]) {
      const parsed = await simpleParser(Buffer.from(raw, "base64url"));
      expect(parsed.subject).toBe(`Re: ${subject}`);
      expect(parsed.inReplyTo).toBe("<original@example.com>");
      expect(parsed.references).toEqual(["<root@example.com>", "<original@example.com>"]);
    }
    await gmailActionHandlers.update_draft({ draftId: "draft-1", subject: `Re: Re: ${subject}` }, test.context);
    expect((await simpleParser(Buffer.from(test.raw(), "base64url"))).subject).toBe(`Re: Re: ${subject}`);
  });

  it.each(["=?UTF-8?Q?Topic=0D=0ABcc:_victim@example.com?=", "=?UTF-7?Q?Topic+AA0ACg-Bcc:_victim@example.com?="])(
    "rejects header delimiters decoded from an inherited reply subject: %s",
    async (encoded) => {
      const test = fixture();
      test.target.payload!.headers!.find((header) => header.name === "Subject")!.value = encoded;
      await expect(
        gmailActionHandlers.create_email_draft({ replyToMessageId: "original", body: "Reply" }, test.context),
      ).rejects.toMatchObject({ status: 400 });
      expect(test.requests.every((request) => !request.init.method)).toBe(true);
    },
  );

  it("keeps language-tagged subjects and legacy message IDs through reply draft edits", async () => {
    const test = fixture();
    test.target.payload!.headers = [
      { name: "Subject", value: "=?UTF-8*en?Q?Project_update?=" },
      { name: "From", value: "sender@example.com" },
      { name: "Message-ID", value: '< (note) "parent \tname" @ example.com >' },
      { name: "References", value: "<root (note) @ example.com>" },
    ];
    await gmailActionHandlers.create_email_draft({ replyToMessageId: "original", body: "Reply" }, test.context);
    await gmailActionHandlers.update_draft(
      { draftId: "draft-1", threadId: "thread-1", subject: "Re: Project update", body: "Edited reply" },
      test.context,
    );
    const updated = Buffer.from(test.raw(), "base64url").toString();
    expect(updated).toContain('In-Reply-To: <"parent \tname"@example.com>\r\n');
    expect(updated).toContain('References: <root@example.com> <"parent \tname"@example.com>\r\n');
    const parsed = await simpleParser(Buffer.from(test.raw(), "base64url"));
    expect(parsed.subject).toBe("Re: Project update");
    expect(parsed.text?.trim()).toBe("Edited reply");
  });

  it.each([
    { name: "a message", input: { replyToMessageId: "original" } },
    { name: "a thread", input: { threadId: "thread-1" } },
  ])("creates a reply draft from $name with matching headers, subject and recipient", async ({ input }) => {
    const test = fixture();
    await gmailActionHandlers.create_email_draft({ ...input, body: "Reply body" }, test.context);
    const parsed = await simpleParser(Buffer.from(test.raw(), "base64url"));
    expect(parsed.subject).toBe("Re: Topic");
    expect(parsed.to).toMatchObject({ value: [{ address: "sender@example.com" }] });
    expect(parsed.inReplyTo).toBe("<original@example.com>");
    expect(parsed.references).toEqual(["<root@example.com>", "<original@example.com>"]);
    const write = test.requests.find((request) => request.init.method === "POST")!;
    expect(JSON.parse(String(write.init.body)).message.threadId).toBe("thread-1");
  });

  it.each(["", []])("keeps an explicitly empty To recipient list when creating a reply draft: %j", async (to) => {
    const test = fixture();
    await gmailActionHandlers.create_email_draft(
      { replyToMessageId: "original", to, cc: "copy@example.com", body: "Reply body" },
      test.context,
    );
    const parsed = await simpleParser(Buffer.from(test.raw(), "base64url"));
    expect(parsed.to).toBeUndefined();
    expect(parsed.cc).toMatchObject({ value: [{ address: "copy@example.com" }] });
    expect(parsed.inReplyTo).toBe("<original@example.com>");
  });

  it.each([
    { name: "reply_to_thread", handler: gmailActionHandlers.reply_to_thread },
    { name: "create_email_draft", handler: gmailActionHandlers.create_email_draft },
  ])("selects the latest dated non-draft message despite undated entries through $name", async ({ handler }) => {
    const test = fixture();
    test.messages.unshift({
      id: "latest",
      threadId: "thread-1",
      internalDate: "3000",
      labelIds: ["INBOX"],
      payload: {
        headers: [
          { name: "Subject", value: "Re: Topic" },
          { name: "From", value: "latest@example.com" },
          { name: "Message-ID", value: "<latest@example.com>" },
          { name: "References", value: "<root@example.com> <original@example.com>" },
        ],
      },
    });
    test.messages.splice(1, 0, {
      id: "undated",
      threadId: "thread-1",
      labelIds: ["INBOX"],
      payload: {
        headers: [
          { name: "Subject", value: "Re: Topic" },
          { name: "From", value: "undated@example.com" },
          { name: "Message-ID", value: "<undated@example.com>" },
        ],
      },
    });
    test.messages.push({
      id: "draft-message",
      threadId: "thread-1",
      internalDate: "5000",
      labelIds: ["DRAFT"],
      payload: {
        headers: [
          { name: "Subject", value: "Re: Topic" },
          { name: "From", value: "draft@example.com" },
          { name: "Message-ID", value: "<draft@example.com>" },
        ],
      },
    });
    await handler({ threadId: "thread-1", body: "Reply body" }, test.context);
    const parsed = await simpleParser(Buffer.from(test.sent[0] ?? test.raw(), "base64url"));
    expect(parsed.inReplyTo).toBe("<latest@example.com>");
    expect(parsed.to).toMatchObject({ value: [{ address: "latest@example.com" }] });
    expect(parsed.references).toEqual(["<root@example.com>", "<original@example.com>", "<latest@example.com>"]);
  });

  it.each([
    {
      name: "reply_email",
      handler: gmailActionHandlers.reply_email,
      input: { messageId: "original", threadId: "different-thread", body: "Reply" },
    },
    {
      name: "create_email_draft",
      handler: gmailActionHandlers.create_email_draft,
      input: { replyToMessageId: "original", threadId: "different-thread", body: "Reply" },
    },
  ])("refuses mismatched message and thread IDs before writing through $name", async ({ handler, input }) => {
    const test = fixture();
    await expect(handler(input, test.context)).rejects.toMatchObject({ status: 400 });
    expect(test.requests.every((request) => !request.init.method)).toBe(true);
  });

  it.each([
    {
      name: "reply_email",
      handler: gmailActionHandlers.reply_email,
      input: { messageId: "original", threadId: "thread-1", body: "Reply" },
    },
    {
      name: "reply_to_thread",
      handler: gmailActionHandlers.reply_to_thread,
      input: { threadId: "thread-1", body: "Reply" },
    },
    {
      name: "create_email_draft",
      handler: gmailActionHandlers.create_email_draft,
      input: { replyToMessageId: "original", body: "Reply" },
    },
  ])("refuses a reply target without an RFC Message-ID before writing through $name", async ({ handler, input }) => {
    const test = fixture();
    test.target.payload!.headers = test.target.payload!.headers!.filter((header) => header.name !== "Message-ID");
    await expect(handler(input, test.context)).rejects.toMatchObject({ status: 400 });
    expect(test.requests.every((request) => !request.init.method)).toBe(true);
  });

  it("refuses a thread containing only drafts", async () => {
    const test = fixture();
    test.target.labelIds = ["DRAFT"];
    await expect(
      gmailActionHandlers.create_email_draft({ threadId: "thread-1", body: "Reply" }, test.context),
    ).rejects.toMatchObject({ status: 400 });
    expect(test.requests.every((request) => !request.init.method)).toBe(true);
  });

  it("rejects a mismatched subject before creating a reply draft", async () => {
    const test = fixture();
    await expect(
      gmailActionHandlers.create_email_draft(
        { replyToMessageId: "original", subject: "Another topic", body: "Reply" },
        test.context,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(test.requests.every((request) => !request.init.method)).toBe(true);
  });

  it.each(["Another topic", ""])("rejects a conflicting subject on an existing reply draft: %s", async (subject) => {
    const test = fixture(
      encodeMimeMessage({
        to: ["reader@example.com"],
        subject: "Re: Topic",
        body: "Reply body",
        inReplyTo: "<original@example.com>",
        references: "<root@example.com> <original@example.com>",
      }),
    );
    const original = test.raw();
    await expect(gmailActionHandlers.update_draft({ draftId: "draft-1", subject }, test.context)).rejects.toMatchObject(
      { status: 400 },
    );
    expect(test.raw()).toBe(original);
    expect(test.requests.some((request) => request.init.method === "PUT")).toBe(false);
  });

  it("preserves the original reply target when explicitly retaining the current thread", async () => {
    const test = fixture(
      encodeMimeMessage({
        to: ["reader@example.com"],
        subject: "Re: Topic",
        body: "Reply body",
        inReplyTo: "<original@example.com>",
        references: "<root@example.com> <original@example.com>",
      }),
    );
    test.messages.push({
      ...test.target,
      id: "later",
      internalDate: "3000",
      payload: {
        headers: [
          { name: "Subject", value: "Topic" },
          { name: "From", value: "later@example.com" },
          { name: "Message-ID", value: "<later@example.com>" },
        ],
      },
    });
    await gmailActionHandlers.update_draft({ draftId: "draft-1", threadId: "thread-1", body: "" }, test.context);
    const parsed = await simpleParser(Buffer.from(test.raw(), "base64url"));
    expect(parsed.inReplyTo).toBe("<original@example.com>");
    expect(parsed.references).toEqual(["<root@example.com>", "<original@example.com>"]);
    expect(parsed.text ?? "").toBe("");
  });

  it.each([
    { name: "thread", input: { threadId: "thread-2" } },
    { name: "message", input: { replyToMessageId: "other-original" } },
  ])("rebuilds reply headers and subject when switching the draft to another $name", async ({ input }) => {
    const test = fixture(
      encodeMimeMessage({
        to: ["reader@example.com"],
        subject: "Re: Topic",
        body: html,
        isHtml: true,
        inReplyTo: "<original@example.com>",
        references: "<root@example.com> <original@example.com>",
        attachments: [
          {
            filename: "report.txt",
            mimeType: "text/plain",
            contentBase64: Buffer.from("report bytes").toString("base64"),
            disposition: "attachment",
          },
          {
            mimeType: "image/png",
            contentId: "logo",
            contentBase64: Buffer.from([0, 137, 255]).toString("base64"),
            disposition: "inline",
          },
        ],
      }),
    );
    test.messages.push({
      id: "other-original",
      threadId: "thread-2",
      internalDate: "2000",
      payload: {
        headers: [
          { name: "Subject", value: "Other topic" },
          { name: "From", value: "other@example.com" },
          { name: "Message-ID", value: "<other@example.com>" },
          { name: "References", value: "<other-root@example.com>" },
        ],
      },
    });
    const originalBody = Buffer.from(test.raw(), "base64url").toString().split("\r\n\r\n").slice(1).join("\r\n\r\n");
    const output = await gmailActionHandlers.update_draft({ draftId: "draft-1", ...input }, test.context);
    expect(output).toMatchObject({ draftId: "draft-1", messageId: "message-1", threadId: "thread-2" });
    const updated = Buffer.from(test.raw(), "base64url").toString();
    expect(updated.split("\r\n\r\n").slice(1).join("\r\n\r\n")).toBe(originalBody);
    const parsed = await simpleParser(Buffer.from(test.raw(), "base64url"), { skipImageLinks: true });
    expect(parsed.subject).toBe("Re: Other topic");
    expect(parsed.inReplyTo).toBe("<other@example.com>");
    expect(parsed.references).toEqual(["<other-root@example.com>", "<other@example.com>"]);
    expect(parsed.html).toBe(html);
    expect(parsed.attachments).toHaveLength(2);
    const write = test.requests.find((request) => request.init.method === "PUT")!;
    expect(JSON.parse(String(write.init.body)).message.threadId).toBe("thread-2");
  });

  it.each([
    {
      name: "mismatched message and thread IDs",
      input: { replyToMessageId: "original", threadId: "thread-2" },
      missingMessageId: false,
    },
    { name: "a conflicting subject", input: { threadId: "thread-2", subject: "Topic" }, missingMessageId: false },
    {
      name: "a target without an RFC Message-ID",
      input: { replyToMessageId: "other-original" },
      missingMessageId: true,
    },
  ])("refuses to update a reply association with $name", async ({ input, missingMessageId }) => {
    const test = fixture(
      encodeMimeMessage({
        to: ["reader@example.com"],
        subject: "Re: Topic",
        body: "Reply body",
        inReplyTo: "<original@example.com>",
        references: "<root@example.com> <original@example.com>",
      }),
    );
    const other: GmailMessageResource = {
      id: "other-original",
      threadId: "thread-2",
      payload: {
        headers: [
          { name: "Subject", value: "Other topic" },
          { name: "From", value: "other@example.com" },
        ],
      },
    };
    if (!missingMessageId) other.payload!.headers!.push({ name: "Message-ID", value: "<other@example.com>" });
    test.messages.push(other);
    const original = test.raw();
    await expect(
      gmailActionHandlers.update_draft({ draftId: "draft-1", ...input }, test.context),
    ).rejects.toMatchObject({ status: 400 });
    expect(test.raw()).toBe(original);
    expect(test.requests.some((request) => request.init.method === "PUT")).toBe(false);
  });

  it("compares decoded Unicode reply subjects when editing a draft", async () => {
    const test = fixture(
      encodeMimeMessage({
        to: ["reader@example.com"],
        subject: "Re: 项目进度",
        body: "Reply body",
        inReplyTo: "<original@example.com>",
        references: "<original@example.com>",
      }),
    );
    await gmailActionHandlers.update_draft({ draftId: "draft-1", subject: "Re: Re: 项目进度" }, test.context);
    expect((await simpleParser(Buffer.from(test.raw(), "base64url"))).subject).toBe("Re: Re: 项目进度");
  });

  it("rejects a subject that decodes a literal encoded-word from the reply target", async () => {
    const test = fixture();
    const subject = "说明 =?UTF-8?B?VG9waWM=?=";
    test.target.payload!.headers!.find((header) => header.name === "Subject")!.value =
      `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
    await expect(
      gmailActionHandlers.create_email_draft(
        { replyToMessageId: "original", subject: "Re: 说明 Topic", body: "Reply" },
        test.context,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(test.requests.every((request) => !request.init.method)).toBe(true);
  });

  it.each(["=?UTF-8?B?VG9waWM=?=", "=?unknown?B?VG9waWM=?="])(
    "preserves literal encoded-word syntax through reply draft creation and updates: %s",
    async (marker) => {
      const test = fixture();
      const subject = `说明 ${marker}`;
      test.target.payload!.headers!.find((header) => header.name === "Subject")!.value =
        `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
      await gmailActionHandlers.create_email_draft({ replyToMessageId: "original", body: "Reply" }, test.context);
      expect((await simpleParser(Buffer.from(test.raw(), "base64url"))).subject).toBe(`Re: ${subject}`);
      await gmailActionHandlers.update_draft({ draftId: "draft-1", subject: `Re: Re: ${subject}` }, test.context);
      expect((await simpleParser(Buffer.from(test.raw(), "base64url"))).subject).toBe(`Re: Re: ${subject}`);
      const original = test.raw();
      const writeCount = test.requests.filter((request) => request.init.method === "PUT").length;
      await expect(
        gmailActionHandlers.update_draft({ draftId: "draft-1", subject: "Re: 说明 Topic" }, test.context),
      ).rejects.toMatchObject({ status: 400 });
      expect(test.raw()).toBe(original);
      expect(test.requests.filter((request) => request.init.method === "PUT")).toHaveLength(writeCount);
    },
  );

  it.each([
    { name: "Cc", input: { cc: "copy@example.com" }, subject: "=?ISO-2022-KR?B?VG9waWM=?=", body: "Original body" },
    { name: "body", input: { body: "Changed body" }, subject: "=?ISO-2022-KR?B?VG9waWM=?=", body: "Changed body" },
    {
      name: "subject",
      input: { subject: "Replacement subject" },
      subject: "Replacement subject",
      body: "Original body",
    },
    { name: "reply target", input: { replyToMessageId: "original" }, subject: "Re: Topic", body: "Original body" },
  ])(
    "updates an ordinary draft's $name without decoding its unsupported old subject charset",
    async ({ input, subject, body }) => {
      const original =
        "To: reader@example.com\r\nSubject: =?ISO-2022-KR?B?VG9waWM=?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 7bit\r\n\r\nOriginal body";
      const test = fixture(Buffer.from(original).toString("base64url"));
      await gmailActionHandlers.update_draft({ draftId: "draft-1", ...input }, test.context);
      const updated = Buffer.from(test.raw(), "base64url").toString();
      expect(updated).toContain(`Subject: ${subject}\r\n`);
      expect((await simpleParser(Buffer.from(test.raw(), "base64url"))).text?.trim()).toBe(body);
      if (!Object.hasOwn(input, "body")) {
        expect(updated.split("\r\n\r\n").slice(1).join("\r\n\r\n")).toBe("Original body");
      }
    },
  );
});

describe("Gmail action ID contracts", () => {
  it.each([
    {
      name: "send_email",
      handler: gmailActionHandlers.send_email,
      input: { to: "reader@example.com", body: "New email" },
      expected: { messageId: "sent-1", threadId: "thread-1" },
    },
    {
      name: "reply_email",
      handler: gmailActionHandlers.reply_email,
      input: { messageId: "original", threadId: "thread-1", body: "Reply" },
      expected: { messageId: "sent-1", threadId: "thread-1" },
    },
    {
      name: "reply_to_thread",
      handler: gmailActionHandlers.reply_to_thread,
      input: { threadId: "thread-1", body: "Reply" },
      expected: { messageId: "sent-1", threadId: "thread-1" },
    },
    {
      name: "create_draft",
      handler: gmailActionHandlers.create_draft,
      input: { to: "reader@example.com", subject: "Draft topic", body: "Draft" },
      expected: { draftId: "draft-1", messageId: "message-1", threadId: "thread-1" },
    },
  ])(
    "returns actual Gmail IDs from $name and matches its output schema",
    async ({ name, handler, input, expected }) => {
      const test = fixture();
      const output = await handler(input, test.context);
      expect(output).toEqual(expected);
      const action = gmailActions.find((action) => action.name === name)!;
      expect(new Validator(action.outputSchema).validate(output)).toMatchObject({ valid: true });
    },
  );

  it.each([
    {
      name: "send_email",
      handler: gmailActionHandlers.send_email,
      input: { to: "reader@example.com", body: "New email" },
    },
    {
      name: "reply_email",
      handler: gmailActionHandlers.reply_email,
      input: { messageId: "original", threadId: "thread-1", body: "Reply" },
    },
    {
      name: "reply_to_thread",
      handler: gmailActionHandlers.reply_to_thread,
      input: { threadId: "thread-1", body: "Reply" },
    },
  ])("omits an unavailable thread ID instead of guessing it through $name", async ({ name, handler, input }) => {
    const test = fixture();
    test.responseIds.threadId = false;
    const output = JSON.parse(JSON.stringify(await handler(input, test.context)));
    expect(output).toEqual({ messageId: "sent-1" });
    const action = gmailActions.find((action) => action.name === name)!;
    expect(new Validator(action.outputSchema).validate(output)).toMatchObject({ valid: true });
  });

  it("keeps the nullable thread ID contract when Gmail omits it from send_draft", async () => {
    const test = fixture();
    test.responseIds.threadId = false;
    const output = await gmailActionHandlers.send_draft({ draftId: "draft-1" }, test.context);
    expect(output).toEqual({ messageId: "sent-1", threadId: null });
    const action = gmailActions.find((action) => action.name === "send_draft")!;
    expect(new Validator(action.outputSchema).validate(output)).toMatchObject({ valid: true });
  });

  it.each([
    {
      name: "create_draft",
      handler: gmailActionHandlers.create_draft,
      input: { to: "reader@example.com", subject: "Draft topic", body: "Draft" },
    },
    { name: "create_email_draft", handler: gmailActionHandlers.create_email_draft, input: { body: "Draft" } },
    {
      name: "update_draft",
      handler: gmailActionHandlers.update_draft,
      input: { draftId: "draft-1", subject: "Edited" },
    },
  ])("omits absent message and thread IDs through $name", async ({ name, handler, input }) => {
    const test = fixture(encodeMimeMessage({ to: ["reader@example.com"], subject: "Topic", body: "Draft body" }));
    test.responseIds.messageId = false;
    test.responseIds.threadId = false;
    const output = JSON.parse(JSON.stringify(await handler(input, test.context)));
    expect(output).toEqual({ draftId: "draft-1" });
    const action = gmailActions.find((action) => action.name === name)!;
    expect(new Validator(action.outputSchema).validate(output)).toMatchObject({ valid: true });
  });

  it.each([false, true])("validates list_drafts output with verbose=%s", async (verbose) => {
    const test = fixture();
    const output = JSON.parse(JSON.stringify(await gmailActionHandlers.list_drafts({ verbose }, test.context)));
    expect(output).toMatchObject({
      drafts: [{ id: "draft-1", message: { messageId: "message-0", threadId: "thread-1" } }],
      nextPageToken: "next-page",
    });
    const action = gmailActions.find((action) => action.name === "list_drafts")!;
    expect(new Validator(action.outputSchema).validate(output)).toMatchObject({ valid: true });
    if (verbose) {
      expect(output.drafts[0].message.subject).toBe("Topic");
    } else {
      expect(output.drafts[0].message).toEqual({ messageId: "message-0", threadId: "thread-1" });
      expect(test.requests).toHaveLength(1);
    }
  });
});
