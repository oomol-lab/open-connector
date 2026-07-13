import type { MailProtocol } from "./protocol.ts";

import { describe, expect, it, vi } from "vitest";
import { neteaseMailRuntimeConfig } from "../../providers/netease_mail/config.ts";
import { qqMailRuntimeConfig } from "../../providers/qq_mail/config.ts";
import { MailProtocolError } from "./errors.ts";
import { executeMailAction, mapProtocolError } from "./runtime.ts";

const authorizationCode = "1234567890123456";

describe("IMAP/SMTP mail runtime", () => {
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
