import { describe, expect, it, vi } from "vitest";
import { sfExpressColdchainHandlers } from "./runtime-coldchain.ts";

const context = (fetcher: typeof fetch) => ({ partnerId: "TEST_PARTNER", checkWord: "TEST_CHECKWORD", fetcher });

const coldchainInner = (data: unknown): { code: string; success: boolean; message: string; data: unknown } => ({
  code: "0",
  success: true,
  message: "success",
  data,
});

/** The cold-chain family wraps apiResultData as a stringified JSON in some docs and as a raw object in others. */
const okEnvelope = (data: unknown, stringified = true): Response =>
  Response.json({
    apiResponseID: "resp-id",
    apiResultCode: "A1000",
    apiErrorMsg: "",
    apiResultData: stringified ? JSON.stringify(coldchainInner(data)) : coldchainInner(data),
  });

const bareInner = (body: Record<string, unknown>): Response => Response.json(body);

const readForm = (init?: RequestInit): URLSearchParams => new URLSearchParams(String(init?.body));

describe("SF Express cold-chain handlers", () => {
  it("checks a transport flow on the sfapi host and normalizes both sides plus temperature levels", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe("https://sfapi.sf-express.com/std/service");
      expect(JSON.parse(readForm(init).get("msgData")!)).toEqual({
        productCode: "SE0030",
        senderProvinceName: "广东省",
        senderCityName: "深圳市",
        senderCountyName: "南山区",
        senderCityAreaNumber: "755",
        senderAddress: "深圳清湖食品配送部",
        receiverProvinceName: "北京",
        receiverCityName: "北京市",
        receiverCountyName: "顺义区",
        receiverCityAreaNumber: "010",
        receiverAddress: "北京大兴食品中转场",
      });
      // This endpoint's doc example shows no outer apiResultCode envelope at all.
      return bareInner(
        coldchainInner({
          senderInfo: {
            serviceType: "DISPATCH",
            netpoint: { mdneUnitName: "深圳清湖食品配送部", mdneOuterBusinessStarttime: "09:00" },
          },
          receiverInfo: { serviceType: "ONLY_PICK_UP", netpoint: { mdneUnitName: "北京大兴食品中转场" } },
          temperatureLevel: [
            {
              ebcdCode: "2",
              ebcdNameCn: "0至10",
              ebcdTemperatureType: "冷藏",
              ebcdSquenceNo: 1,
              ebcdProductCode: "SE0030",
            },
          ],
        }),
      );
    });

    const output = await sfExpressColdchainHandlers.coldchain_check_transport_flow!(
      {
        product_code: "SE0030",
        sender_province_name: "广东省",
        sender_city_name: "深圳市",
        sender_county_name: "南山区",
        sender_city_area_number: "755",
        sender_address: "深圳清湖食品配送部",
        receiver_province_name: "北京",
        receiver_city_name: "北京市",
        receiver_county_name: "顺义区",
        receiver_city_area_number: "010",
        receiver_address: "北京大兴食品中转场",
      },
      context(fetcher),
    );

    expect(output).toEqual({
      senderInfo: {
        serviceType: "DISPATCH",
        netpoint: {
          mdneUnitName: "深圳清湖食品配送部",
          mdneDetailedAddress: undefined,
          mdneContactPhone: undefined,
          mdneOuterBusinessStarttime: "09:00",
          mdneOuterBusinessEndtime: undefined,
        },
      },
      receiverInfo: {
        serviceType: "ONLY_PICK_UP",
        netpoint: {
          mdneUnitName: "北京大兴食品中转场",
          mdneDetailedAddress: undefined,
          mdneContactPhone: undefined,
          mdneOuterBusinessStarttime: undefined,
          mdneOuterBusinessEndtime: undefined,
        },
      },
      temperatureLevel: [
        {
          ebcdCode: "2",
          ebcdNameCn: "0至10",
          ebcdTemperatureType: "冷藏",
          ebcdSquenceNo: "1",
          ebcdProductCode: "SE0030",
        },
      ],
    });
  });

  it("maps a bare cold-chain business failure to a 400 input error", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      bareInner({ code: "133", data: "", message: "该流向不存在", success: false }),
    );

    await expect(
      sfExpressColdchainHandlers.coldchain_check_transport_flow!(
        {
          product_code: "SE0030",
          sender_province_name: "广东省",
          sender_city_name: "深圳市",
          sender_county_name: "南山区",
          sender_city_area_number: "755",
          sender_address: "深圳清湖食品配送部",
          receiver_province_name: "北京",
          receiver_city_name: "北京市",
          receiver_county_name: "顺义区",
          receiver_city_area_number: "010",
          receiver_address: "北京大兴食品中转场",
        },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400, message: "该流向不存在" });
  });

  it("normalizes the per-product fee map from a stringified apiResultData", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData.erpOrder).toBe("ERP-1");
      expect(msgData.orderItems).toEqual([{ skuName: "牛肉", grossWeight: 12, volume: 12 }]);
      expect(msgData.orderServices).toEqual([{ serviceCode: "VA0021", serviceValue: "3000" }]);
      return okEnvelope(
        {
          SE0030: {
            code: "200",
            message: "success",
            model: [
              { totalAmount: 5.0, feeName: "保费", serviceCode: "VA0021" },
              { totalAmount: 100.0, feeName: "提货服务", serviceCode: "VA0058" },
            ],
          },
        },
        true,
      );
    });

    const output = await sfExpressColdchainHandlers.coldchain_estimate_transport_fee!(
      {
        erp_order: "ERP-1",
        product_code: "SE0030",
        order_time: "2026-09-05 12:12:12",
        shipper_province_name: "上海",
        shipper_city_name: "上海市",
        shipper_district_name: "黄浦区",
        shipper_location_name: "萧山区党柯路96-1号",
        consignee_province_name: "广东省",
        consignee_city_name: "深圳市",
        consignee_district_name: "南山区",
        consignee_location_name: "软件产业基地",
        order_items: [{ sku_name: "牛肉", gross_weight: 12, volume: 12 }],
        order_services: [{ service_code: "VA0021", service_value: "3000" }],
      },
      context(fetcher),
    );

    expect(output).toEqual({
      results: {
        SE0030: {
          code: "200",
          message: "success",
          fees: [
            { feeName: "保费", serviceCode: "VA0021", totalAmount: 5 },
            { feeName: "提货服务", serviceCode: "VA0058", totalAmount: 100 },
          ],
        },
      },
    });
  });

  it("maps pickup flags to 1/0 and keeps per-product estimate failures as results", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toEqual({
        consignTime: "2026-09-14 08:03:10",
        receiverCityAreaNumber: "010",
        senderCityAreaNumber: "755",
        productCode: "SE0030,SE003001",
        selfSendFlg: 1,
        oneselfPickupFlg: 0,
      });
      // This endpoint's doc example shows apiResultData as a raw object.
      return okEnvelope(
        [
          {
            productCode: "SE0030",
            code: "200",
            message: "success",
            effectiveInfo: {
              arriveTime: "2026-09-22 20:00:00",
              delayRemark: "sameCity111",
              planDescription: "每日发运",
              delayDay: "6",
              effectiveDay: "9",
            },
          },
          { productCode: "SE003001", code: "113", message: "无有效的时效配置" },
        ],
        false,
      );
    });

    const output = await sfExpressColdchainHandlers.coldchain_estimate_delivery_time!(
      {
        consign_time: "2026-09-14 08:03:10",
        receiver_city_area_number: "010",
        sender_city_area_number: "755",
        product_code: "SE0030,SE003001",
        self_send: true,
        oneself_pickup: false,
      },
      context(fetcher),
    );

    expect(output).toEqual({
      results: [
        {
          productCode: "SE0030",
          code: "200",
          message: "success",
          effectiveInfo: {
            arriveTime: "2026-09-22 20:00:00",
            delayRemark: "sameCity111",
            planDescription: "每日发运",
            delayDay: "6",
            effectiveDay: "9",
          },
        },
        { productCode: "SE003001", code: "113", message: "无有效的时效配置", effectiveInfo: undefined },
      ],
    });
  });

  it("builds the create order msgData with the fixed LAND transport type", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toMatchObject({
        erpOrder: "ERP00000001",
        productCode: "SE0030",
        paymentTypeCode: "PR_ACCOUNT",
        monthlyAccount: "7550612539",
        temperatureLevelCode: "2",
        transportType: "LAND",
        orderItems: [{ skuCode: "海鲜水产", skuName: "海鲜水产", quantity: 50, grossWeight: 12, volume: 12 }],
      });
      return okEnvelope({ erpOrder: "ERP00000001", sfOrderNo: "TP000000000000000001" });
    });

    const output = await sfExpressColdchainHandlers.coldchain_create_order!(
      {
        erp_order: "ERP00000001",
        product_code: "SE0030",
        payment_type_code: "PR_ACCOUNT",
        monthly_account: "7550612539",
        order_time: "2026-09-05 12:12:12",
        temperature_level_code: "2",
        shipper_contact_name: "李四",
        shipper_contact_tel: "18699998888",
        shipper_province_name: "广东省",
        shipper_city_name: "深圳市",
        shipper_district_name: "南山区",
        shipper_location_name: "学府路软件产业基地",
        consignee_contact_name: "钱多多",
        consignee_contact_tel: "18400001111",
        consignee_province_name: "安徽省",
        consignee_city_name: "蚌埠市",
        consignee_district_name: "淮上区",
        consignee_location_name: "安徽启航资产管理有限公司双墩路营业部",
        order_items: [{ sku_code: "海鲜水产", sku_name: "海鲜水产", quantity: 50, gross_weight: 12, volume: 12 }],
      },
      context(fetcher),
    );

    expect(output).toEqual({ sfOrderNo: "TP000000000000000001", erpOrder: "ERP00000001" });
  });

  it("rejects a monthly-settlement order without monthly_account before fetching", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      sfExpressColdchainHandlers.coldchain_create_order!(
        { erp_order: "ERP-1", payment_type_code: "PR_ACCOUNT" },
        context(fetcher),
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "monthly_account is required when payment_type_code is PR_ACCOUNT (寄付月结).",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns an empty object for a successful cancellation", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(JSON.parse(readForm(init).get("msgData")!)).toEqual({ erpOrder: "ERP-1", sfOrderNo: "TP-1" });
      return okEnvelope("");
    });

    const output = await sfExpressColdchainHandlers.coldchain_cancel_order!(
      { erp_order: "ERP-1", sf_order_no: "TP-1" },
      context(fetcher),
    );

    expect(output).toEqual({});
  });

  it("normalizes the waybill numbers response", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      okEnvelope(
        {
          erpOrder: "客户erp单号",
          sfOrderNo: "SF生成订单号",
          waybillNo: "运单号",
          receiptWaybillNo: "签回单号",
          childWaybillNos: ["子单号1", "子单号2"],
        },
        false,
      ),
    );

    const output = await sfExpressColdchainHandlers.coldchain_query_waybill_no!(
      { erp_order: "PO18101713423778" },
      context(fetcher),
    );

    expect(output).toEqual({
      erpOrder: "客户erp单号",
      sfOrderNo: "SF生成订单号",
      waybillNo: "运单号",
      receiptWaybillNo: "签回单号",
      childWaybillNos: ["子单号1", "子单号2"],
    });
  });

  it("requires one identifier for the route query before fetching", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      sfExpressColdchainHandlers.coldchain_query_route!({ source_code: "SFTEST" }, context(fetcher)),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("normalizes route events", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toEqual({ waybillNo: "978301989046", sourceCode: "SFTEST" });
      return okEnvelope(
        [
          {
            barScanTm: "2016-07-07 22:00:00",
            opCode: "50",
            owsRemark: "",
            outsideName: "深圳宝安新唐工业园营业部",
            distName: "深圳市",
            waybillNo: "978301989046",
            sfOrderNo: "OB342092375611829242-100",
            erpOrder: "PO18101713423778",
          },
        ],
        false,
      );
    });

    const output = await sfExpressColdchainHandlers.coldchain_query_route!(
      { waybill_no: "978301989046", source_code: "SFTEST" },
      context(fetcher),
    );

    expect(output).toEqual({
      routes: [
        {
          routeId: undefined,
          barScanTm: "2016-07-07 22:00:00",
          outsideName: "深圳宝安新唐工业园营业部",
          distName: "深圳市",
          opCode: "50",
          owsRemark: undefined,
          waybillNo: "978301989046",
          sfOrderNo: "OB342092375611829242-100",
          erpOrder: "PO18101713423778",
        },
      ],
    });
  });

  it("passes the order info document through with normalized container keys", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      okEnvelope(
        {
          order: { orderNo: "TP590256644432453632", waybillNo: "SF7001013145610", orderStatus: "已审核" },
          orderGoodsList: [{ skuCode: "牛肉", skuName: "牛肉", quantity: 10, grossWeight: 50, volume: 15 }],
          orderServiceList: [{ serviceCode: "VA0021", serviceName: "保价" }],
          orderReturn: { returnWaybillNo: "SF7001111675329" },
        },
        false,
      ),
    );

    const output = await sfExpressColdchainHandlers.coldchain_query_order_info!(
      { erp_order: "A01000009" },
      context(fetcher),
    );

    expect(output).toMatchObject({
      order: { orderNo: "TP590256644432453632", orderStatus: "已审核" },
      childWaybillList: [],
      orderGoodsList: [{ skuName: "牛肉" }],
      orderServiceList: [{ serviceCode: "VA0021" }],
      orderReturn: { returnWaybillNo: "SF7001111675329" },
    });
  });
});
