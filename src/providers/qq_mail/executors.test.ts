import { afterEach, describe, expect, it, vi } from "vitest";

describe("qq mail executors", () => {
  afterEach(() => {
    vi.doUnmock("./protocol.ts");
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("does not create the protocol while importing executor wiring", async () => {
    vi.resetModules();
    let protocolModuleLoaded = false;
    const createQqMailProtocol = vi.fn();
    vi.doMock("./protocol.ts", () => {
      protocolModuleLoaded = true;
      return { createQqMailProtocol };
    });

    await import("./executors.ts");

    expect(protocolModuleLoaded).toBe(false);
    expect(createQqMailProtocol).not.toHaveBeenCalled();
  });

  it("does not create the protocol when Cloudflare credential validation is rejected", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    vi.resetModules();
    let protocolModuleLoaded = false;
    const createQqMailProtocol = vi.fn();
    vi.doMock("./protocol.ts", () => {
      protocolModuleLoaded = true;
      return { createQqMailProtocol };
    });

    const { credentialValidators } = await import("./executors.ts");

    await expect(
      credentialValidators.customCredential?.(
        {
          values: {
            email: "user@qq.com",
            authorizationCode: "abcdefghijklmnop",
          },
        },
        { fetcher: fetch },
      ),
    ).rejects.toMatchObject({
      status: 400,
    });
    expect(protocolModuleLoaded).toBe(false);
    expect(createQqMailProtocol).not.toHaveBeenCalled();
  });
});
