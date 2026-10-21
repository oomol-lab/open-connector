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

describe("WeChat Store cooperation workflow", () => {
  it.each([
    [
      "list_league_promoter_products",
      { talentAppid: "talent-1", dataType: 2 },
      "/channels/ec/league/talent/getproductdatalist",
      { talent_appid: "talent-1", get_data_type: 2, page_index: 1, page_size: 20 },
    ],
    [
      "list_product_promotion_talents",
      { productId: "123", promotionPlanId: "456", talentAppid: "talent-1" },
      "/channels/ec/league/promotion/talent/list",
      { product_id: 123, promotion_plan_id: 456, talent_appid: "talent-1", page_index: 1, page_size: 10 },
    ],
    ["get_product_audit_strategy", {}, "/channels/ec/product/auditstrategy/get", {}],
    [
      "list_product_promotion_plans",
      { productId: "123", promotionPlanType: 200, pageIndex: 2 },
      "/channels/ec/league/promotion/plan/list",
      { product_id: 123, promotion_plan_type: 200, page_index: 2, page_size: 20 },
    ],
    [
      "list_league_products",
      { productId: "123", needTotalNum: false },
      "/channels/ec/league/item/list/get",
      { product_id: 123, need_total_num: false, page_index: 1, page_size: 20 },
    ],
    [
      "get_league_plan",
      { type: 300, productId: "123", promotionPlanId: "456" },
      "/channels/ec/league/item/get",
      { type: 300, product_id: 123, promotion_plan_id: 456 },
    ],
    ["get_league_plan", { type: 100, productId: 123 }, "/channels/ec/league/item/get", { type: 100, product_id: 123 }],
    [
      "invite_league_promoter",
      { promoterId: "verified-promoter" },
      "/channels/ec/league/promoter/add",
      { promoter_id: "verified-promoter" },
    ],
    [
      "invite_league_promoter",
      { finderId: "verified-finder" },
      "/channels/ec/league/promoter/add",
      { finder_id: "verified-finder" },
    ],
    [
      "update_league_plan",
      { type: 100, productId: "123", promotionPlanId: "456", operateType: 2 },
      "/channels/ec/league/item/upd",
      { type: 100, product_id: 123, promotion_plan_id: 456, operate_type: 2 },
    ],
    [
      "update_league_plan",
      { type: 300, productId: 123, promotionPlanId: 456, operateType: 4 },
      "/channels/ec/league/item/upd",
      { type: 300, product_id: 123, promotion_plan_id: 456, operate_type: 4 },
    ],
    [
      "update_league_plan",
      { type: 100, productId: 123, promotionPlanId: 456, operateType: 1, ratio: 0 },
      "/channels/ec/league/item/upd",
      { type: 100, product_id: 123, promotion_plan_id: 456, operate_type: 1, ratio: 0 },
    ],
  ])("maps %s to the exact upstream operation", async (action, input, path, body) => {
    const output = { list: [], continue_flag: false, fail_talent_appids: ["failed-talent"] };
    const requests = mockWechat(() => ({ errcode: 0, ...output }));
    expect(await executors[`weixin_store.${action}`]!(input, executionContext())).toEqual({ ok: true, output });
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual({ path, method: "POST", body, token: "mock-token" });
  });

  it.each([
    ["list_league_promoter_products", { talentAppid: "x", dataType: 3 }],
    ["list_league_promoter_products", { talentAppid: "x", dataType: 1, pageSize: 21 }],
    ["list_league_promoter_products", { talentAppid: "", dataType: 1 }],
    ["list_product_promotion_talents", { productId: 123, promotionPlanId: 456, pageSize: 11 }],
    ["list_product_promotion_talents", { productId: 123, promotionPlanId: "9007199254740993" }],
    ["list_product_promotion_plans", { productId: 123, promotionPlanType: 1 }],
    ["list_product_promotion_plans", { productId: 123, pageSize: 21 }],
    ["list_product_promotion_plans", { productId: "9007199254740993" }],
    ["list_league_products", { pageSize: 100, pageIndex: 51 }],
    ["list_league_products", { pageSize: 101 }],
    ["list_league_products", { pageIndex: 0 }],
    ["list_league_products", { needTotalNum: "true" }],
    ["get_league_plan", { type: 200, productId: 123 }],
    ["get_league_plan", { type: 1, productId: 123 }],
    ["invite_league_promoter", {}],
    ["invite_league_promoter", { promoterId: "p", finderId: "f" }],
    ["invite_league_promoter", { talentAppid: "not-an-invitation-id" }],
    ["invite_league_promoter", { promoterId: " " }],
    ["update_league_plan", { type: 100, productId: 123, promotionPlanId: 456, operateType: 1 }],
    ["update_league_plan", { type: 100, productId: 123, promotionPlanId: 456, operateType: 1, ratio: 500000 }],
    ["update_league_plan", { type: 100, productId: 123, promotionPlanId: 456, operateType: 1, ratio: Number.NaN }],
    ["update_league_plan", { type: 100, productId: 123, promotionPlanId: 456, operateType: 4, ratio: 50 }],
    ["update_league_plan", { type: 200, productId: 123, promotionPlanId: 456, operateType: 2 }],
    ["update_league_plan", { type: 100, productId: 123, promotionPlanId: 456, operateType: 3 }],
    ["update_league_plan", { type: 100, productId: 123, promotionPlanId: 456, operateType: 2, exclusiveInfo: {} }],
    ["update_league_plan", { type: 100, productId: 123, promotionPlanId: "9007199254740993", operateType: 2 }],
  ])("rejects invalid %s before any upstream request: %j", async (action, input) => {
    const requests = mockWechat();
    expect(await executors[`weixin_store.${action}`]!(input, executionContext())).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    expect(requests).toEqual([]);
  });

  it.each([
    [10023002, "rate_limited", 429],
    [10023003, "invalid_input", 409],
    [10023004, "invalid_input", 409],
    [10023006, "invalid_input", 409],
    [10023103, "invalid_input", 404],
    [10023109, "invalid_input", 400],
    [10023114, "authorization_failed", 403],
    [10023115, "authorization_failed", 403],
  ])("reports cooperation failure %i once without a mutation fallback", async (errcode, code, status) => {
    const requests = mockWechat(() => ({ errcode, errmsg: "mock cooperation failure" }));
    expect(
      await executors["weixin_store.invite_league_promoter"]!({ promoterId: "verified-promoter" }, executionContext()),
    ).toMatchObject({ ok: false, error: { code, details: { status } } });
    expect(requests).toHaveLength(2);
    expect(requests[1]!.path).toBe("/channels/ec/league/promoter/add");
  });

  it("marks only invitation and plan updates as writes and validates commission semantics in schemas", () => {
    for (const name of ["invite_league_promoter", "update_league_plan"]) {
      expect(weixinStoreActions.find((action) => action.name === name)!.operationType).toBe("write");
    }
    for (const name of [
      "list_league_promoter_products",
      "list_product_promotion_talents",
      "get_product_audit_strategy",
      "list_product_promotion_plans",
      "list_league_products",
      "get_league_plan",
    ]) {
      expect(weixinStoreActions.find((action) => action.name === name)!.operationType).toBe("read");
    }
    const action = weixinStoreActions.find((action) => action.name === "update_league_plan")!;
    const validator = new Validator(action.inputSchema);
    const identity = { type: 100, productId: 123, promotionPlanId: 456 };
    expect(validator.validate({ ...identity, operateType: 1 }).valid).toBe(false);
    expect(validator.validate({ ...identity, operateType: 1, ratio: 50 }).valid).toBe(true);
    expect(validator.validate({ ...identity, operateType: 4, ratio: 50 }).valid).toBe(false);
    expect(validator.validate({ ...identity, operateType: 2 }).valid).toBe(true);
  });
});
