import type { ExecutionContext } from "../../core/types.ts";
import type { Schema } from "@cfworker/json-schema";

import { Validator } from "@cfworker/json-schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeAction } from "../../core/execution.ts";
import { parseWechatJson } from "./access-token.ts";
import { weixinStoreActions } from "./actions.ts";
import { executors } from "./executors.ts";

afterEach(() => vi.unstubAllGlobals());

describe("WeChat Store numeric response identifiers", () => {
  it("preserves a numeric associated order id through the public action execution path", async () => {
    const context: ExecutionContext = {
      getCredential: async () => ({
        authType: "custom_credential",
        values: { appId: "response-ids-test", appSecret: "test-secret" },
        profile: { accountId: "test-store", displayName: "Test store", grantedScopes: [] },
        metadata: {},
      }),
    };
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
