import type { GmailMimeAttachment } from "./mime.ts";

import { simpleParser } from "mailparser";
import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { gmailMaxAttachmentBytes, gmailMaxAttachmentCount, gmailMaxMimeBytes } from "./limits.ts";
import { readGmailAttachments } from "./mime-attachments.ts";
import { encodeMimeMessage, updateMimeMessage } from "./mime.ts";

const logoBytes = Buffer.from([0, 255, 137, 80, 78, 71]);
const logo: GmailMimeAttachment = {
  mimeType: "image/png",
  contentId: "logo@example",
  disposition: "inline",
  contentBase64: logoBytes.toString("base64"),
};
const file: GmailMimeAttachment = {
  filename: '报告 "résumé".txt',
  mimeType: "text/plain",
  disposition: "attachment",
  contentBase64: Buffer.from("attachment text").toString("base64"),
};

function decoded(raw: string): Buffer {
  return Buffer.from(raw, "base64url");
}

function originalDraft(): string {
  const source = [
    "From: sender@example.com",
    "To: reader@example.com",
    "Cc: copy@example.com",
    "Bcc: hidden@example.com",
    "Subject: Original",
    "In-Reply-To: <previous@example.com>",
    "References: <root@example.com> <previous@example.com>",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="outer"',
    "",
    "outer preamble",
    "--outer",
    'Content-Type: multipart/alternative; boundary="alt"',
    "",
    "alternative preamble",
    "--alt",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    "original plain",
    "--alt",
    'Content-Type: multipart/related; type="text/html"; start="<body@example>"; boundary="related"',
    "",
    "related preamble",
    "--related",
    "Content-Type: image/png",
    "Content-ID: <logo@example>",
    "Content-Transfer-Encoding: base64",
    "",
    logo.contentBase64,
    "--related",
    "Content-Type: text/html; charset=UTF-8",
    "Content-ID: <body@example>",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    '<p>original HTML<img src=3D"cid:logo@example"></p>',
    "--related--",
    "related epilogue",
    "--alt--",
    "alternative epilogue",
    "--outer",
    "Content-Type: text/plain; charset=ISO-8859-1",
    'Content-Disposition: attachment; filename="legacy.txt"',
    "Content-Transfer-Encoding: 8bit",
    "",
    "caf\xe9\x00",
    "--outer--",
    "outer epilogue",
  ].join("\r\n");
  return Buffer.from(source, "latin1").toString("base64url");
}

describe("Gmail MIME composition", () => {
  it("delivers Unicode filenames, CID bytes and exact body whitespace to an independent parser", async () => {
    const body = '  <p>你好<img src="cid:logo@example"></p>\n\n';
    const raw = encodeMimeMessage({
      to: ['"张三" <reader@example.com>'],
      subject: "测试主题 ".repeat(15),
      body,
      isHtml: true,
      attachments: [logo, file],
    });
    const mail = await simpleParser(decoded(raw), { skipImageLinks: true });
    expect(mail.subject).toBe("测试主题 ".repeat(15));
    expect(mail.to).toMatchObject({ value: [{ name: "张三", address: "reader@example.com" }] });
    expect(mail.html).toBe(body);
    expect(mail.attachments).toHaveLength(2);
    expect(mail.attachments.find((attachment) => attachment.cid === logo.contentId)?.content).toEqual(logoBytes);
    expect(mail.attachments.find((attachment) => attachment.filename === file.filename)?.content.toString()).toBe(
      "attachment text",
    );
    expect(decoded(raw).toString()).toContain('multipart/related; type="text/html"');
    expect(
      decoded(raw)
        .toString()
        .split("\r\n")
        .every((line) => Buffer.byteLength(line) <= 998),
    ).toBe(true);
  });

  it("encodes an empty message and an empty file without introducing a leading blank header", async () => {
    const raw = encodeMimeMessage({ to: [], attachments: [{ ...file, contentBase64: "" }] });
    expect(decoded(raw).toString()).toMatch(/^MIME-Version:/);
    const mail = await simpleParser(decoded(raw));
    expect(mail.attachments[0]?.content).toHaveLength(0);
  });

  it.each([
    { subject: "ok\r\nBcc: victim@example.com" },
    { to: ["ok@example.com\nBcc: victim@example.com"] },
    { inReplyTo: "<ok>\r\n Bcc: victim@example.com" },
    { attachments: [{ ...file, filename: "bad\nname" }] },
    { attachments: [{ ...file, mimeType: "image/png; name=bad" }] },
    { attachments: [{ ...logo, contentId: "logo\r\nBcc: victim" }] },
  ])("rejects header injection before building MIME %#", (patch) => {
    expect(() => encodeMimeMessage({ to: ["reader@example.com"], ...patch })).toThrow();
  });

  it("rejects oversized MIME before allocating the outer Base64 envelope", () => {
    expect(() => encodeMimeMessage({ to: [], body: "x".repeat(gmailMaxMimeBytes) })).toThrow(/exceeds/);
  });
});

describe("Gmail raw MIME draft edits", () => {
  it("preserves the complete original byte body, reply headers and alternatives on header edits", async () => {
    const original = originalDraft();
    const edited = updateMimeMessage(original, { subject: "", cc: [], bcc: [], to: ["next@example.com"] });
    const originalBody = decoded(original).subarray(decoded(original).indexOf("\r\n\r\n") + 4);
    const editedBody = decoded(edited).subarray(decoded(edited).indexOf("\r\n\r\n") + 4);
    expect(editedBody).toEqual(originalBody);
    const mail = await simpleParser(decoded(edited), { skipImageLinks: true });
    expect(mail.subject ?? "").toBe("");
    expect(decoded(edited).toString()).toContain("Subject: \r\n");
    expect(mail.cc).toBeUndefined();
    expect(mail.bcc).toBeUndefined();
    expect(mail.inReplyTo).toBe("<previous@example.com>");
    expect(mail.references).toEqual(["<root@example.com>", "<previous@example.com>"]);
    expect(mail.html).toContain("original HTML");
    expect(mail.text).toBe("original plain");
    expect(mail.attachments.find((attachment) => attachment.filename === "legacy.txt")?.content).toEqual(
      Buffer.from("caf\xe9\x00", "latin1"),
    );
  });

  it("replaces the body while retaining CID and binary file entities and all framing text", async () => {
    const body = ' \n<p>new<img src="cid:logo@example"></p>\n ';
    const edited = updateMimeMessage(originalDraft(), { body });
    const mail = await simpleParser(decoded(edited), { skipImageLinks: true, skipHtmlToText: true });
    expect(mail.html).toBe(body);
    expect(mail.text).toBeUndefined();
    expect(mail.attachments).toHaveLength(2);
    expect(mail.attachments.find((attachment) => attachment.cid === logo.contentId)?.content).toEqual(logoBytes);
    expect(mail.attachments.find((attachment) => attachment.filename === "legacy.txt")?.content).toEqual(
      Buffer.from("caf\xe9\x00", "latin1"),
    );
    for (const frame of [
      "outer preamble",
      "outer epilogue",
      "alternative preamble",
      "alternative epilogue",
      "related preamble",
      "related epilogue",
    ])
      expect(decoded(edited).toString()).toContain(frame);
  });

  it("clears or replaces all file parts while preserving untouched body alternatives", async () => {
    const clearedRaw = updateMimeMessage(originalDraft(), { attachments: [] });
    const cleared = await simpleParser(decoded(clearedRaw), {
      skipImageLinks: true,
    });
    expect(cleared.attachments).toEqual([]);
    expect(cleared.html).toContain("original HTML");
    expect(cleared.text).toBe("original plain");
    const editedAgain = await simpleParser(decoded(updateMimeMessage(clearedRaw, { body: "<p>next</p>" })));
    expect(editedAgain.html).toBe("<p>next</p>");
    expect(editedAgain.attachments).toEqual([]);
    const replaced = await simpleParser(decoded(updateMimeMessage(originalDraft(), { attachments: [file] })), {
      skipImageLinks: true,
    });
    expect(replaced.attachments).toHaveLength(1);
    expect(replaced.attachments[0]?.filename).toBe(file.filename);
  });

  it("can edit a CID body root again after clearing its related resources", async () => {
    const original = Buffer.from(
      'Subject: topic\r\nContent-Type: multipart/related; start="<body>"; boundary=r\r\n\r\n--r\r\nContent-Type: text/html\r\nContent-ID: <body>\r\n\r\n<p>original</p>\r\n--r\r\nContent-Type: image/png\r\nContent-ID: <logo>\r\n\r\nimage\r\n--r--\r\n',
    ).toString("base64url");
    const cleared = updateMimeMessage(original, { attachments: [] });
    const edited = updateMimeMessage(cleared, { body: "<p>next</p>" });
    const parsed = await simpleParser(decoded(edited));
    expect(parsed.html).toBe("<p>next</p>");
    expect(parsed.attachments).toEqual([]);
  });

  it("supports repeated edits of LF-only drafts and preserves the default plain body", async () => {
    const original = Buffer.from(
      "Subject: original\nTo: reader@example.com\nContent-Type: text/plain\n\nHello",
    ).toString("base64url");
    const edited = updateMimeMessage(original, { body: "next" });
    const editedAgain = updateMimeMessage(edited, { subject: "updated", body: "latest" });
    const parsed = await simpleParser(decoded(editedAgain));
    expect(parsed.subject).toBe("updated");
    expect(parsed.text).toBe("latest");
    const defaultBody = Buffer.from("Subject: original\r\n\r\nHello").toString("base64url");
    const cleared = await simpleParser(decoded(updateMimeMessage(defaultBody, { attachments: [] })));
    expect(cleared.text).toBe("Hello");
  });

  it.each(["Content-Type: text/plain\r\n", ""])("accepts empty and headerless body parts %#", async (headers) => {
    const body = headers ? "" : "Hello";
    const source = `Subject: original\r\nContent-Type: multipart/mixed; boundary=b\r\n\r\n--b\r\n${headers}\r\n${body}\r\n--b\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename=f\r\n\r\nx\r\n--b--\r\n`;
    const edited = updateMimeMessage(Buffer.from(source).toString("base64url"), { attachments: [] });
    expect((await simpleParser(decoded(edited))).attachments).toEqual([]);
  });

  it("keeps unknown MIME unchanged for header edits and rejects unsupported content changes", () => {
    const raw = Buffer.from(
      "Subject: original\r\nContent-Type: multipart/signed; boundary=s\r\n\r\nopaque signed data",
    ).toString("base64url");
    expect(decoded(updateMimeMessage(raw, { subject: "next" })).toString()).toContain("opaque signed data");
    expect(() => updateMimeMessage(raw, { body: "next" })).toThrow(/Cannot safely edit/);
    expect(() => updateMimeMessage(raw, { attachments: [] })).toThrow(/Cannot safely edit/);
    expect(() => updateMimeMessage(raw, { isHtml: true })).toThrow(/requires body/);
  });

  it("refuses to flatten alternative-scoped duplicate CIDs unless resources are explicitly replaced", async () => {
    const alternatives = ["AQID", "BAUG"]
      .map(
        (bytes, index) =>
          `--alt\r\nContent-Type: multipart/related; boundary=r${index}; type="text/html"\r\n\r\n--r${index}\r\nContent-Type: text/html\r\n\r\n<img src="cid:logo">\r\n--r${index}\r\nContent-Type: image/png\r\nContent-ID: <logo>\r\n\r\n${bytes}\r\n--r${index}--\r\n`,
      )
      .join("");
    const raw = Buffer.from(
      `Subject: topic\r\nContent-Type: multipart/alternative; boundary=alt\r\n\r\n${alternatives}--alt--\r\n`,
    ).toString("base64url");
    expect(() => updateMimeMessage(raw, { body: "new", isHtml: true })).toThrow(/duplicate Content-ID/);
    const spaced = decoded(raw).toString().replace("Content-ID: <logo>\r\n", "Content-ID: <logo> \r\n");
    expect(() => updateMimeMessage(Buffer.from(spaced).toString("base64url"), { body: "new" })).toThrow(
      /duplicate Content-ID/,
    );
    expect(() => updateMimeMessage(raw, { subject: "updated" })).not.toThrow();
    const replacement = await simpleParser(decoded(updateMimeMessage(raw, { body: "new", attachments: [] })));
    expect(replacement.attachments).toEqual([]);
    expect(replacement.html).toBe("new");
  });
});

describe("Gmail supplied attachment input", () => {
  it("resolves transit file content and honors outer metadata overrides", async () => {
    const stored = new File(["transit bytes"], "stored.txt", { type: "text/plain" });
    const files = {
      maxBytes: 1024,
      create: async () => {
        throw new Error("not used");
      },
      read: async () => ({ file: stored, name: stored.name, mimeType: stored.type, sizeBytes: stored.size }),
      delete: async () => false,
    };
    const attachments = await readGmailAttachments(
      [{ file: { fileId: "file-1" }, filename: "outer.txt", mimeType: "text/csv" }],
      { transitFiles: files },
    );
    expect(attachments).toEqual([
      {
        filename: "outer.txt",
        mimeType: "text/csv",
        contentBase64: Buffer.from("transit bytes").toString("base64"),
        contentId: undefined,
        disposition: "attachment",
      },
    ]);
  });

  it("accepts zero-byte content and rejects invalid sources, CID collisions, Base64 and limits", async () => {
    await expect(readGmailAttachments([{ contentBase64: "" }], {})).resolves.toMatchObject([
      { contentBase64: "", disposition: "attachment" },
    ]);
    for (const attachments of [
      [{ contentBase64: "???" }],
      [{ contentBase64: "AQ==", file: { fileId: "file" } }],
      [
        { contentBase64: "AQ==", contentId: "same" },
        { contentBase64: "Ag==", contentId: "same" },
      ],
      [{ contentBase64: "AQ==", disposition: "inline" }],
      Array.from({ length: gmailMaxAttachmentCount + 1 }, () => ({ contentBase64: "" })),
    ])
      await expect(readGmailAttachments(attachments, {})).rejects.toMatchObject({ status: 400 });
    await expect(
      readGmailAttachments([{ contentBase64: "A".repeat(Math.ceil(gmailMaxAttachmentBytes / 3) * 4 + 4) }], {}),
    ).rejects.toMatchObject({ status: 413 });
  });
});
