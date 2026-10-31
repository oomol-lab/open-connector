import type { ExecutionContext } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { validateActionInput } from "../../core/validation.ts";
import { weixinStoreActions } from "./actions.ts";
import { executors } from "./executors.ts";

const action = weixinStoreActions.find((entry) => entry.name === "get_product_h5_url")!;
const productH5Url = "https://store.weixin.qq.com/shop/a/example-product";
let credentialSequence = 0;

function createContext(): ExecutionContext {
  return {
    getCredential: async () => ({
      authType: "custom_credential",
      values: { appId: `h5-url-test-${++credentialSequence}`, appSecret: "test-app-secret" },
      profile: { accountId: "test-store", displayName: "Test store", grantedScopes: [] },
      metadata: {},
    }),
  };
}

function stubWechatResponse(response: Record<string, unknown>): ReturnType<typeof vi.fn<typeof fetch>> {
  const fetcher = vi.fn<typeof fetch>(async (url) => {
    if (new URL(String(url)).pathname === "/cgi-bin/stable_token") {
      return Response.json({ access_token: "test-access-token", expires_in: 7200 });
    }
    return Response.json(response);
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WeChat Store product H5 purchase links", () => {
  it.each([
    { input: { productId: "10000000000000001" }, body: { product_id: "10000000000000001" } },
    { input: { productId: 10000000000001 }, body: { product_id: "10000000000001" } },
    {
      input: { productId: "10000000000001", wecomCorpId: "corp-1", wecomUserId: "member-1" },
      body: { product_id: "10000000000001", wecom_corp_id: "corp-1", wecom_user_id: "member-1" },
    },
  ])("retrieves the product link with documented fields: $input", async ({ input, body }) => {
    const fetcher = stubWechatResponse({ errcode: 0, errmsg: "ok", product_h5url: productH5Url });
    expect(action.operationType).toBe("read");
    expect(validateActionInput(action, input).valid).toBe(true);

    expect(await executors["weixin_store.get_product_h5_url"]!(input, createContext())).toEqual({
      ok: true,
      output: { product_h5url: productH5Url },
    });

    const [url, init] = fetcher.mock.calls[1]!;
    expect(String(url)).toBe("https://api.weixin.qq.com/channels/ec/product/h5url/get?access_token=test-access-token");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual(body);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    { errcode: 10020050, status: 403, code: "provider_error" },
    { errcode: 10020051, status: 400, code: "invalid_input" },
    { errcode: 10020052, status: 404, code: "invalid_input" },
    { errcode: 10020065, status: 400, code: "invalid_input" },
    { errcode: 10020091, status: 400, code: "invalid_input" },
    { errcode: 10021404, status: 400, code: "invalid_input" },
    { errcode: 10021405, status: 400, code: "invalid_input" },
  ])("reports documented upstream error $errcode without a purchase link", async ({ errcode, status, code }) => {
    stubWechatResponse({ errcode, errmsg: "Product link request rejected" });
    expect(
      await executors["weixin_store.get_product_h5_url"]!({ productId: "10000000000001" }, createContext()),
    ).toMatchObject({
      ok: false,
      error: { code, message: `WeChat API error ${errcode}: Product link request rejected`, details: { status } },
    });
  });

  it.each([{}, { productId: "" }, { productId: 1.5 }, { productId: "1", wecomCorpId: 123 }])(
    "rejects invalid catalog inputs: %j",
    (input) => {
      expect(validateActionInput(action, input).valid).toBe(false);
    },
  );

  it.each([
    { productId: Number.MAX_SAFE_INTEGER + 1 },
    { productId: "   " },
    { productId: "1", wecomCorpId: "   " },
    { productId: "1", wecomUserId: "   " },
  ])("rejects invalid ids before requesting a token: %j", async (input) => {
    const fetcher = stubWechatResponse({ errcode: 0, product_h5url: productH5Url });
    expect(await executors["weixin_store.get_product_h5_url"]!(input, createContext())).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
