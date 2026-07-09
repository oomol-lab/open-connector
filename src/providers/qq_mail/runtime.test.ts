import type { QqMailProtocol } from "./protocol.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { validateQqMailCredential } from "./runtime.ts";

describe("qq mail runtime", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects credential validation immediately on Cloudflare Workers", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    const protocol = {
      validateImapCredential: vi.fn(async () => {}),
      validateSmtpCredential: vi.fn(async () => {}),
    } as unknown as QqMailProtocol;

    await expect(
      validateQqMailCredential(
        {
          email: "user@qq.com",
          authorizationCode: "abcdefghijklmnop",
        },
        protocol,
      ),
    ).rejects.toMatchObject({
      status: 400,
      message:
        "QQ Mail requires a Node.js runtime because IMAP/SMTP connections are not reliable from Cloudflare Workers.",
    } satisfies Partial<ProviderRequestError>);
    expect(protocol.validateImapCredential).not.toHaveBeenCalled();
    expect(protocol.validateSmtpCredential).not.toHaveBeenCalled();
  });
});
