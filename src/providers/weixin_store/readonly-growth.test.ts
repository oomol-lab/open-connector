import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { Validator } from "@cfworker/json-schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { weixinStoreActions } from "./actions.ts";
import { executors } from "./executors.ts";

let credentialIndex = 0;
function executionContext(): ExecutionContext {
  const credential: ResolvedCredential = {
    authType: "custom_credential",
    values: { appId: `mock-shop-${++credentialIndex}`, appSecret: "mock-secret" },
    profile: { accountId: "mock-shop", displayName: "Mock shop", grantedScopes: [] },
    metadata: {},
  };
  return { getCredential: async () => credential };
}

interface RecordedRequest {
  path: string;
  method: string;
  body: Record<string, unknown>;
  token: string | null;
}
function mockWechat(respond: (request: RecordedRequest) => unknown = () => ({ errcode: 0 })) {
  const requests: RecordedRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const request = {
        path: url.pathname,
        method: init?.method ?? "GET",
        body: JSON.parse(String(init?.body)),
        token: url.searchParams.get("access_token"),
      };
      requests.push(request);
      expect(url.origin).toBe("https://api.weixin.qq.com");
      return Response.json(
        url.pathname === "/cgi-bin/stable_token" ? { access_token: "mock-token", expires_in: 7200 } : respond(request),
      );
    }),
  );
  return requests;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("WeChat Store read-only growth actions", () => {
  it("lists merchant talents with default pagination and preserves continuation metadata", async () => {
    const output = { total_num: 23, continue_flag: true, list: [{ talent_appid: "talent-1", nickname: "Creator" }] };
    const requests = mockWechat(() => ({ errcode: 0, errmsg: "ok", ...output }));
    const context = executionContext();
    expect(await executors["weixin_store.list_league_promoters"]!({}, context)).toEqual({ ok: true, output });
    await executors["weixin_store.list_league_promoters"]!({ pageIndex: 2, pageSize: 3 }, context);
    expect(requests.map(({ path, method, body, token }) => ({ path, method, body, token }))).toEqual([
      {
        path: "/cgi-bin/stable_token",
        method: "POST",
        body: expect.objectContaining({ force_refresh: false }),
        token: null,
      },
      {
        path: "/channels/ec/league/promoter/list/get",
        method: "POST",
        body: { page_index: 1, page_size: 20 },
        token: "mock-token",
      },
      {
        path: "/channels/ec/league/promoter/list/get",
        method: "POST",
        body: { page_index: 2, page_size: 3 },
        token: "mock-token",
      },
    ]);
  });

  it.each([
    [{ talentAppid: "talent-1" }, { talent_appid: "talent-1" }],
    [{ talentSearchKey: "finder-1" }, { talent_search_key: "finder-1" }],
  ])("looks up exactly one known talent identifier: %j", async (input, body) => {
    const talent = {
      base_talent_info: { talent_appid: "talent-1" },
      data: { order_num_30d: 12 },
      feature_info: { is_blacklisted: false },
    };
    const requests = mockWechat(() => ({ errcode: 0, talent }));
    expect(await executors["weixin_store.get_league_promoter"]!(input, executionContext())).toEqual({
      ok: true,
      output: { talent },
    });
    expect(requests[1]).toEqual({
      path: "/channels/ec/league/promoter/get",
      method: "POST",
      body,
      token: "mock-token",
    });
  });

  it("uses the China T+1 boundary and preserves string metrics and nullable ratios", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T16:01:00Z"));
    const product_info = {
      product_id: "123",
      price: "290",
      data: { product_click_uv: "9007199254740993", pay_gmv: "290", create2pay_ratio: null },
    };
    const requests = mockWechat(() => ({ errcode: 0, product_info }));
    const result = await executors["weixin_store.get_compass_product_data"]!(
      { date: "20261020", productId: "123" },
      executionContext(),
    );
    expect(result).toEqual({ ok: true, output: { product_info } });
    expect(requests[1]).toEqual({
      path: "/channels/ec/compass/shop/product/data/get",
      method: "POST",
      body: { ds: "20261020", product_id: 123 },
      token: "mock-token",
    });
  });

  it("reads restriction scenes in one batch without merchant writes", async () => {
    const data = { restricted_info_list: [{ product_id: 123, scene_info: [{ scene: 7, source: 8 }] }] };
    const requests = mockWechat(() => ({ errcode: 0, data }));
    expect(
      await executors["weixin_store.get_product_restricted_info"]!({ productIds: ["123", 456] }, executionContext()),
    ).toEqual({ ok: true, output: { data } });
    expect(requests[1]).toEqual({
      path: "/channels/ec/product/getproductrestrictedinfo",
      method: "POST",
      body: { product_ids: [123, 456] },
      token: "mock-token",
    });
  });

  it.each([
    ["list_league_promoters", { pageIndex: 0 }],
    ["list_league_promoters", { pageSize: 21 }],
    ["get_league_promoter", {}],
    ["get_league_promoter", { talentAppid: "a", talentSearchKey: "b" }],
    ["get_league_promoter", { talentAppid: " " }],
    ["get_compass_product_data", { date: "20260230", productId: 123 }],
    ["get_compass_product_data", { date: "20261021", productId: 123 }],
    ["get_compass_product_data", { date: "20261022", productId: 123 }],
    ["get_compass_product_data", { date: "2026-10-20", productId: 123 }],
    ["get_compass_product_data", { date: "20261020", productId: "9007199254740993" }],
    ["get_product_restricted_info", { productIds: [] }],
    ["get_product_restricted_info", { productIds: Array(51).fill(123) }],
    ["get_product_restricted_info", { productIds: ["9007199254740993"] }],
    ["get_product_restricted_info", { productIds: [0] }],
  ])("rejects invalid %s input before any network access: %j", async (action, input) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T16:01:00Z"));
    const requests = mockWechat();
    const result = await executors[`weixin_store.${action}`]!(input, executionContext());
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(requests).toEqual([]);
  });

  it.each([
    [10023007, "authorization_failed", 403],
    [48001, "authorization_failed", 403],
    [10020510, "rate_limited", 429],
    [10023000, "invalid_input", 400],
    [10023001, "invalid_input", 400],
    [10024003, "invalid_input", 400],
    [10021069, "invalid_input", 400],
  ])("maps documented WeChat error %i", async (errcode, code, status) => {
    mockWechat(() => ({ errcode, errmsg: "mock failure" }));
    expect(await executors["weixin_store.list_league_promoters"]!({}, executionContext())).toMatchObject({
      ok: false,
      error: { code, details: { status } },
    });
  });

  it("refreshes an expired token once and retries only the same read endpoint", async () => {
    let count = 0;
    const requests = mockWechat(() =>
      ++count === 1 ? { errcode: 42001, errmsg: "expired" } : { errcode: 0, list: [] },
    );
    expect(await executors["weixin_store.list_league_promoters"]!({}, executionContext())).toEqual({
      ok: true,
      output: { list: [] },
    });
    expect(requests.map((request) => request.path)).toEqual([
      "/cgi-bin/stable_token",
      "/channels/ec/league/promoter/list/get",
      "/cgi-bin/stable_token",
      "/channels/ec/league/promoter/list/get",
    ]);
    expect(requests[2]!.body.force_refresh).toBe(true);
  });

  it("publishes read-only schemas that reject ambiguous identities and excessive batches", () => {
    const names = [
      "list_league_promoters",
      "get_league_promoter",
      "get_compass_product_data",
      "get_product_restricted_info",
    ];
    const actions = weixinStoreActions.filter((action) => names.includes(action.name));
    expect(actions).toHaveLength(4);
    expect(actions.every((action) => action.operationType === "read")).toBe(true);
    const talent = actions.find((action) => action.name === "get_league_promoter")!;
    const validator = new Validator(talent.inputSchema);
    expect(validator.validate({}).valid).toBe(false);
    expect(validator.validate({ talentAppid: "a", talentSearchKey: "b" }).valid).toBe(false);
    expect(validator.validate({ talentAppid: "a" }).valid).toBe(true);
    const restricted = actions.find((action) => action.name === "get_product_restricted_info")!;
    expect(new Validator(restricted.inputSchema).validate({ productIds: Array(51).fill(123) }).valid).toBe(false);
  });
});
