import type { MailProtocol } from "./protocol.ts";

import { describe, expect, it, vi } from "vitest";
import { neteaseMailRuntimeConfig } from "../../providers/netease_mail/config.ts";
import { qqMailRuntimeConfig } from "../../providers/qq_mail/config.ts";
import { createMailActions } from "./actions.ts";
import { MailProtocolError } from "./errors.ts";
import { createMailProtocol } from "./protocol.ts";
import { executeMailAction, mapProtocolError } from "./runtime.ts";
import { sanitizeTempFileName } from "./temp-files.ts";

const authorizationCode = "1234567890123456";

describe("IMAP/SMTP mail runtime", () => {
  it("does not expose internal mail capabilities as provider scopes", () => {
    expect(createMailActions("mail_test", "Mail Test").every((action) => action.requiredScopes.length === 0)).toBe(
      true,
    );
  });

  it.each([
    ["user@163.com", "imap.163.com", "smtp.163.com"],
    ["user@126.com", "imap.126.com", "smtp.126.com"],
    ["user@yeah.net", "imap.yeah.net", "smtp.yeah.net"],
  ])("selects fixed NetEase Mail servers for %s", (email, imapHost, smtpHost) => {
    expect(neteaseMailRuntimeConfig.readCredential({ email, authorizationCode })).toEqual({
      email,
      authorizationCode,
      imapHost,
      smtpHost,
    });
  });

  it("executes QQ Mail actions through the shared runtime with fixed servers", async () => {
    const listFolders = vi.fn(async () => []);
    const protocol = { listFolders } as unknown as MailProtocol;

    await expect(
      executeMailAction(
        "list_folders",
        {},
        {
          values: { email: "user@qq.com", authorizationCode },
          fetcher: fetch,
          protocol,
          config: qqMailRuntimeConfig,
        },
      ),
    ).resolves.toEqual({ folders: [] });

    expect(listFolders).toHaveBeenCalledWith({
      email: "user@qq.com",
      authorizationCode,
      imapHost: "imap.qq.com",
      smtpHost: "smtp.qq.com",
    });
  });

  it.each(["@qq.com", "user@", "user@@qq.com", "user name@qq.com"])(
    "rejects the invalid QQ Mail address %s",
    (email) => {
      expect(() => qqMailRuntimeConfig.readCredential({ email, authorizationCode })).toThrow(
        "QQ Mail email must be a valid email address.",
      );
    },
  );

  it("rejects inherited object property names as NetEase Mail domains", () => {
    expect(() =>
      neteaseMailRuntimeConfig.readCredential({
        email: "user@constructor",
        authorizationCode,
      }),
    ).toThrow("NetEase Mail supports only 163.com, 126.com, and yeah.net personal accounts.");
  });

  it("preserves Reply-To addresses fetched from the IMAP envelope", async () => {
    const protocol = createMailProtocol(
      { displayName: "Mail Test", attachmentFallbackPrefix: "mail-test" },
      {
        createImapClient: () => ({
          connect: vi.fn(async () => undefined),
          logout: vi.fn(async () => undefined),
          list: vi.fn(async () => []),
          mailboxOpen: vi.fn(async () => undefined),
          fetchOne: vi.fn(async () => ({
            uid: 1,
            envelope: {
              from: [{ address: "author@example.com" }],
              replyTo: [{ address: "reply@example.com" }],
              to: [{ address: "user@qq.com" }],
            },
            flags: new Set<string>(),
            size: 100,
          })),
        }),
      },
    );

    await expect(
      protocol.fetchMessage(
        qqMailRuntimeConfig.readCredential({ email: "user@qq.com", authorizationCode }),
        "INBOX",
        1,
        {
          peek: true,
          maxBytes: 1024,
          skipAttachmentBodies: true,
        },
      ),
    ).resolves.toMatchObject({
      replyTo: [{ name: null, email: "reply@example.com" }],
    });
  });

  it("prefers Reply-To over From when replying", async () => {
    const sendMail = vi.fn(async () => ({ messageId: null, accepted: [], rejected: [], response: "ok" }));
    const protocol = {
      fetchMessage: vi.fn(async () => ({
        summary: {
          uid: 1,
          messageId: "message-id",
          subject: "Subject",
          from: { name: null, email: "author@example.com" },
          to: [{ name: null, email: "user@qq.com" }],
          date: null,
          flags: [],
          seen: false,
          hasAttachments: false,
          size: 100,
        },
        cc: [],
        replyTo: [{ name: null, email: "reply@example.com" }],
        text: "Original message",
        html: null,
        attachments: [],
        truncated: false,
      })),
      sendMail,
    } as unknown as MailProtocol;

    await executeMailAction(
      "reply_email",
      { uid: 1, text: "Reply" },
      {
        values: { email: "user@qq.com", authorizationCode },
        fetcher: fetch,
        protocol,
        config: qqMailRuntimeConfig,
      },
    );

    expect(sendMail).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ to: ["reply@example.com"] }));
  });

  it("bounds temporary filenames while preserving a short extension", () => {
    const name = sanitizeTempFileName(`${"a".repeat(300)}.pdf`);

    expect(name).toHaveLength(200);
    expect(name.endsWith(".pdf")).toBe(true);
  });

  it("uses each provider's connection guidance for authentication errors", () => {
    const error = new MailProtocolError("auth", "authentication failed");

    expect(mapProtocolError(error, "connect", qqMailRuntimeConfig).message).toBe(
      qqMailRuntimeConfig.connectAuthMessage,
    );
    expect(mapProtocolError(error, "connect", neteaseMailRuntimeConfig).message).toBe(
      neteaseMailRuntimeConfig.connectAuthMessage,
    );
  });
});
