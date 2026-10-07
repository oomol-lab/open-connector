import type { GmailMessagePart, GmailMessageResource } from "./message.ts";

import { describe, expect, it } from "vitest";
import { extractBodyContent, normalizeGmailMessage, resolveReplyHeaders, summarizeGmailMessage } from "./message.ts";

const headers = [
  { name: "Subject", value: "Hello" },
  { name: "From", value: "alice@example.com" },
  { name: "To", value: "bob@example.com" },
];

describe("Gmail reply headers", () => {
  const parent: GmailMessageResource = {
    id: "gmail-resource-id",
    threadId: "thread",
    payload: {
      headers: [
        { name: "Subject", value: "Topic" },
        { name: "From", value: "sender@example.com" },
        { name: "Message-ID", value: "<parent@example.com>" },
      ],
    },
  };

  it("appends the parent's RFC Message-ID to the complete References chain", () => {
    const reply = resolveReplyHeaders({
      ...parent,
      payload: {
        headers: [
          ...parent.payload!.headers!,
          { name: "References", value: "<root@example.com> <previous@example.com>" },
        ],
      },
    });
    expect(reply).toEqual({
      subject: "Re: Topic",
      to: "sender@example.com",
      inReplyTo: "<parent@example.com>",
      references: "<root@example.com> <previous@example.com> <parent@example.com>",
    });
  });

  it("uses a single parent In-Reply-To as the References fallback", () => {
    const reply = resolveReplyHeaders({
      ...parent,
      payload: {
        headers: [...parent.payload!.headers!, { name: "In-Reply-To", value: "<previous@example.com>" }],
      },
    });
    expect(reply.references).toBe("<previous@example.com> <parent@example.com>");
    expect(reply.inReplyTo).toBe("<parent@example.com>");
  });

  it("does not use multiple parent In-Reply-To identifiers as a References fallback", () => {
    const reply = resolveReplyHeaders({
      ...parent,
      payload: {
        headers: [
          ...parent.payload!.headers!,
          { name: "In-Reply-To", value: "<first@example.com> <second@example.com>" },
        ],
      },
    });
    expect(reply.references).toBe("<parent@example.com>");
  });

  it.each([
    { name: "trailing", value: "<parent@example.com> (note <ignored@example.com>)", expected: "<parent@example.com>" },
    {
      name: "nested",
      value: "(outer (nested <ignored@example.com>) tail) <parent@example.com>",
      expected: "<parent@example.com>",
    },
    {
      name: "escaped",
      value: "<parent@example.com> (escaped \\) still comment <ignored@example.com>)",
      expected: "<parent@example.com>",
    },
    {
      name: "quoted local part",
      value: '<"parent(comment)"@example.com> (note <ignored@example.com>)',
      expected: '<"parent(comment)"@example.com>',
    },
    {
      name: "quoted angle character",
      value: '<"a>b(c)"@example.com> (note <ignored@example.com>)',
      expected: '<"a>b(c)"@example.com>',
    },
    {
      name: "domain literal",
      value: "<parent@[a>b(c)]> (note <ignored@example.com>)",
      expected: "<parent@[a>b(c)]>",
    },
  ])("ignores identifiers inside $name Message-ID comments", ({ value, expected }) => {
    const reply = resolveReplyHeaders({
      ...parent,
      payload: {
        headers: [
          ...parent.payload!.headers!.filter((header) => header.name !== "Message-ID"),
          { name: "Message-ID", value },
          { name: "References", value: "<root@example.com> (note <ignored@example.com>)" },
        ],
      },
    });
    expect(reply.inReplyTo).toBe(expected);
    expect(reply.references).toBe(`<root@example.com> ${expected}`);
  });

  it.each([
    { name: "quoted spaces", value: '<"parent name"@example.com>', expected: '<"parent name"@example.com>' },
    { name: "quoted tabs", value: '<"parent\tname"@example.com>', expected: '<"parent\tname"@example.com>' },
    {
      name: "structural whitespace",
      value: "< \tparent \t. name \t@ example \t. com \t>",
      expected: "<parent.name@example.com>",
    },
    {
      name: "comments around words and separators",
      value:
        "< (one <ignored@example.com>) parent (two) . (three) name (four) @ (five) example (six) . (seven) com (eight) >",
      expected: "<parent.name@example.com>",
    },
    {
      name: "nested and escaped internal comments",
      value: "<parent (outer (inner <ignored@example.com>) escaped \\) comment)@example.com>",
      expected: "<parent@example.com>",
    },
    {
      name: "mixed atom and quoted words",
      value: '< parent (one) . "quoted part" (two) @ example.com >',
      expected: '<parent."quoted part"@example.com>',
    },
    {
      name: "folded quoted whitespace",
      value: '<"parent\r\n \tname"@example.com>',
      expected: '<"parent \tname"@example.com>',
    },
    {
      name: "folded structural whitespace",
      value: "<parent\r\n\t@\r\n\texample.com>",
      expected: "<parent@example.com>",
    },
    {
      name: "literal whitespace",
      value: "<parent@[ a \t literal ]>",
      expected: "<parent@[ a \t literal ]>",
    },
  ])("accepts obsolete Message-ID $name without changing protected whitespace", ({ value, expected }) => {
    const reply = resolveReplyHeaders({
      ...parent,
      payload: {
        headers: [
          ...parent.payload!.headers!.filter((header) => header.name !== "Message-ID"),
          { name: "Message-ID", value },
        ],
      },
    });
    expect(reply.inReplyTo).toBe(expected);
    expect(reply.references).toBe(expected);
  });

  it("keeps obsolete References ancestors while normalizing only structural CFWS", () => {
    const reply = resolveReplyHeaders({
      ...parent,
      payload: {
        headers: [
          ...parent.payload!.headers!,
          {
            name: "References",
            value:
              '< (note <ignored@example.com>) "first root" \t @ [ root \t literal ] > <previous (note) @ example . com>',
          },
        ],
      },
    });
    expect(reply.references).toBe('<"first root"@[ root \t literal ]> <previous@example.com> <parent@example.com>');
  });

  it("ignores comment-contained identifiers when falling back to a single In-Reply-To", () => {
    const reply = resolveReplyHeaders({
      ...parent,
      payload: {
        headers: [
          ...parent.payload!.headers!,
          { name: "References", value: "(note <ignored@example.com>)" },
          { name: "In-Reply-To", value: "<previous@example.com> (note <ignored@example.com>)" },
        ],
      },
    });
    expect(reply.references).toBe("<previous@example.com> <parent@example.com>");
  });

  it("prefers Reply-To while preserving a Unicode display name containing a comma", () => {
    const reply = resolveReplyHeaders({
      ...parent,
      payload: {
        headers: [
          ...parent.payload!.headers!,
          { name: "Reply-To", value: '"张三, 研发" <reply@example.com>, second@example.com' },
        ],
      },
    });
    expect(reply.to).toBe('"张三, 研发" <reply@example.com>');
  });

  it.each([
    undefined,
    "gmail-resource-id",
    "<first@example.com> <second@example.com>",
    "(note <ignored@example.com>)",
    "<parent name@example.com>",
    "<parent (note) name@example.com>",
    "<parent..name@example.com>",
    "<parent.@example.com>",
    "<.parent@example.com>",
    '<"unterminated@example.com>',
    "<parent@>",
    "<@example.com>",
  ])("refuses a missing or unusable Message-ID instead of substituting a Gmail resource ID: %s", (value) => {
    const resource: GmailMessageResource = {
      ...parent,
      payload: {
        headers: parent.payload!.headers!.filter((header) => header.name !== "Message-ID"),
      },
    };
    if (value !== undefined) resource.payload!.headers!.push({ name: "Message-ID", value });
    expect(() => resolveReplyHeaders(resource)).toThrow();
  });
});

describe("summarizeGmailMessage", () => {
  it("keeps historyId, internalDate, sizeEstimate and snippet when Gmail sends them", () => {
    const summary = summarizeGmailMessage({
      id: "m1",
      threadId: "t1",
      labelIds: ["INBOX"],
      historyId: "12345",
      internalDate: "1758844800000",
      sizeEstimate: 4321,
      snippet: "Hi Bob",
      payload: { headers },
    });
    expect(summary).toMatchObject({
      messageId: "m1",
      threadId: "t1",
      labelIds: ["INBOX"],
      subject: "Hello",
      historyId: "12345",
      internalDate: "1758844800000",
      sizeEstimate: 4321,
      snippet: "Hi Bob",
    });
    expect(normalizeGmailMessage({ id: "m1", threadId: "t1", historyId: "12345", payload: { headers } })).toMatchObject(
      {
        historyId: "12345",
      },
    );
  });

  it("leaves the optional fields undefined when Gmail does not send them", () => {
    expect(summarizeGmailMessage({ id: "m2", threadId: "t2", payload: { headers } })).toEqual({
      messageId: "m2",
      threadId: "t2",
      labelIds: [],
      subject: "Hello",
      sender: "alice@example.com",
      to: "bob@example.com",
      messageTimestamp: "",
    });
  });
});

describe("Gmail MIME normalization", () => {
  it("recognizes a top-level HTML body that retains the former related root Content-ID", () => {
    const html = "<p>Body after clearing related attachments</p>";
    const payload: GmailMessagePart = {
      mimeType: "text/html",
      headers: [
        { name: "Content-ID", value: "<body@example.com>" },
        { name: "Content-Disposition", value: "inline" },
      ],
      body: { data: Buffer.from(html).toString("base64url") },
    };
    const message = normalizeGmailMessage({ id: "message", threadId: "thread", payload });

    expect(extractBodyContent(payload)).toEqual({ body: html, isHtml: true });
    expect(message.messageText).toBe(html);
    expect(message.attachmentList).toEqual([]);
  });

  it("lists an unnamed top-level image CID as an inline resource", () => {
    const message = normalizeGmailMessage({
      id: "message",
      threadId: "thread",
      payload: {
        partId: "0",
        mimeType: "image/png",
        headers: [{ name: "Content-ID", value: "<logo@example.com>" }],
        body: { attachmentId: "logo-bytes", size: 42 },
      },
    });

    expect(message.messageText).toBe("");
    expect(message.attachmentList).toEqual([
      {
        attachmentId: "logo-bytes",
        filename: "",
        mimeType: "image/png",
        size: 42,
        partId: "0",
        contentId: "logo@example.com",
        disposition: null,
      },
    ]);
  });

  it("keeps a former related root as an HTML alternative after clearing its files", () => {
    const html = "<p>HTML alternative after clearing inline images</p>";
    const message = normalizeGmailMessage({
      id: "message",
      threadId: "thread",
      payload: {
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/plain", body: { data: Buffer.from("Plain fallback").toString("base64url") } },
          {
            mimeType: "text/html",
            headers: [{ name: "Content-ID", value: "<body@example.com>" }],
            body: { data: Buffer.from(html).toString("base64url") },
          },
        ],
      },
    });

    expect(message.messageText).toBe(html);
    expect(message.attachmentList).toEqual([]);
  });

  it.each(["text/plain", "text/html", "multipart/alternative"])(
    "recognizes the first mixed %s body with CID and keeps later CID resources as attachments",
    (rootType) => {
      const body = rootType === "text/plain" ? "Plain message body" : "<p>HTML message body</p>";
      const root: GmailMessagePart = {
        mimeType: rootType,
        headers: [{ name: "Content-ID", value: "<body@example.com>" }],
        body: rootType === "multipart/alternative" ? undefined : { data: Buffer.from(body).toString("base64url") },
        parts:
          rootType === "multipart/alternative"
            ? [
                { mimeType: "text/plain", body: { data: Buffer.from("Plain fallback").toString("base64url") } },
                {
                  mimeType: "text/html",
                  headers: [{ name: "Content-ID", value: "<html-body@example.com>" }],
                  body: { data: Buffer.from(body).toString("base64url") },
                },
              ]
            : undefined,
      };
      const message = normalizeGmailMessage({
        id: "message",
        threadId: "thread",
        payload: {
          mimeType: "multipart/mixed",
          parts: [
            root,
            { filename: "report.pdf", mimeType: "application/pdf", body: { attachmentId: "pdf-bytes" } },
            {
              mimeType: "text/html",
              headers: [{ name: "Content-ID", value: "<html-resource@example.com>" }],
              body: { data: Buffer.from("Attached HTML resource").toString("base64url") },
            },
          ],
        },
      });

      expect(message.messageText).toBe(body);
      expect(message.attachmentList.map((part) => [part.filename, part.contentId])).toEqual([
        ["report.pdf", null],
        ["", "html-resource@example.com"],
      ]);
    },
  );

  it("honors explicit attachment markers inside an alternative container", () => {
    const message = normalizeGmailMessage({
      id: "message",
      threadId: "thread",
      payload: {
        mimeType: "multipart/alternative",
        parts: [
          {
            mimeType: "text/html",
            filename: "report.html",
            body: { data: Buffer.from("Named HTML attachment").toString("base64url") },
          },
          {
            mimeType: "text/html",
            headers: [
              { name: "Content-ID", value: "<attached-html@example.com>" },
              { name: "Content-Disposition", value: "attachment" },
            ],
            body: { data: Buffer.from("Explicit HTML attachment").toString("base64url") },
          },
          { mimeType: "text/plain", body: { data: Buffer.from("Actual plain body").toString("base64url") } },
        ],
      },
    });

    expect(message.messageText).toBe("Actual plain body");
    expect(message.attachmentList).toHaveLength(2);
  });

  it.each([
    { rootType: "text/html", selection: "default" },
    { rootType: "text/html", selection: "start" },
    { rootType: "multipart/alternative", selection: "default" },
    { rootType: "multipart/alternative", selection: "start" },
  ])("recognizes a $rootType related root with Content-ID selected by $selection", ({ rootType, selection }) => {
    const html = '<p>Actual body <img src="cid:logo@example.com"></p>';
    const root: GmailMessagePart = {
      partId: "body",
      mimeType: rootType,
      headers: [{ name: "Content-ID", value: "<body@example.com>" }],
      body: rootType === "text/html" ? { data: Buffer.from(html).toString("base64url") } : undefined,
      parts:
        rootType === "multipart/alternative"
          ? [
              { mimeType: "text/plain", body: { data: Buffer.from("Plain fallback").toString("base64url") } },
              { mimeType: "text/html", body: { data: Buffer.from(html).toString("base64url") } },
            ]
          : undefined,
    };
    const image: GmailMessagePart = {
      partId: "image",
      mimeType: "image/png",
      headers: [{ name: "Content-ID", value: "<logo@example.com>" }],
      body: { attachmentId: "logo-bytes", size: 42 },
    };
    const htmlResource: GmailMessagePart = {
      partId: "html-resource",
      mimeType: "text/html",
      headers: [{ name: "Content-ID", value: "<resource@example.com>" }],
      body: { data: Buffer.from("HTML resource is not the message body").toString("base64url") },
    };
    const message = normalizeGmailMessage({
      id: "message",
      threadId: "thread",
      payload: {
        mimeType: "multipart/related",
        headers: [
          {
            name: "Content-Type",
            value:
              selection === "start"
                ? 'multipart/related; boundary="boundary; start=<wrong>";\r\n START="<body@example.com>"'
                : 'multipart/related; boundary="boundary; start=<wrong>"',
          },
        ],
        parts: selection === "start" ? [htmlResource, image, root] : [root, image, htmlResource],
      },
    });

    expect(message.messageText).toBe(html);
    expect(message.attachmentList.map((part) => part.contentId).sort()).toEqual([
      "logo@example.com",
      "resource@example.com",
    ]);
    expect(message.attachmentList).toHaveLength(2);
  });

  it("prefers HTML across nested body alternatives", () => {
    const message = normalizeGmailMessage({
      id: "message",
      threadId: "thread",
      payload: {
        mimeType: "multipart/mixed",
        headers,
        parts: [
          {
            mimeType: "multipart/alternative",
            parts: [
              { mimeType: "text/plain", body: { data: Buffer.from("Plain fallback").toString("base64url") } },
              {
                mimeType: "multipart/related",
                parts: [
                  {
                    mimeType: "text/html",
                    body: { data: Buffer.from('<p>Hello <img src="cid:logo@example.com"></p>').toString("base64url") },
                  },
                  {
                    mimeType: "image/png",
                    headers: [{ name: "Content-ID", value: "<logo@example.com>" }],
                    body: { attachmentId: "image-bytes", size: 42 },
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(message.messageText).toBe('<p>Hello <img src="cid:logo@example.com"></p>');
    expect(message.preview.body).toBe(message.messageText);
    expect(message.attachmentList).toHaveLength(1);
  });

  it("does not extract named, CID, or explicitly attached text as the message body", () => {
    const message = normalizeGmailMessage({
      id: "message",
      threadId: "thread",
      payload: {
        mimeType: "multipart/mixed",
        parts: [
          {
            filename: "report.html",
            mimeType: "text/html",
            body: { data: Buffer.from("Named HTML attachment").toString("base64url") },
          },
          {
            mimeType: "text/html",
            headers: [{ name: "Content-ID", value: "<attached-html>" }],
            body: { data: Buffer.from("CID HTML attachment").toString("base64url") },
          },
          {
            mimeType: "text/html",
            headers: [{ name: "Content-Disposition", value: "attachment" }],
            body: { data: Buffer.from("Unnamed HTML attachment").toString("base64url") },
          },
          { mimeType: "text/plain", body: { data: Buffer.from("Actual message body").toString("base64url") } },
        ],
      },
    });

    expect(message.messageText).toBe("Actual message body");
    expect(message.attachmentList).toHaveLength(3);
  });

  it("includes unnamed inline and attachment parts with Content-ID and disposition metadata", () => {
    const message = normalizeGmailMessage({
      id: "message",
      threadId: "thread",
      payload: {
        mimeType: "multipart/mixed",
        parts: [
          {
            partId: "0.1",
            mimeType: "image/png",
            headers: [
              { name: "content-id", value: " <logo@example.com> " },
              { name: "content-disposition", value: 'INLINE; filename="logo.png"' },
            ],
            body: { attachmentId: "logo-bytes", size: 42 },
          },
          {
            partId: "1",
            filename: "report.pdf",
            mimeType: "application/pdf",
            body: { attachmentId: "pdf-bytes", size: 100 },
          },
          {
            partId: "2",
            mimeType: "image/jpeg",
            headers: [{ name: "Content-Disposition", value: "inline" }],
            body: { data: "AA", size: 1 },
          },
          {
            mimeType: "text/plain",
            headers: [{ name: "Content-Disposition", value: "attachment; creation-date=ignored" }],
            body: { data: "", size: 0 },
          },
          {
            mimeType: "image/gif",
            headers: [{ name: "Content-ID", value: "bare-id" }],
            body: { size: 3 },
          },
        ],
      },
    });

    expect(message.attachmentList).toEqual([
      {
        attachmentId: "logo-bytes",
        filename: "",
        mimeType: "image/png",
        size: 42,
        partId: "0.1",
        contentId: "logo@example.com",
        disposition: "inline",
      },
      {
        attachmentId: "pdf-bytes",
        filename: "report.pdf",
        mimeType: "application/pdf",
        size: 100,
        partId: "1",
        contentId: null,
        disposition: null,
      },
      {
        attachmentId: null,
        filename: "",
        mimeType: "image/jpeg",
        size: 1,
        partId: "2",
        contentId: null,
        disposition: "inline",
      },
      {
        attachmentId: null,
        filename: "",
        mimeType: "text/plain",
        size: 0,
        partId: null,
        contentId: null,
        disposition: "attachment",
      },
      {
        attachmentId: null,
        filename: "",
        mimeType: "image/gif",
        size: 3,
        partId: null,
        contentId: "bare-id",
        disposition: null,
      },
    ]);
  });

  it("keeps text marked inline as a body and recognizes an empty HTML alternative", () => {
    const inlineText = {
      mimeType: "text/plain",
      headers: [{ name: "Content-Disposition", value: "inline" }],
      body: { data: Buffer.from("Inline text body").toString("base64url") },
    };

    expect(extractBodyContent(inlineText)).toEqual({ body: "Inline text body", isHtml: false });
    expect(normalizeGmailMessage({ id: "message", threadId: "thread", payload: inlineText }).attachmentList).toEqual(
      [],
    );
    expect(
      extractBodyContent({
        mimeType: "multipart/alternative",
        parts: [inlineText, { mimeType: "text/html", body: { data: "" } }],
      }),
    ).toEqual({ body: "", isHtml: true });
  });
});
