import type { ExecutionContext } from "../../core/types.ts";
import type { Schema } from "@cfworker/json-schema";

import { Validator } from "@cfworker/json-schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeAction } from "../../core/execution.ts";
import { parseWechatJson } from "./access-token.ts";
import { weixinStoreActions } from "./actions.ts";
import { executors } from "./executors.ts";

let credentialSequence = 0;

function createContext(): ExecutionContext {
  const appId = `response-ids-test-${++credentialSequence}`;
  return {
    getCredential: async () => ({
      authType: "custom_credential",
      values: { appId, appSecret: "test-secret" },
      profile: { accountId: "test-store", displayName: "Test store", grantedScopes: [] },
      metadata: {},
    }),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("WeChat Store numeric response identifiers", () => {
  it("preserves a numeric associated order id through the public action execution path", async () => {
    const context = createContext();
    // Use raw response text: JSON.stringify on an unsafe JS number would corrupt the fixture first.
    const raw =
      '{"errcode":0,"errmsg":"ok","data_list":[{"order_id":"37000000000000000001","mch_settle_amount":290,"post_settlement_expense":{"freight_insurance_make_up_order_id":37000000000000000001,"buyer_refund_amount":10},"product_list":[{"product_id":9007199254740991},{"product_id":9007199254740993}]}],"page_ctx":""}';
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      new URL(String(url)).pathname === "/cgi-bin/stable_token"
        ? Response.json({ access_token: "test-token", expires_in: 7200 })
        : new Response(raw, { headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetcher);
    const action = weixinStoreActions.find((action) => action.name === "list_order_settlements")!;
    expect(
      await executeAction(action, executors["weixin_store.list_order_settlements"], { settleState: 0 }, context),
    ).toEqual({
      ok: true,
      output: {
        data_list: [
          {
            order_id: "37000000000000000001",
            mch_settle_amount: 290,
            post_settlement_expense: {
              freight_insurance_make_up_order_id: "37000000000000000001",
              buyer_refund_amount: 10,
            },
            product_list: [{ product_id: 9007199254740991 }, { product_id: "9007199254740993" }],
          },
        ],
        page_ctx: "",
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("leaves safe numeric ids, quoted ids, amounts, fractions and embedded text unchanged", () => {
    expect(
      parseWechatJson(
        '{"errcode":0,"id":42,"order_id":"00037000000000000000001","amount":290,"ratio":0.25,"items":[{"sku_id":9007199254740991}],"note":"order_id: 37000000000000000001"}',
      ),
    ).toEqual({
      errcode: 0,
      id: 42,
      order_id: "00037000000000000000001",
      amount: 290,
      ratio: 0.25,
      items: [{ sku_id: 9007199254740991 }],
      note: "order_id: 37000000000000000001",
    });
  });

  it.each([
    ["apply_category", '{"audit_id":__ID__}'],
    ["get_category_application", '{"info":{"audit_id":__ID__,"cat_id":__ID__}}'],
    ["list_category_permissions", '{"list":[{"id":__ID__}]}'],
    ["list_league_promoter_products", '{"list":[{"spu_id":__ID__}]}'],
    ["list_product_promotion_talents", '{"list":[{"commission_info":{"promotion_plan_id":__ID__}}]}'],
    ["list_product_promotion_plans", '{"list":[{"promotion_plan_id":__ID__},{"promotion_plan_id":null}]}'],
    ["update_league_plan", '{"promotion_plan_id":__ID__}'],
    [
      "list_order_settlements",
      '{"data_list":[{"post_settlement_expense":{"freight_insurance_make_up_order_id":__ID__}}]}',
    ],
  ])("keeps the %s output contract compatible with safe and lossless numeric ids", (name, raw) => {
    const action = weixinStoreActions.find((action) => action.name === name)!;
    const validator = new Validator(action.outputSchema as Schema, "2020-12", false);
    for (const id of ["42", "37000000000000000001"]) {
      const output = parseWechatJson(raw.replaceAll("__ID__", id));
      expect(output).toBeDefined();
      expect(validator.validate(output).errors).toEqual([]);
    }
  });

  it.each(["id", "order_id", "guarantee_id", "present_id", "freight_insurance_make_up_order_id"])(
    "preserves unsafe integer text for %s",
    (key) => {
      expect(parseWechatJson(`{"${key}":37000000000000000001}`)).toEqual({ [key]: "37000000000000000001" });
    },
  );

  it.each(['{"order_id":3.7e19}', '{"order_id":37000000000000000001.5}', '{"order_id":NaN}', "[]", "null", "{"])(
    "rejects malformed envelopes or unsafe ids without an exact integer source: %s",
    (raw) => {
      expect(parseWechatJson(raw)).toBeUndefined();
    },
  );
});

describe("WeChat Store numeric follow-up identifiers", () => {
  it.each([42, "42", Number.MAX_SAFE_INTEGER, "9007199254740991"])(
    "queries a safe audit id as an exact JSON number: %s",
    async (auditId) => {
      const fetcher = vi.fn<typeof fetch>(async (url) =>
        new URL(String(url)).pathname === "/cgi-bin/stable_token"
          ? Response.json({ access_token: "test-token", expires_in: 7200 })
          : Response.json({ errcode: 0, info: { audit_id: auditId } }),
      );
      vi.stubGlobal("fetch", fetcher);
      const action = weixinStoreActions.find((action) => action.name === "get_category_application")!;
      const result = await executeAction(
        action,
        executors["weixin_store.get_category_application"],
        { auditId },
        createContext(),
      );
      expect(result.ok).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(fetcher.mock.calls[1]![1]?.body).toBe(`{"audit_id":${auditId}}`);
    },
  );

  it.each(["9007199254740993", 9007199254740992, "37000000000000000001", "3.7e19", "", 0, -1, 1.5])(
    "rejects an unsupported audit id before network access through both entry points: %s",
    async (auditId) => {
      const fetcher = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetcher);
      const action = weixinStoreActions.find((action) => action.name === "get_category_application")!;
      const executor = executors["weixin_store.get_category_application"];
      const context = createContext();
      expect(await executeAction(action, executor, { auditId }, context)).toMatchObject({
        ok: false,
        error: { code: "invalid_input" },
      });
      expect(await executor({ auditId }, context)).toMatchObject({ ok: false, error: { code: "invalid_input" } });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("preserves the application result but explicitly refuses an unsupported audit follow-up", async () => {
    const context = createContext();
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      new URL(String(url)).pathname === "/cgi-bin/stable_token"
        ? Response.json({ access_token: "test-token", expires_in: 7200 })
        : new Response('{"errcode":0,"audit_id":37000000000000000001}'),
    );
    vi.stubGlobal("fetch", fetcher);
    const apply = weixinStoreActions.find((action) => action.name === "apply_category")!;
    const result = await executeAction(
      apply,
      executors["weixin_store.apply_category"],
      { categoryInfo: { cats_v2: [{ cat_id: 1 }], license_group_list: [] } },
      context,
    );
    expect(result).toEqual({ ok: true, output: { audit_id: "37000000000000000001" } });
    if (!result.ok) throw new Error("Expected application success");
    const get = weixinStoreActions.find((action) => action.name === "get_category_application")!;
    expect(
      await executeAction(
        get,
        executors["weixin_store.get_category_application"],
        { auditId: (result.output as { audit_id: string }).audit_id },
        context,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_input", message: expect.stringContaining("larger audit ids are not supported") },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["get_league_plan", { type: 300, productId: "1" }],
    ["update_league_plan", { type: 300, productId: "1", operateType: 2 }],
    ["list_product_promotion_talents", { productId: "1" }],
  ] as const)("keeps safe plan ids usable and rejects larger returned plan ids for %s", async (name, input) => {
    const context = createContext();
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      new URL(String(url)).pathname === "/cgi-bin/stable_token"
        ? Response.json({ access_token: "test-token", expires_in: 7200 })
        : new Response('{"errcode":0,"list":[{"promotion_plan_id":37000000000000000001}]}'),
    );
    vi.stubGlobal("fetch", fetcher);
    const list = weixinStoreActions.find((action) => action.name === "list_product_promotion_plans")!;
    const listed = await executeAction(
      list,
      executors["weixin_store.list_product_promotion_plans"],
      { productId: "1" },
      context,
    );
    expect(listed).toEqual({ ok: true, output: { list: [{ promotion_plan_id: "37000000000000000001" }] } });
    if (!listed.ok) throw new Error("Expected plan listing success");
    const promotionPlanId = (listed.output as { list: { promotion_plan_id: string }[] }).list[0]!.promotion_plan_id;
    const action = weixinStoreActions.find((action) => action.name === name)!;
    const executor = executors[`weixin_store.${name}`];
    expect(await executeAction(action, executor, { ...input, promotionPlanId }, context)).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((await executeAction(action, executor, { ...input, promotionPlanId: "9007199254740991" }, context)).ok).toBe(
      true,
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetcher.mock.calls[2]![1]?.body))).toMatchObject({
      promotion_plan_id: Number.MAX_SAFE_INTEGER,
      product_id: 1,
    });
  });
});
