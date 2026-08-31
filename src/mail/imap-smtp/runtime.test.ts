import type { MailActionName } from "./actions.ts";
import type { MailProtocol } from "./protocol.ts";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { neteaseMailRuntimeConfig } from "../../providers/netease_mail/config.ts";
import { ProviderRequestError } from "../../providers/provider-runtime.ts";
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

  it("fails a mail action that has no dispatch branch instead of reporting an empty success", async () => {
    const error = await executeMailAction(
      "archive_email" as MailActionName,
      {},
      {
        values: { email: "user@qq.com", authorizationCode },
        fetcher: fetch,
        protocol: {} as unknown as MailProtocol,
        config: qqMailRuntimeConfig,
      },
    ).then(
      () => undefined,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ProviderRequestError);
    expect((error as ProviderRequestError).status).toBe(500);
    expect((error as ProviderRequestError).message).toBe("Unsupported mail action: archive_email");
  });

  // The case above only proves the default clause throws. What keeps a new mail
  // action from ever reaching it is the `never` assignment, which the compiler
  // rejects when a name skips the switch, and no test can observe a compile
  // error the repo has no type-test harness for. Read the clause instead.
  it("keeps the compile-time exhaustiveness guard on the mail dispatch switch", () => {
    const source = readFileSync(fileURLToPath(new URL("runtime.ts", import.meta.url)), "utf8");

    expect(
      source,
      "executeMailAction's default clause must assign actionName to a never binding; without it a mail action added without a case compiles and returns an empty success",
    ).toMatch(/default:[\s\S]{0,600}?:\s*never\s*=\s*actionName;/);
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
        { maxBytes: 1024 },
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
        references: [],
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

  it.each([
    [["<a@example.com>", "<b@example.com>"], "<a@example.com> <b@example.com> <message-id>"],
    [[], "<message-id>"],
    [["<a@example.com>", "<message-id>"], "<a@example.com> <message-id>"],
  ])("continues the thread by appending the parent to its References chain", async (references, expected) => {
    const sendMail = vi.fn(async () => ({ messageId: null, accepted: [], rejected: [], response: "ok" }));
    const protocol = {
      fetchMessage: vi.fn(async () => ({
        summary: {
          uid: 1,
          messageId: "<message-id>",
          subject: "Subject",
          from: { name: null, email: "author@example.com" },
          to: [{ name: null, email: "user@qq.com" }],
          date: null,
          flags: [],
          seen: false,
          hasAttachments: false,
          size: 100,
        },
        references,
        cc: [],
        replyTo: [],
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
      { values: { email: "user@qq.com", authorizationCode }, fetcher: fetch, protocol, config: qqMailRuntimeConfig },
    );

    expect(sendMail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ inReplyTo: "<message-id>", references: expected }),
    );
  });

  it.each([
    {
      name: "reads a folded References chain",
      headers: "References: <a@example.com>\r\n <b@example.com>\r\n\r\n",
      expected: ["<a@example.com>", "<b@example.com>"],
    },
    {
      name: "falls back to a single In-Reply-To value",
      headers: "In-Reply-To: <a@example.com>\r\n\r\n",
      expected: ["<a@example.com>"],
    },
    {
      name: "does not use multiple In-Reply-To values as a fallback",
      headers: "In-Reply-To: <a@example.com> <b@example.com>\r\n\r\n",
      expected: [],
    },
  ])("$name from the fetched message headers", async ({ headers, expected }) => {
    const fetchOne = vi.fn(async () => ({
      uid: 1,
      envelope: { from: [{ address: "author@example.com" }], to: [{ address: "user@qq.com" }] },
      flags: new Set<string>(),
      size: 100,
      headers: Buffer.from(headers),
    }));
    const protocol = createMailProtocol(
      { displayName: "Mail Test", attachmentFallbackPrefix: "mail-test" },
      {
        createImapClient: () => ({
          connect: vi.fn(async () => undefined),
          logout: vi.fn(async () => undefined),
          list: vi.fn(async () => []),
          mailboxOpen: vi.fn(async () => undefined),
          fetchOne,
        }),
      },
    );

    await expect(
      protocol.fetchMessage(
        qqMailRuntimeConfig.readCredential({ email: "user@qq.com", authorizationCode }),
        "INBOX",
        1,
        { maxBytes: 1024 },
      ),
    ).resolves.toMatchObject({ references: expected });

    expect(fetchOne).toHaveBeenCalledWith(1, expect.objectContaining({ headers: ["references", "in-reply-to"] }), {
      uid: true,
    });
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
