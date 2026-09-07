import { describe, expect, it, vi } from "vitest";
import { sfExpressOrderHandlers } from "./runtime-order.ts";

const context = (fetcher: typeof fetch) => ({ partnerId: "TEST_PARTNER", checkWord: "TEST_CHECKWORD", fetcher });

const okEnvelope = (msgData: unknown): Response =>
  Response.json({
    apiResponseID: "resp-id",
    apiResultCode: "A1000",
    apiErrorMsg: "",
    apiResultData: JSON.stringify({ success: true, errorCode: "S0000", errorMsg: null, msgData }),
  });

const businessError = (errorCode: string, errorMsg: string): Response =>
  Response.json({
    apiResponseID: "resp-id",
    apiResultCode: "A1000",
    apiErrorMsg: "",
    apiResultData: JSON.stringify({ success: false, errorCode, errorMsg, msgData: null }),
  });

const readForm = (init?: RequestInit): URLSearchParams => new URLSearchParams(String(init?.body));

const sender = {
  contact: "顺小丰",
  mobile: "13480155048",
  province: "广东省",
  city: "深圳市",
  address: "软件产业基地11栋",
};
const recipient = {
  company: "顺丰速运",
  contact: "顺小丰",
  mobile: "13925211148",
  province: "广东省",
  city: "广州市",
  address: "白云区湖北大厦",
};

describe("SF Express general-shipping handlers", () => {
  it("builds a create_order msgData with sender/recipient contacts and defaults", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toEqual({
        language: "zh-CN",
        orderId: "ORDER-1",
        expressTypeId: 1,
        cargoDetails: [{ name: "文件", count: 2 }],
        contactInfoList: [
          {
            contactType: 1,
            contact: "顺小丰",
            mobile: "13480155048",
            country: "CN",
            province: "广东省",
            city: "深圳市",
            address: "软件产业基地11栋",
          },
          {
            contactType: 2,
            company: "顺丰速运",
            contact: "顺小丰",
            mobile: "13925211148",
            country: "CN",
            province: "广东省",
            city: "广州市",
            address: "白云区湖北大厦",
          },
        ],
        monthlyCard: "7551234567",
        isDocall: 1,
        isSignBack: 0,
      });
      return okEnvelope({
        orderId: "ORDER-1",
        originCode: "755",
        destCode: "020",
        filterResult: 2,
        waybillNoInfoList: [{ waybillType: 1, waybillNo: "SF7444400043266" }],
        routeLabelInfo: [{ code: "1000", routeLabelData: { destRouteLabel: "710VA-F" }, message: "" }],
      });
    });

    const output = await sfExpressOrderHandlers.create_order!(
      {
        order_id: "ORDER-1",
        express_type_id: 1,
        sender,
        recipient,
        cargo_details: [{ name: "文件", count: 2 }],
        monthly_card: "7551234567",
        is_docall: true,
        is_sign_back: false,
      },
      context(fetcher),
    );

    expect(output).toEqual({
      orderId: "ORDER-1",
      originCode: "755",
      destCode: "020",
      filterResult: 2,
      waybillNoInfoList: [{ waybillType: 1, waybillNo: "SF7444400043266" }],
      routeLabelInfo: [{ code: "1000", routeLabelData: { destRouteLabel: "710VA-F" }, message: "" }],
      url: null,
      paymentLink: null,
    });
  });

  it("disables waybill allocation when bringing existing waybill numbers", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData.isGenWaybillNo).toBe(0);
      expect(msgData.waybillNoInfoList).toEqual([{ waybillType: 1, waybillNo: "SF123456789012" }]);
      return okEnvelope({ orderId: "ORDER-2", waybillNoInfoList: [] });
    });

    await sfExpressOrderHandlers.create_order!(
      {
        order_id: "ORDER-2",
        sender,
        recipient,
        cargo_details: [{ name: "文件" }],
        waybill_no_info_list: [{ waybill_type: 1, waybill_no: "SF123456789012" }],
      },
      context(fetcher),
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("enforces create_order conditional requirements before fetching", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      sfExpressOrderHandlers.create_order!(
        {
          order_id: "X",
          express_type_id: 1,
          scene_plan_code: "PLAN",
          sender,
          recipient,
          cargo_details: [{ name: "文件" }],
        },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400, message: "express_type_id and scene_plan_code are mutually exclusive." });

    await expect(
      sfExpressOrderHandlers.create_order!(
        { order_id: "X", express_type_id: 12, sender, recipient, cargo_details: [{ name: "冷藏药品" }] },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      sfExpressOrderHandlers.create_order!(
        { order_id: "X", sender: { ...sender, mobile: undefined }, recipient, cargo_details: [{ name: "文件" }] },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400, message: "sender requires at least one of tel or mobile." });

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps pre_order contact fields and normalizes the time window array", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData.contactInfoList[0]).toEqual({
        contactType: 1,
        mobile: "13480155048",
        province: "广东省",
        city: "深圳市",
        address: "软件产业基地11栋",
      });
      expect(msgData.cargoName).toBe("手机");
      return okEnvelope([
        { serviceDate: "2026-09-06", startTime: "2026-09-06 08:30:00", endTime: "2026-09-06 21:00:00" },
      ]);
    });

    const output = await sfExpressOrderHandlers.pre_order!(
      {
        order_id: "LP00461749454112",
        sender: { mobile: "13480155048", province: "广东省", city: "深圳市", address: "软件产业基地11栋" },
        recipient: { tel: "13925211148", province: "广东省", city: "广州市", address: "白云区湖北大厦" },
        cargo_name: "手机",
      },
      context(fetcher),
    );

    expect(output).toEqual({
      windows: [{ serviceDate: "2026-09-06", startTime: "2026-09-06 08:30:00", endTime: "2026-09-06 21:00:00" }],
    });
  });

  it("builds update_order cancel and confirm variants", async () => {
    const cancelFetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toEqual({ orderId: "ORDER-3", dealType: 2 });
      return okEnvelope({ orderId: "ORDER-3", resStatus: 2, waybillNoInfoList: [] });
    });
    const cancelled = await sfExpressOrderHandlers.update_order!(
      { order_id: "ORDER-3", deal_type: "cancel" },
      context(cancelFetcher),
    );
    expect(cancelled).toEqual({ orderId: "ORDER-3", resStatus: 2, waybillNoInfoList: [] });

    const confirmFetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData.dealType).toBe(1);
      expect(msgData.waybillNoInfoList).toEqual([{ waybillType: 1, waybillNo: "SF2000090670189" }]);
      expect(msgData.totalWeight).toBe(2.09);
      return okEnvelope({ orderId: "ORDER-3", resStatus: 2, waybillNoInfoList: [] });
    });
    await sfExpressOrderHandlers.update_order!(
      {
        order_id: "ORDER-3",
        deal_type: "confirm",
        total_weight: 2.09,
        waybill_no_info_list: [{ waybill_type: 1, waybill_no: "SF2000090670189" }],
      },
      context(confirmFetcher),
    );

    await expect(
      sfExpressOrderHandlers.update_order!(
        { order_id: "ORDER-3", deal_type: "confirm" },
        context(vi.fn<typeof fetch>()),
      ),
    ).rejects.toMatchObject({ status: 400, message: "waybill_no_info_list is required when confirming an order." });
  });

  it("builds query_order_result with search_type mapping and normalizes the response", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toEqual({ orderId: "TE201407020016", searchType: "2" });
      return okEnvelope({
        orderId: "TE201407020016",
        origincode: "769",
        destcode: "020",
        filterResult: "2",
        waybillNoInfoList: [{ waybillNo: "SF7444400034485", waybillType: 1 }],
        routeLabelInfo: [],
      });
    });

    const output = await sfExpressOrderHandlers.query_order_result!(
      { order_id: "TE201407020016", search_type: "return" },
      context(fetcher),
    );

    expect(output).toEqual({
      orderId: "TE201407020016",
      origincode: "769",
      destcode: "020",
      filterResult: "2",
      waybillNoInfoList: [{ waybillNo: "SF7444400034485", waybillType: 1 }],
      routeLabelInfo: [],
    });
  });

  it("builds get_sub_waybill_nos and normalizes allocated numbers", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(JSON.parse(readForm(init).get("msgData")!)).toEqual({ orderId: "F2_1", parcelQty: 2 });
      return okEnvelope({
        orderId: "F2_1",
        waybillNoInfoList: [
          { waybillType: 2, waybillNo: "SF2000169567604" },
          { waybillType: 1, waybillNo: "SF1011638677010" },
        ],
      });
    });

    const output = await sfExpressOrderHandlers.get_sub_waybill_nos!(
      { order_id: "F2_1", parcel_qty: 2 },
      context(fetcher),
    );

    expect(output).toEqual({
      orderId: "F2_1",
      parcelQty: null,
      waybillNoInfoList: [
        { waybillType: 2, waybillNo: "SF2000169567604" },
        { waybillType: 1, waybillNo: "SF1011638677010" },
      ],
    });
  });

  it("builds intercept_order with the instruction code maps and validates conditions", async () => {
    const newDestAddress = {
      province: "广东省",
      city: "深圳市",
      county: "南山区",
      address: "粤海街道海阔天空雅居B栋16B",
      contact: "周大星",
      phone: "15922226666",
    };
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toEqual({
        waybillNo: "SF444201931741",
        serviceCode: "1",
        role: "1",
        payMode: "4",
        monthlyCardNo: "9999999999",
        newDestAddress,
      });
      return okEnvelope({
        cusId: "CUS13275892903196672",
        amount: 0,
        freightAdditionInfoResp: { interceptionDeptCode: "755W", transferFlg: "1" },
      });
    });

    const output = await sfExpressOrderHandlers.intercept_order!(
      {
        waybill_no: "SF444201931741",
        action_type: "redirect",
        role: "sender",
        pay_mode: "sender_monthly",
        monthly_card_no: "9999999999",
        new_dest_address: newDestAddress,
      },
      context(fetcher),
    );

    expect(output).toEqual({
      cusId: "CUS13275892903196672",
      amount: 0,
      freightAdditionInfoResp: { interceptionDeptCode: "755W", transferFlg: "1" },
    });

    const noFetch = vi.fn<typeof fetch>();
    await expect(
      sfExpressOrderHandlers.intercept_order!(
        { waybill_no: "SF1", action_type: "redirect", role: "sender", pay_mode: "sender_cash" },
        context(noFetch),
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "new_dest_address is required for redirect (转寄) and return (退回).",
    });
    await expect(
      sfExpressOrderHandlers.intercept_order!(
        { waybill_no: "SF1", action_type: "change_cod", role: "sender", pay_mode: "sender_cash" },
        context(noFetch),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      sfExpressOrderHandlers.intercept_order!(
        { waybill_no: "SF1", action_type: "void", role: "sender", pay_mode: "sender_cash", cancel: true },
        context(noFetch),
      ),
    ).rejects.toMatchObject({ status: 400, message: "command_id is required when cancel is true." });
    expect(noFetch).not.toHaveBeenCalled();
  });

  it("sends send_delivery_notice and reports acceptance", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(JSON.parse(readForm(init).get("msgData")!)).toEqual({ waybillNo: "SF7444400067318", dataType: "71" });
      return okEnvelope(null);
    });

    const output = await sfExpressOrderHandlers.send_delivery_notice!(
      { waybill_no: "SF7444400067318", data_type: "delivery" },
      context(fetcher),
    );

    expect(output).toEqual({ waybillNo: "SF7444400067318", notified: true });
  });

  it("builds query_waybill_fee in both query modes and normalizes the fee breakdown", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(JSON.parse(readForm(init).get("msgData")!)).toEqual({ trackingType: "2", trackingNum: "SF1390005252176" });
      return okEnvelope({
        waybillInfo: {
          orderId: "3eb3e404",
          waybillNo: "SF1040460455098",
          customerAcctCode: "7551236549",
          meterageWeightQty: 1.0,
          realWeightQty: 1.0,
          expressTypeName: "顺丰标快",
          jProvince: "广东省",
          dCity: "深圳市",
        },
        waybillFeeList: [
          { type: "1", name: "运费", value: 15.0 },
          { type: "3", name: "基础保", value: 6.0 },
        ],
      });
    });

    const output = await sfExpressOrderHandlers.query_waybill_fee!(
      { query_type: "waybill", tracking_num: "SF1390005252176" },
      context(fetcher),
    );

    expect(output).toMatchObject({
      waybillInfo: { waybillNo: "SF1040460455098", meterageWeightQty: 1.0, expressTypeName: "顺丰标快" },
      waybillFeeList: [
        { type: "1", name: "运费", value: 15.0 },
        { type: "3", name: "基础保", value: 6.0 },
      ],
    });
  });

  it("maps order business error codes to 400", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => businessError("8016", "重复下单"));

    await expect(
      sfExpressOrderHandlers.create_order!(
        { order_id: "ORDER-1", sender, recipient, cargo_details: [{ name: "文件" }] },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400, message: "重复下单" });
  });
});
