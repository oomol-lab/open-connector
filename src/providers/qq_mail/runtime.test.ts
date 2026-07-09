import type { QqMailProtocol } from "./protocol.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { validateQqMailCredential } from "./runtime.ts";

describe("qq mail runtime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("rejects credential validation immediately on Cloudflare Workers", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    const protocol = {
      validateImapCredential: vi.fn(async () => {}),
      validateSmtpCredential: vi.fn(async () => {}),
    } as unknown as QqMailProtocol;
    const loadProtocol = vi.fn(async () => protocol);

    await expect(
      validateQqMailCredential(
        {
          email: "user@qq.com",
          authorizationCode: "abcdefghijklmnop",
        },
        loadProtocol,
      ),
    ).rejects.toMatchObject({
      status: 400,
      message:
        "QQ Mail requires a Node.js runtime because IMAP/SMTP connections are not reliable from Cloudflare Workers.",
    } satisfies Partial<ProviderRequestError>);
    expect(loadProtocol).not.toHaveBeenCalled();
    expect(protocol.validateImapCredential).not.toHaveBeenCalled();
    expect(protocol.validateSmtpCredential).not.toHaveBeenCalled();
  });

  it("writes credential validation logs through the injected logger", async () => {
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    const protocol = {
      validateImapCredential: vi.fn(async () => {}),
      validateSmtpCredential: vi.fn(async () => {}),
    } as unknown as QqMailProtocol;

    await validateQqMailCredential(
      {
        email: "user@qq.com",
        authorizationCode: "abcdefghijklmnop",
      },
      async () => protocol,
      logger,
    );

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        service: "qq_mail",
        phase: "imap",
        host: "imap.qq.com",
        port: 993,
      }),
      "qq mail credential validation started",
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        service: "qq_mail",
        phase: "smtp",
        host: "smtp.qq.com",
        port: 465,
      }),
      "qq mail credential validation completed",
    );
    expect(consoleInfo).not.toHaveBeenCalled();
  });
});
