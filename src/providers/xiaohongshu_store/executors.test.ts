import { describe, expect, it } from "vitest";
import { createXiaohongshuStoreSign, credentialValidators } from "./executors.ts";

describe("createXiaohongshuStoreSign", () => {
  it("reproduces the documented createItem signature example", () => {
    // Example from the official signature spec (open.xiaohongshu.com/document/developer/file/39):
    // MD5("product.createItem?appId=21d6748be8de0&timestamp=1612518379&version=2.0" + appSecret).
    const sign = createXiaohongshuStoreSign({
      method: "product.createItem",
      appId: "21d6748be8de0",
      timestamp: "1612518379",
      appSecret: "429aa3aee9ef9e4a858210",
    });
    expect(sign).toBe("1e039e3cd6e0d895e59133029602297e");
  });

  it("changes when any signed field changes", () => {
    const base = {
      method: "order.getOrderList",
      appId: "app-id",
      timestamp: "1700000000",
      appSecret: "app-secret",
    };
    const sign = createXiaohongshuStoreSign(base);
    expect(createXiaohongshuStoreSign({ ...base, method: "order.getOrderDetail" })).not.toBe(sign);
    expect(createXiaohongshuStoreSign({ ...base, appId: "other-app-id" })).not.toBe(sign);
    expect(createXiaohongshuStoreSign({ ...base, timestamp: "1700000001" })).not.toBe(sign);
    expect(createXiaohongshuStoreSign({ ...base, appSecret: "other-secret" })).not.toBe(sign);
  });
});

describe("credentialValidators.customCredential", () => {
  // The connect form treats an upstream 401 as a wrong field value: the validate
  // phase must surface it as a 400 invalid_input, not an authorization_failed
  // reconnect prompt (see provider-runtime.auth-status.test.ts).
  it("maps an upstream auth failure to a 400 input error", async () => {
    const fetcher = (async () =>
      Response.json({ error_code: 401, error_msg: "应用不存在", success: false })) as typeof fetch;
    const validate = credentialValidators.customCredential;
    if (!validate) throw new Error("missing customCredential validator");
    await expect(
      validate({ values: { appId: "x", appSecret: "y", accessToken: "z" } }, { fetcher }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
