import type { ExecutionContext, TransitFileStore } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { validateActionInput } from "../../core/validation.ts";
import { weixinStoreActions } from "./actions.ts";
import { executors } from "./executors.ts";

let credentialSequence = 0;
const orderId = "37000000000000000001";
const evidenceUrl = "https://example.com/c2c/image?dis_k=fixture%2Bvalue&x=1";
const oldPackage = {
  deliveryId: "SF",
  waybillId: "SF123",
  productInfos: [{ productId: "10000000000000001", skuId: "20000000000000001", productCnt: 1 }],
};
const newPackage = { ...oldPackage, waybillId: "SF456" };
const wireProducts = [{ product_id: "10000000000000001", sku_id: "20000000000000001", product_cnt: 1 }];

function createContext(transitFiles?: TransitFileStore): ExecutionContext {
  const appId = `merchant-ops-test-${++credentialSequence}`;
  return {
    getCredential: async () => ({
      authType: "custom_credential",
      values: { appId, appSecret: "test-secret" },
      profile: { accountId: "test-store", displayName: "Test store", grantedScopes: [] },
      metadata: {},
    }),
    transitFiles,
  };
}

function stubWechatResponse(response: Record<string, unknown>): ReturnType<typeof vi.fn<typeof fetch>> {
  const fetcher = vi.fn<typeof fetch>(async (url) =>
    new URL(String(url)).pathname === "/cgi-bin/stable_token"
      ? Response.json({ access_token: "test-token", expires_in: 7200 })
      : Response.json(response),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

function actionFor(name: string) {
  return weixinStoreActions.find((action) => action.name === name)!;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

interface RequestCase {
  name: string;
  input: Record<string, unknown>;
  path: string;
  body: Record<string, unknown>;
  output: Record<string, unknown>;
  write?: boolean;
}

const requestCases: RequestCase[] = [
  {
    name: "get_product_qr_code",
    input: { productId: "10000000000000001", qrcodeType: 3, wecomCorpId: "corp", wecomUserId: "member" },
    path: "/channels/ec/product/qrcode/get",
    body: { product_id: "10000000000000001", qrcode_type: 3, wecom_corp_id: "corp", wecom_user_id: "member" },
    output: { product_qrcode: "https://example.com/qr.png" },
  },
  {
    name: "get_product_tag_link",
    input: { productId: 10000000000001 },
    path: "/channels/ec/product/taglink/get",
    body: { product_id: "10000000000001" },
    output: { product_taglink: "#微信小店://测试/example" },
  },
  {
    name: "get_compass_shop_overview",
    input: { date: "20240520" },
    path: "/channels/ec/compass/shop/overall/get",
    body: { ds: "20240520" },
    output: {
      data: { product_click_uv: "11", pay_gmv: "0", pay_order_cnt: "0", pay_refund_gmv: "0", nullable_ratio: null },
    },
  },
  {
    name: "get_funds_balance",
    input: {},
    path: "/channels/ec/funds/getbalance",
    body: {},
    output: { available_amount: 45331, pending_amount: 7549, sub_mchid: "merchant" },
  },
  {
    name: "list_funds_flows",
    input: {
      page: 1000,
      pageSize: 10,
      nextKey: "cursor+/=",
      startTime: 1761868800,
      endTime: 1761955200,
      transactionId: "pay-1",
    },
    path: "/channels/ec/funds/getfundsflowlist",
    body: {
      page: 1000,
      page_size: 10,
      next_key: "cursor+/=",
      start_time: 1761868800,
      end_time: 1761955200,
      transaction_id: "pay-1",
    },
    output: { flow_ids: ["10000057741221110"], has_more: true, next_key: "next+/=" },
  },
  {
    name: "get_funds_flow",
    input: { flowId: "10000057741221110" },
    path: "/channels/ec/funds/getfundsflowdetail",
    body: { flow_id: "10000057741221110" },
    output: {
      funds_flow: {
        flow_id: "10000057741221110",
        amount: 1,
        flow_type: 2,
        funds_type: 3,
        related_info_list: [{ order_id: orderId }],
      },
    },
  },
  {
    name: "list_order_settlements",
    input: {
      settleState: 0,
      orderState: 0,
      payMethod: 0,
      orderId,
      limit: 100,
      pageContext: "opaque+/=",
      createTimeStart: 1761868800,
      createTimeEnd: 1761955200,
    },
    path: "/channels/ec/funds/listorderflow",
    body: {
      order_settle_state: 0,
      order_state: 0,
      order_pay_method: 0,
      order_id: orderId,
      pagination_info: { limit: 100, use_page_ctx: true, page_ctx: "opaque+/=" },
      order_create_time_range: { begin: 1761868800, end: 1761955200 },
    },
    output: {
      total_count: 1,
      data_list: [{ order_id: orderId, mch_settle_amount: 293706, buyer_refund_amount: 0 }],
      page_ctx: "",
    },
  },
  {
    name: "list_merchant_tickets",
    input: {
      ticketState: 1,
      ticketClassType: 9,
      searchTicketId: orderId,
      startTime: 1761868800,
      endTime: 1761955200,
      sortOrderType: 2,
      limit: 50,
      start: 50,
    },
    path: "/channels/ec/platformkf/getmchticketlist",
    body: {
      ticket_state: 1,
      ticket_class_type: 9,
      search_ticket_id: orderId,
      search_start_time: 1761868800,
      search_end_time: 1761955200,
      sort_order_type: 2,
      limit: 50,
      start: 50,
    },
    output: {
      total: 51,
      ticket_item_list: [
        { ticket_id: "ticket-1", order_id: orderId, ticket_deal_end_time: 1762041600, ticket_state: 1 },
      ],
    },
  },
  {
    name: "get_merchant_ticket",
    input: { ticketId: "ticket-1" },
    path: "/channels/ec/platformkf/getmchticketdetail",
    body: { ticket_id: "ticket-1" },
    output: { merchant_ticket: { ticket_id: "ticket-1", ticket_state: 2, platform_operate: { reason: "Reviewing" } } },
  },
  {
    name: "list_aftersale_reasons",
    input: {},
    path: "/channels/ec/aftersale/reason/get",
    body: {},
    output: { reason_list: [{ reason: "1", reason_text: "Reason" }] },
  },
  {
    name: "list_aftersale_reject_reasons",
    input: {},
    path: "/channels/ec/aftersale/rejectreason/get",
    body: {},
    output: { reason_list: [{ reject_reason_type: 1, reject_scene: 4, need_proof: 1 }] },
  },
  {
    name: "get_aftersale_complaint",
    input: { complaintId: "complaint-1" },
    path: "/channels/ec/aftersale/getcomplaintorder",
    body: { complaint_id: "complaint-1" },
    output: {
      order_id: orderId,
      after_sale_order_id: "after-1",
      status: 106,
      history: [{ item_type: 16, media_infos: [{ type: 1, picture: { ticket_url: evidenceUrl } }] }],
    },
  },
  {
    name: "update_delivery_info",
    write: true,
    input: { orderId, changeInfos: [{ old: oldPackage, new: newPackage }] },
    path: "/channels/ec/order/deliveryinfo/update",
    body: {
      order_id: orderId,
      change_infos: [
        {
          old: { delivery_id: "SF", waybill_id: "SF123", product_infos: wireProducts },
          new: { delivery_id: "SF", waybill_id: "SF456", product_infos: wireProducts },
        },
      ],
    },
    output: {},
  },
  {
    name: "send_exchange_delivery",
    write: true,
    input: { afterSaleOrderId: "after-1", deliveryId: "SF", waybillId: "SF123" },
    path: "/channels/ec/aftersale/acceptexchangereship",
    body: { after_sale_order_id: "after-1", delivery_id: "SF", waybill_id: "SF123" },
    output: {},
  },
  {
    name: "reject_aftersale",
    write: true,
    input: {
      afterSaleOrderId: "after-1",
      rejectReasonType: 1,
      mediaFiles: [
        { type: 1, picture: { c2cUrl: evidenceUrl } },
        { type: 2, video: { c2cUrl: evidenceUrl }, videoPlayLength: 1.5 },
      ],
    },
    path: "/channels/ec/aftersale/rejectapply",
    body: {
      after_sale_order_id: "after-1",
      reject_reason_type: 1,
      media_files: [
        { type: 1, picture: { c2c_url: evidenceUrl } },
        { type: 2, video: { c2c_url: evidenceUrl }, video_play_length: 1.5 },
      ],
    },
    output: {},
  },
];

describe("WeChat Store merchant operation contracts", () => {
  it.each(requestCases)(
    "maps $name to the documented endpoint without losing data",
    async ({ name, input, path, body, output, write }) => {
      const action = actionFor(name);
      expect(validateActionInput(action, input).valid).toBe(true);
      expect(action.operationType).toBe(write ? "write" : "read");
      if (write) expect(action.providerPermissions?.length).toBeGreaterThan(0);
      const fetcher = stubWechatResponse({ errcode: 0, errmsg: "ok", ...output });
      expect(await executors[`weixin_store.${name}`]!(input, createContext())).toEqual({ ok: true, output });
      expect(fetcher).toHaveBeenCalledTimes(2);
      const [url, init] = fetcher.mock.calls[1]!;
      expect(String(url)).toBe(`https://api.weixin.qq.com${path}?access_token=test-token`);
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual(body);
    },
  );

  it.each([
    { name: "get_product_qr_code", input: { productId: "1" }, body: { product_id: "1" } },
    {
      name: "list_funds_flows",
      input: { startTime: 1761868800 },
      body: { page: 1, page_size: 10, start_time: 1761868800 },
    },
    {
      name: "list_funds_flows",
      input: { endTime: 1761955200 },
      body: { page: 1, page_size: 10, end_time: 1761955200 },
    },
    { name: "list_merchant_tickets", input: {}, body: { limit: 10, start: 0 } },
    {
      name: "list_order_settlements",
      input: { settleState: 60 },
      body: { order_settle_state: 60, pagination_info: { limit: 20, use_page_ctx: true } },
    },
    {
      name: "list_order_settlements",
      input: { settleState: 1, pageContext: "" },
      body: { order_settle_state: 1, pagination_info: { limit: 20, use_page_ctx: true, page_ctx: "" } },
    },
    {
      name: "list_order_settlements",
      input: { settleState: 1, usePageContext: false, offset: 0 },
      body: { order_settle_state: 1, pagination_info: { limit: 20, use_page_ctx: false, offset: 0 } },
    },
    {
      name: "reject_aftersale",
      input: { afterSaleOrderId: "after-1", rejectReasonType: 1 },
      body: { after_sale_order_id: "after-1", reject_reason_type: 1 },
    },
  ])("preserves defaults and optional fields for $name: $input", async ({ name, input, body }) => {
    const fetcher = stubWechatResponse({ errcode: 0 });
    expect(validateActionInput(actionFor(name), input).valid).toBe(true);
    expect(await executors[`weixin_store.${name}`]!(input, createContext())).toMatchObject({ ok: true });
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toEqual(body);
  });

  it.each([
    { name: "get_product_qr_code", input: { productId: "1", qrcodeType: 4 } },
    { name: "get_product_tag_link", input: { productId: Number.MAX_SAFE_INTEGER + 1 } },
    { name: "get_product_tag_link", input: { productId: "1", wecomUserId: " " } },
    { name: "get_compass_shop_overview", input: { date: "20260230" } },
    { name: "list_funds_flows", input: { page: 1000, pageSize: 10 } },
    { name: "list_funds_flows", input: { page: 1.2 } },
    { name: "list_funds_flows", input: { page: Number.MAX_SAFE_INTEGER + 1 } },
    { name: "list_funds_flows", input: { startTime: 10, endTime: 9 } },
    { name: "list_funds_flows", input: { endTime: 1.5 } },
    { name: "get_funds_flow", input: { flowId: " " } },
    { name: "list_order_settlements", input: {} },
    { name: "list_order_settlements", input: { settleState: 3 } },
    { name: "list_order_settlements", input: { settleState: 1, orderState: 21 } },
    { name: "list_order_settlements", input: { settleState: 1, payMethod: 3 } },
    { name: "list_order_settlements", input: { settleState: 1, limit: 101 } },
    { name: "list_order_settlements", input: { settleState: 1, offset: 0 } },
    { name: "list_order_settlements", input: { settleState: 1, usePageContext: false, pageContext: "cursor" } },
    { name: "list_order_settlements", input: { settleState: 1, usePageContext: "false" } },
    { name: "list_order_settlements", input: { settleState: 1, createTimeStart: 10, createTimeEnd: 10 } },
    { name: "list_order_settlements", input: { settleState: 1, orderId: Number.MAX_SAFE_INTEGER + 1 } },
    { name: "list_merchant_tickets", input: { limit: 51 } },
    { name: "list_merchant_tickets", input: { ticketState: 4 } },
    { name: "list_merchant_tickets", input: { ticketClassType: 1 } },
    { name: "list_merchant_tickets", input: { start: -1 } },
    { name: "get_merchant_ticket", input: { ticketId: " " } },
    { name: "get_aftersale_complaint", input: { complaintId: " " } },
    { name: "update_delivery_info", input: { orderId, changeInfos: [] } },
    { name: "update_delivery_info", input: { orderId, changeInfos: [{ old: oldPackage }] } },
    {
      name: "update_delivery_info",
      input: { orderId, changeInfos: [{ old: oldPackage, new: { ...newPackage, productInfos: [] } }] },
    },
    { name: "send_exchange_delivery", input: { afterSaleOrderId: "after-1", deliveryId: "SF", waybillId: " " } },
    { name: "reject_aftersale", input: { afterSaleOrderId: "after-1", rejectReasonType: 1, mediaFiles: [] } },
    {
      name: "reject_aftersale",
      input: {
        afterSaleOrderId: "after-1",
        rejectReasonType: 1,
        mediaFiles: [{ type: 1, video: { c2cUrl: evidenceUrl } }],
      },
    },
    {
      name: "reject_aftersale",
      input: {
        afterSaleOrderId: "after-1",
        rejectReasonType: 1,
        mediaFiles: [{ type: 2, video: { c2cUrl: evidenceUrl }, videoPlayLength: -1 }],
      },
    },
  ])("rejects invalid $name input before network I/O: $input", async ({ name, input }) => {
    const fetcher = stubWechatResponse({ errcode: 0 });
    expect(await executors[`weixin_store.${name}`]!(input, createContext())).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses the Asia/Shanghai day boundary for both shop and product data", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T15:59:59Z"));
    const fetcher = stubWechatResponse({ errcode: 0, data: {} });
    for (const name of ["get_compass_shop_overview", "get_compass_product_data"]) {
      expect(
        await executors[`weixin_store.${name}`]!({ date: "20261031", productId: 1 }, createContext()),
      ).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    }
    expect(fetcher).not.toHaveBeenCalled();
    vi.setSystemTime(new Date("2026-10-31T16:00:00Z"));
    expect(
      await executors["weixin_store.get_compass_shop_overview"]!({ date: "20261031" }, createContext()),
    ).toMatchObject({ ok: true });
  });

  it.each([
    { name: "get_funds_flow", input: { flowId: "missing" }, errcode: 10021302, status: 404 },
    { name: "get_aftersale_complaint", input: { complaintId: "missing" }, errcode: 10021500, status: 404 },
    { name: "list_order_settlements", input: { settleState: 0 }, errcode: 669900000, status: 400 },
    { name: "list_order_settlements", input: { settleState: 0 }, errcode: 669900001, status: 502 },
    { name: "list_merchant_tickets", input: {}, errcode: 40097, status: 400 },
    { name: "get_compass_shop_overview", input: { date: "20240520" }, errcode: 48001, status: 403 },
    {
      name: "update_delivery_info",
      input: { orderId, changeInfos: [{ old: oldPackage, new: newPackage }] },
      errcode: 606041,
      status: 409,
    },
    {
      name: "update_delivery_info",
      input: { orderId, changeInfos: [{ old: oldPackage, new: newPackage }] },
      errcode: 606034,
      status: 403,
    },
    {
      name: "send_exchange_delivery",
      input: { afterSaleOrderId: "after-1", deliveryId: "SF", waybillId: "SF123" },
      errcode: 10021059,
      status: 429,
    },
    {
      name: "send_exchange_delivery",
      input: { afterSaleOrderId: "after-1", deliveryId: "SF", waybillId: "SF123" },
      errcode: 10021065,
      status: 409,
    },
    {
      name: "send_exchange_delivery",
      input: { afterSaleOrderId: "after-1", deliveryId: "SF", waybillId: "SF123" },
      errcode: 10021050,
      status: 404,
    },
  ])(
    "surfaces $errcode from $name without retrying or fabricating an empty result",
    async ({ name, input, errcode, status }) => {
      const fetcher = stubWechatResponse({ errcode, errmsg: "Rejected" });
      const result = await executors[`weixin_store.${name}`]!(input, createContext());
      expect(result).toMatchObject({
        ok: false,
        error: { message: `WeChat API error ${errcode}: Rejected`, details: { status } },
      });
      expect(result).not.toHaveProperty("output");
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    { name: "list_order_settlements", input: { settleState: 3 } },
    { name: "list_merchant_tickets", input: { ticketClassType: 1 } },
    { name: "get_product_qr_code", input: { productId: "1", qrcodeType: 4 } },
    { name: "update_delivery_info", input: { orderId, changeInfos: [{ old: oldPackage }] } },
    {
      name: "reject_aftersale",
      input: { afterSaleOrderId: "after-1", rejectReasonType: 1, mediaFiles: [{ type: 1 }] },
    },
    {
      name: "reject_aftersale",
      input: {
        afterSaleOrderId: "after-1",
        rejectReasonType: 1,
        mediaFiles: [{ type: 2, picture: { c2cUrl: evidenceUrl } }],
      },
    },
  ])("rejects structurally invalid catalog input for $name", ({ name, input }) => {
    expect(validateActionInput(actionFor(name), input).valid).toBe(false);
  });
});

function imageStore(mimeType = "image/png", sizeBytes = 3): TransitFileStore {
  const file = new File([new Uint8Array(sizeBytes)], "evidence.png", { type: mimeType });
  return {
    maxBytes: 20 * 1024 * 1024,
    create: vi.fn(),
    read: vi.fn(async () => ({ file, sizeBytes: file.size, name: file.name, mimeType: file.type })),
    delete: vi.fn(),
  };
}

describe("WeChat Store after-sale evidence upload", () => {
  it("uploads scene 170 multipart media and passes the complete C2C link to rejection", async () => {
    const store = imageStore();
    const fetcher = stubWechatResponse({ errcode: 0, img_info: { img_url: evidenceUrl } });
    const action = actionFor("upload_aftersale_image");
    expect(action.operationType).toBe("write");
    expect(action.providerPermissions?.length).toBeGreaterThan(0);
    expect(validateActionInput(action, { file: { fileId: "fixture" } }).valid).toBe(true);
    const context = createContext(store);
    expect(await executors["weixin_store.upload_aftersale_image"]!({ file: { fileId: "fixture" } }, context)).toEqual({
      ok: true,
      output: { img_info: { img_url: evidenceUrl } },
    });
    const [url, init] = fetcher.mock.calls[1]!;
    expect(String(url)).toBe(
      "https://api.weixin.qq.com/shop/ec/basics/img/uploadv2?access_token=test-token&scene_type=170&upload_type=0",
    );
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).has("content-type")).toBe(false);
    expect(init?.body).toBeInstanceOf(FormData);
    if (!(init?.body instanceof FormData)) throw new Error("Expected a multipart evidence upload");
    const media = init.body.get("media") as File;
    expect(media.name).toBe("evidence.png");
    expect(media.type).toBe("image/png");
    expect(media.size).toBe(3);
    fetcher.mockResolvedValue(Response.json({ errcode: 0 }));
    expect(
      await executors["weixin_store.reject_aftersale"]!(
        {
          afterSaleOrderId: "after-1",
          rejectReasonType: 1,
          mediaFiles: [{ type: 1, picture: { c2cUrl: evidenceUrl } }],
        },
        context,
      ),
    ).toEqual({ ok: true, output: {} });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetcher.mock.calls[2]![1]?.body)).media_files).toEqual([
      { type: 1, picture: { c2c_url: evidenceUrl } },
    ]);
  });

  it.each([
    { mimeType: "image/webp", size: 3 },
    { mimeType: "image/svg+xml", size: 3 },
    { mimeType: "image/png", size: 0 },
    { mimeType: "image/png", size: 10 * 1024 * 1024 + 1 },
  ])("rejects unsupported evidence before network I/O: $mimeType/$size", async ({ mimeType, size }) => {
    const fetcher = stubWechatResponse({ errcode: 0 });
    expect(
      await executors["weixin_store.upload_aftersale_image"]!(
        { file: { fileId: "fixture" } },
        createContext(imageStore(mimeType, size)),
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
