import { describe, expect, it, vi } from "vitest";
import { sfExpressFreightCoreHandlers } from "./runtime-freight-core.ts";

const context = (fetcher: typeof fetch) => ({ partnerId: "TEST_PARTNER", checkWord: "TEST_CHECKWORD", fetcher });

/** Most SF Freight docs show a bare business envelope without the apiResultCode layer. */
const okEnvelope = (obj: unknown): Response => Response.json({ obj, success: true });

const qcsEnvelope = (obj: unknown): Response =>
  Response.json({
    apiResponseID: "resp-id",
    apiResultCode: "A1000",
    apiErrorMsg: "",
    apiResultData: { success: true, errorCode: null, errorMsg: null, obj },
  });

const readForm = (init?: RequestInit): URLSearchParams => new URLSearchParams(String(init?.body));

const sender = {
  contact: "谢玉",
  mobile: "15012794320",
  province: "广东省",
  city: "深圳市",
  county: "罗湖区",
  address: "翠竹南路5412号",
};

const recipient = {
  contact: "彭伟",
  mobile: "18025383086",
  province: "广东省",
  city: "深圳市",
  county: "南山区",
  address: "粤海街道软件产业基地",
};

describe("SF Express freight core handlers", () => {
  it("builds the LTL order msgData with prefixed contacts and normalizes the result", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toMatchObject({
        orderId: "EP12343432232",
        isGenBillNo: 0,
        waybillNo: "SF1030346019019",
        subWaybills: "SF2070014483968,SF2070014483969",
        sendContact: "谢玉",
        sendMobile: "15012794320",
        sendProvince: "广东省",
        sendCity: "深圳市",
        sendCounty: "罗湖区",
        sendAddress: "翠竹南路5412号",
        deliveryContact: "彭伟",
        deliveryMobile: "18025383086",
        deliveryAddress: "粤海街道软件产业基地",
        customId: "7556000455",
        isDoCall: "1",
        payMethod: 1,
        declaredValue: 4,
        cargoList: [{ name: "小天鹅洗衣机", count: 1, weight: 26 }],
        additionServices: [{ name: "INSURE", value: "4" }],
      });
      return okEnvelope({
        orderId: "1638431361",
        waybillNo: "SF1030368080027",
        subWaybillNos: "SF2060036457654,SF2010285271160",
        destCode: "755A",
        filterResult: "2",
        remark: "IN100:加价管控",
        rlsInfo: { invokeResult: "OK" },
      });
    });

    const output = await sfExpressFreightCoreHandlers.freight_create_ltl_order!(
      {
        order_id: "EP12343432232",
        waybill_no: "SF1030346019019",
        sub_waybills: ["SF2070014483968", "SF2070014483969"],
        sender,
        recipient,
        monthly_card: "7556000455",
        is_do_call: true,
        pay_method: 1,
        declared_value: 4,
        cargo_list: [{ name: "小天鹅洗衣机", count: 1, weight: 26 }],
        addition_services: [{ name: "INSURE", value: "4" }],
      },
      context(fetcher),
    );

    expect(output).toEqual({
      orderId: "1638431361",
      waybillNo: "SF1030368080027",
      subWaybillNos: ["SF2060036457654", "SF2010285271160"],
      destCode: "755A",
      filterResult: 2,
      filterRemark: "IN100:加价管控",
      rlsInfo: { invokeResult: "OK" },
    });
  });

  it("generates the waybill number when none is reserved", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData.isGenBillNo).toBe(1);
      expect(msgData.waybillNo).toBeUndefined();
      return okEnvelope({ orderId: "EP12343432232", waybillNo: "SF1030368080027" });
    });

    await sfExpressFreightCoreHandlers.freight_create_ltl_order!(
      { order_id: "EP12343432232", sender, recipient, is_do_call: true, pay_method: 1 },
      context(fetcher),
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects a contact without mobile or tel and HIN service without total weight before fetching", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      sfExpressFreightCoreHandlers.freight_create_ltl_order!(
        {
          order_id: "EP1",
          sender: { contact: "谢玉", province: "广东省", city: "深圳市", county: "罗湖区", address: "翠竹南路5412号" },
          recipient,
          is_do_call: true,
          pay_method: 1,
        },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400, message: "sender requires either mobile or tel." });

    await expect(
      sfExpressFreightCoreHandlers.freight_create_ltl_order!(
        {
          order_id: "EP1",
          sender,
          recipient,
          is_do_call: true,
          pay_method: 1,
          addition_services: [{ name: "HIN" }],
        },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400 });

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("cancels an LTL order and echoes the order id", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(JSON.parse(readForm(init).get("msgData")!)).toEqual({ orderId: "EP12343432232", cancelType: "1" });
      return okEnvelope(undefined);
    });

    const output = await sfExpressFreightCoreHandlers.freight_cancel_ltl_order!(
      { order_id: "EP12343432232", reuse_order_id: true },
      context(fetcher),
    );

    expect(output).toEqual({ orderId: "EP12343432232" });
  });

  it("appends sub waybills with the documented count limit semantics", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(JSON.parse(readForm(init).get("msgData")!)).toEqual({ orderId: "EP12343432232", count: 10 });
      return okEnvelope({ orderId: "EP12343432232", waybillNo: "SF1030368080027", subWaybillNos: "SF2060036457654" });
    });

    const output = await sfExpressFreightCoreHandlers.freight_append_ltl_sub_waybill!(
      { order_id: "EP12343432232", count: 10 },
      context(fetcher),
    );

    expect(output).toMatchObject({ orderId: "EP12343432232", subWaybillNos: ["SF2060036457654"] });
  });

  it("maps the address coverage check and normalizes the verdict", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(JSON.parse(readForm(init).get("msgData")!)).toEqual({
        addressType: 2,
        province: "新疆维吾尔自治区",
        city: "乌鲁木齐市",
        district: "乌鲁木齐县",
        address: "南河路南十五巷",
      });
      return okEnvelope({ reachable: 1, resultMsg: "town reach" });
    });

    const output = await sfExpressFreightCoreHandlers.freight_check_address_reachable!(
      {
        direction: "delivery",
        province: "新疆维吾尔自治区",
        city: "乌鲁木齐市",
        district: "乌鲁木齐县",
        address: "南河路南十五巷",
      },
      context(fetcher),
    );

    expect(output).toEqual({ reachable: 1, resultMsg: "town reach" });
  });

  it("requires at least one pricing dimension and normalizes the price", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      sfExpressFreightCoreHandlers.freight_query_standard_price!(
        {
          sender: { province: "广东省", city: "深圳市", address: "高新南九道软件产业基地" },
          recipient: { province: "广东省", city: "深圳市" },
        },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();

    const ok = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toMatchObject({
        senderProvince: "广东省",
        senderAddress: "高新南九道软件产业基地",
        receiverProvince: "广东省",
        receiverCity: "深圳市",
        productCode: "SE0100",
        weight: 20,
      });
      return okEnvelope({ totalPrice: 38.0, currencyType: "CNY" });
    });

    const output = await sfExpressFreightCoreHandlers.freight_query_standard_price!(
      {
        sender: { province: "广东省", city: "深圳市", address: "高新南九道软件产业基地" },
        recipient: { province: "广东省", city: "深圳市" },
        product_code: "SE0100",
        weight: 20,
      },
      context(ok),
    );

    expect(output).toEqual({ totalPrice: 38.0, currencyType: "CNY", rate: undefined });
  });

  it("registers an LTL picture push with the catalog serviceCode", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const form = readForm(init);
      expect(form.get("serviceCode")).toBe("FOP_RECE_LTL_REGISTER_ROUTER");
      expect(JSON.parse(form.get("msgData")!)).toEqual({
        orderId: "1631013393",
        waybillNo: "SF1030355083520",
        imageTypes: ["68"],
      });
      return okEnvelope(undefined);
    });

    const output = await sfExpressFreightCoreHandlers.freight_register_ltl_picture_push!(
      { order_id: "1631013393", waybill_no: "SF1030355083520", image_types: ["68"] },
      context(fetcher),
    );

    expect(output).toEqual({ orderId: "1631013393", waybillNo: "SF1030355083520" });
  });

  it("normalizes the cross-border route with epoch-millis times", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(JSON.parse(readForm(init).get("msgData")!)).toEqual({
        waybillNo: "SF1020128167572",
        orderTime: "2023-03-01 22:20",
      });
      return okEnvelope({
        waybillNo: "SF1020128167572",
        cargoVolume: 0.027,
        cargoWeight: 33,
        cargoAmount: 1,
        expectDeliveryTime: 1671622140000,
        orderStatus: "50",
        payMethod: "月结",
        senderCity: "上海市",
        receiverCity: "Sir y Fflint - Flintshire",
        routeInfos: [{ info: "货物已签收", opCode: "980", status: 50, statusDesc: "已签收", time: 1671622140000 }],
        timeTag: "签收时间",
        waybillAmount: 2,
        subWaybillNos: ["1Z7709XW0394043193", "1Z8174V40300279941"],
        waybillReceived: 1,
        waybillTransporting: 1,
        waybillDelivering: 0,
      });
    });

    const output = await sfExpressFreightCoreHandlers.freight_query_crossborder_route!(
      { waybill_no: "SF1020128167572", order_time: "2023-03-01 22:20" },
      context(fetcher),
    );

    expect(output).toMatchObject({
      waybillNo: "SF1020128167572",
      orderStatus: "50",
      expectDeliveryTime: 1671622140000,
      routeInfos: [{ info: "货物已签收", status: 50, statusDesc: "已签收", time: 1671622140000, opCode: "980" }],
      subWaybillNos: ["1Z7709XW0394043193", "1Z8174V40300279941"],
    });
  });

  it("normalizes the transfer route list where obj is an array", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      okEnvelope([{ info: "货物已签收", opCode: "980", status: 50, statusDesc: "已签收", time: 1671622140000 }]),
    );

    const output = await sfExpressFreightCoreHandlers.freight_query_crossborder_transfer_routes!(
      { waybill_no: "1Z7709XW0394043193" },
      context(fetcher),
    );

    expect(output).toEqual({
      routes: [{ info: "货物已签收", status: 50, statusDesc: "已签收", time: 1671622140000, opCode: "980" }],
    });
  });

  it("sends the verbatim ROTE serviceCode and tolerates string order statuses", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const form = readForm(init);
      expect(form.get("serviceCode")).toBe("FOP_RECE_IFOS_WAYBILL_ROTE_FIND_CHILDREN");
      return okEnvelope({
        receiverCity: "Sir y Fflint - Flintshire",
        senderCity: "上海市",
        waybillAmount: 2,
        waybillReceived: 1,
        waybillTransporting: 1,
        childrenList: [
          {
            orderStatus: "50",
            receiverCity: "Sir y Fflint - Flintshire",
            senderCity: "上海市",
            waybillNo: "1Z7709XW0394043193",
          },
        ],
      });
    });

    const output = await sfExpressFreightCoreHandlers.freight_list_crossborder_transfer_nos!(
      { waybill_no: "SF1020128167572" },
      context(fetcher),
    );

    expect(output).toMatchObject({
      waybillAmount: 2,
      childrenList: [{ orderStatus: 50, waybillNo: "1Z7709XW0394043193" }],
    });
  });

  it("reports a work order with the fixed business category and reads workOrderId from the QCS envelope", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const form = readForm(init);
      expect(form.get("serviceCode")).toBe("FOP_RECE_QCS_WORK_ORDER_REPORT");
      expect(JSON.parse(form.get("msgData")!)).toEqual({
        orderNo: "SF123132546456",
        creator: "小李",
        creatorPhone: "13322222222",
        bussCategory: 0,
        orderCategoryOne: "预约异常",
        orderCategoryTwo: "客户电话错误",
        urgencyDegree: 2,
        reportContent: "客户电话无法联系上，请协助解决",
        pics: "https://example.com/a.png,https://example.com/b.png",
        afterHandleReplyTime: 120,
        reportSourceNo: "BDSFNRJKGTBWQE123628746785",
      });
      return qcsEnvelope({ workOrderId: "489461" });
    });

    const output = await sfExpressFreightCoreHandlers.freight_report_work_order!(
      {
        order_no: "SF123132546456",
        creator: "小李",
        creator_phone: "13322222222",
        category_one: "预约异常",
        category_two: "客户电话错误",
        urgency: "urgent",
        content: "客户电话无法联系上，请协助解决",
        pics: ["https://example.com/a.png", "https://example.com/b.png"],
        handle_time_limit_minutes: 120,
        report_source_no: "BDSFNRJKGTBWQE123628746785",
      },
      context(fetcher),
    );

    expect(output).toEqual({ workOrderId: "489461" });
  });

  it("replies to a work order and requires at least one identifier", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      sfExpressFreightCoreHandlers.freight_reply_work_order!(
        { reply_id: "r1", content: "处理中", reply_name: "小李", is_done: false },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400, message: "At least one of work_order_id or report_source_no is required." });
    expect(fetcher).not.toHaveBeenCalled();

    const ok = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toMatchObject({ workOrderId: "185944", replyId: "r1", isDone: 0, isSolve: 1 });
      return qcsEnvelope(undefined);
    });

    const output = await sfExpressFreightCoreHandlers.freight_reply_work_order!(
      {
        work_order_id: "185944",
        reply_id: "r1",
        content: "处理中",
        reply_name: "小李",
        is_done: false,
        is_solve: true,
      },
      context(ok),
    );

    expect(output).toEqual({ replyId: "r1" });
  });
});
