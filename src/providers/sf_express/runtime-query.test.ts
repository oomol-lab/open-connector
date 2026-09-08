import { describe, expect, it, vi } from "vitest";
import { sfExpressQueryHandlers } from "./runtime-query.ts";

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

describe("SF Express service-query handlers", () => {
  it("treats an invalid waybill number as a result, not an error", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => okEnvelope(false));

    const output = await sfExpressQueryHandlers.validate_waybill_no!({ waybill_no: "123" }, context(fetcher));

    expect(output).toEqual({ waybillNo: "123", valid: false });
  });

  it("builds the route query and normalizes routeResps including empty routes", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toEqual({
        trackingType: 1,
        trackingNumber: ["SF111", "SF222"],
        checkPhoneNo: "0001,0002",
        language: "zh-CN",
      });
      return okEnvelope({
        routeResps: [
          {
            mailNo: "SF111",
            routes: [
              {
                acceptTime: "2026-09-01 12:43:35",
                acceptAddress: "深圳市",
                remark: "快件已揽收",
                opCode: "50",
                secondaryStatusCode: "101",
                secondaryStatusName: "揽收",
              },
            ],
          },
          { mailNo: "SF222", routes: [], reasonCode: ["741"], reasonRemark: ["运单付款月结卡与顾客编码未绑定"] },
        ],
      });
    });

    const output = await sfExpressQueryHandlers.search_routes!(
      { tracking_numbers: ["SF111", "SF222"], check_phone_nos: ["0001", "0002"], language: "zh-CN" },
      context(fetcher),
    );

    expect(output).toEqual({
      results: [
        {
          mailNo: "SF111",
          routes: [
            {
              acceptTime: "2026-09-01 12:43:35",
              acceptAddress: "深圳市",
              remark: "快件已揽收",
              opCode: "50",
              firstStatusCode: undefined,
              firstStatusName: undefined,
              secondaryStatusCode: "101",
              secondaryStatusName: "揽收",
            },
          ],
          reasonCode: undefined,
          reasonRemark: undefined,
        },
        { mailNo: "SF222", routes: [], reasonCode: ["741"], reasonRemark: ["运单付款月结卡与顾客编码未绑定"] },
      ],
    });
  });

  it("maps tracking_type client_order to 2", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(JSON.parse(readForm(init).get("msgData")!).trackingType).toBe(2);
      return okEnvelope({ routeResps: [] });
    });

    await sfExpressQueryHandlers.search_routes!(
      { tracking_numbers: ["ORDER-1"], tracking_type: "client_order" },
      context(fetcher),
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("maps inner business errors by error code", async () => {
    const inputError = vi.fn<typeof fetch>(async () => businessError("S0002", "必填参数trackingNumber为空"));
    await expect(
      sfExpressQueryHandlers.search_routes!({ tracking_numbers: ["SF111"] }, context(inputError)),
    ).rejects.toMatchObject({ status: 400, message: "必填参数trackingNumber为空" });

    const providerError = vi.fn<typeof fetch>(async () => businessError("S0003", "check failed"));
    await expect(
      sfExpressQueryHandlers.estimate_delivery_time!(
        { waybill_no: "SF1000181136590", check_type: "phone", check_nos: ["13800138000"] },
        context(providerError),
      ),
    ).rejects.toMatchObject({ status: 502, message: "check failed" });
  });

  it("requires monthly_card with business_type and a resolvable address before fetching", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      sfExpressQueryHandlers.query_delivery_time_price!(
        {
          src_address: { province: "广东省", city: "深圳市" },
          dest_address: { code: "755" },
          business_type: "2",
        },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400, message: "monthly_card is required when business_type is set." });

    await expect(
      sfExpressQueryHandlers.query_delivery_time_price!(
        { src_address: { district: "南山区" }, dest_address: { code: "755" } },
        context(fetcher),
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "src_address requires code, both province and city, or a detailed address.",
    });

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("builds the delivery standards query and normalizes deliverTmDto", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toEqual({
        businessType: "2",
        monthlyCard: "5125690150",
        weight: 1.5,
        consignedTime: "2026-09-05 17:01:48",
        searchPrice: "1",
        srcAddress: { province: "广东省", city: "深圳市", district: "南山区" },
        destAddress: { code: "020" },
      });
      return okEnvelope({
        deliverTmDto: [
          {
            businessType: "2",
            businessTypeDesc: "顺丰标快",
            deliverTime: "2026-09-06 18:00:00,2026-09-06 18:00:00",
            fee: null,
            searchPrice: "1",
            closeTime: null,
          },
        ],
      });
    });

    const output = await sfExpressQueryHandlers.query_delivery_time_price!(
      {
        src_address: { province: "广东省", city: "深圳市", district: "南山区" },
        dest_address: { code: "020" },
        business_type: "2",
        monthly_card: "5125690150",
        weight: 1.5,
        consigned_time: "2026-09-05 17:01:48",
        search_price: true,
      },
      context(fetcher),
    );

    expect(output).toEqual({
      options: [
        {
          businessType: "2",
          businessTypeDesc: "顺丰标快",
          deliverTime: "2026-09-06 18:00:00,2026-09-06 18:00:00",
          fee: null,
          searchPrice: "1",
          closeTime: null,
        },
      ],
    });
  });

  it("maps check_type to the numeric checkType for promised delivery time", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toEqual({ searchNo: "SF1000181136590", checkType: 2, checkNos: ["5125690150"] });
      return okEnvelope({ searchNo: "SF1000181136590", promiseTm: "2026-09-08 12:00:00" });
    });

    const output = await sfExpressQueryHandlers.estimate_delivery_time!(
      { waybill_no: "SF1000181136590", check_type: "monthly_card", check_nos: ["5125690150"] },
      context(fetcher),
    );

    expect(output).toEqual({ searchNo: "SF1000181136590", promiseTm: "2026-09-08 12:00:00" });
  });

  it("builds a filter_order batch and normalizes resDtos", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toEqual([
        {
          filterType: 1,
          orderId: "TE201407020016",
          contactInfos: [
            { contactType: 1, province: "四川省", city: "成都市", address: "测试地址A" },
            {
              contactType: 2,
              tel: "19851401196",
              province: "天津市",
              city: "天津市",
              county: "武清区",
              address: "创业总部基地B07二楼",
            },
          ],
        },
      ]);
      return Response.json({
        success: true,
        errorCode: null,
        errorMsg: null,
        msgData: {
          resDtos: [{ orderId: "TE201407020016", filterResult: 3, originCode: "test", destCode: "test", remark: "2" }],
        },
      });
    });

    const output = await sfExpressQueryHandlers.filter_order!(
      {
        orders: [
          {
            order_id: "TE201407020016",
            sender: { province: "四川省", city: "成都市", address: "测试地址A" },
            recipient: {
              tel: "19851401196",
              province: "天津市",
              city: "天津市",
              county: "武清区",
              address: "创业总部基地B07二楼",
            },
          },
        ],
      },
      context(fetcher),
    );

    expect(output).toEqual({
      results: [{ orderId: "TE201407020016", filterResult: 3, originCode: "test", destCode: "test", remark: "2" }],
    });
  });

  it("normalizes the live filter_order array response", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      okEnvelope([{ orderId: "TE201407020016", filterResult: 3, originCode: "755", destCode: "020" }]),
    );

    const output = await sfExpressQueryHandlers.filter_order!(
      {
        orders: [
          {
            order_id: "TE201407020016",
            sender: { province: "四川省", city: "成都市", address: "测试地址A" },
            recipient: { province: "天津市", city: "天津市", address: "测试地址B" },
          },
        ],
      },
      context(fetcher),
    );

    expect(output).toEqual({
      results: [{ orderId: "TE201407020016", filterResult: 3, originCode: "755", destCode: "020", remark: undefined }],
    });
  });

  it("parses the stringified msgData of the service points response", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toEqual({ x: "113.9", y: "22.5", deptType: "1|5", distance: 1000 });
      return okEnvelope(
        JSON.stringify({
          count: 1,
          result: [
            {
              address: "广东省深圳市宝安区劳动村二队二巷3号山木居大门左侧丰巢智能柜",
              distance: 153,
              id: "FC75517510",
              latitude: 22,
              longitude: 113,
              name: "丰巢智能柜",
              servertype: "2",
            },
          ],
          src: "tcp-geo-dp",
          status: 0,
        }),
      );
    });

    const output = await sfExpressQueryHandlers.query_service_points!(
      { longitude: 113.9, latitude: 22.5, dept_types: ["1", "5"], distance: 1000 },
      context(fetcher),
    );

    expect(output).toMatchObject({
      status: 0,
      count: 1,
      src: "tcp-geo-dp",
      result: [{ id: "FC75517510", name: "丰巢智能柜", distance: 153 }],
    });
  });

  it("rejects a service point query without address or coordinates", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(sfExpressQueryHandlers.query_service_points!({}, context(fetcher))).rejects.toMatchObject({
      status: 400,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("builds the recommend_product query and normalizes the product list", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toMatchObject({
        srcProvince: "广东省",
        srcCity: "深圳市",
        destProvince: "广东省",
        destCity: "深圳市",
        srcAddress: "南山区南新路1001室",
        destAddress: "龙岗区龙岗大道50米",
        sendTime: "2026-09-05 14:47:00",
        weight: 5,
        paymentTerms: "1",
        commodityNameList: ["文件", "苹果"],
      });
      return okEnvelope({
        fastigiumControlStrategyList: [{ productCode: "S2", controlStrategy: "4", notificationMsg: "偏远附加费提示" }],
        productList: [
          {
            productCode: "S2",
            productName: "顺丰标快",
            productDisplayName: "顺丰标快",
            expressType: "2",
            recommendProductType: "2",
            sortNo: 16,
            reachTime: "2026-09-06 12:00",
            totalFee: 19,
            freight: 19,
            currency: "CNY",
            serviceFeeList: [],
          },
        ],
      });
    });

    const output = await sfExpressQueryHandlers.recommend_product!(
      {
        src_province: "广东省",
        src_city: "深圳市",
        dest_province: "广东省",
        dest_city: "深圳市",
        src_address: "南山区南新路1001室",
        dest_address: "龙岗区龙岗大道50米",
        send_time: "2026-09-05 14:47:00",
        weight: 5,
        payment_terms: "1",
        commodity_names: ["文件", "苹果"],
      },
      context(fetcher),
    );

    expect(output).toMatchObject({
      products: [
        {
          productCode: "S2",
          productName: "顺丰标快",
          recommendProductType: 2,
          sortNo: 16,
          totalFee: 19,
          freight: 19,
          currency: "CNY",
        },
      ],
      controlStrategies: [{ productCode: "S2", controlStrategy: "4", notificationMsg: "偏远附加费提示" }],
    });
  });

  it("builds the recommend_vas query and accepts a bare service array", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toMatchObject({
        expressType: "2",
        srcProvince: "安徽省",
        srcCity: "合肥市",
        destProvince: "青海省",
        destCity: "西宁市",
        sendTime: "2026-09-05 09:00:00",
        weight: 5,
        payMethod: "1",
        packageNumber: 1,
        payCountry: "CN",
        arrivalTime: "2026-09-06 09:00:00",
        singleTicketReq: { realTotalWeight: 120, piecesNumber: 1 },
      });
      return okEnvelope([
        { recommendedType: "1", vasCode: "IN67", vasName: "保鲜服务", floorPrice: "22.1", currency: "CNY" },
      ]);
    });

    const output = await sfExpressQueryHandlers.recommend_vas!(
      {
        express_type: "2",
        src_province: "安徽省",
        src_city: "合肥市",
        dest_province: "青海省",
        dest_city: "西宁市",
        send_time: "2026-09-05 09:00:00",
        weight: 5,
        pay_method: "1",
        package_number: 1,
        pay_country: "CN",
        arrival_time: "2026-09-06 09:00:00",
        single_ticket: { real_total_weight: 120, pieces_number: 1 },
      },
      context(fetcher),
    );

    expect(output).toEqual({
      services: [{ recommendedType: 1, vasCode: "IN67", vasName: "保鲜服务", floorPrice: 22.1, currency: "CNY" }],
    });
  });

  it("answers a bare boolean for pickup time V1.0 and a window for V1.1", async () => {
    const v10 = vi.fn<typeof fetch>(async () => okEnvelope(true));
    await expect(
      sfExpressQueryHandlers.check_pickup_time!(
        {
          address: "深圳市南山区软件产业基地1栋A座",
          address_type: "sender",
          send_time: "2026-09-05 12:00:00",
          city_code: "755",
        },
        context(v10),
      ),
    ).resolves.toEqual({ status: true });

    const v11 = vi.fn<typeof fetch>(async (_url, init) => {
      expect(JSON.parse(readForm(init).get("msgData")!).version).toBe("V1.1");
      return okEnvelope({ status: true, startTm: "0600", endTm: "2100", system: null, exceptionReason: null });
    });
    await expect(
      sfExpressQueryHandlers.check_pickup_time!(
        {
          address: "深圳市南山区软件产业基地1栋A座",
          address_type: "sender",
          send_time: "2026-09-05 12:00:00",
          city_code: "755",
          include_time_window: true,
        },
        context(v11),
      ),
    ).resolves.toEqual({ status: true, startTm: "0600", endTm: "2100", system: undefined, exceptionReason: undefined });
  });

  it("requires province, city and county when city_code is omitted", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      sfExpressQueryHandlers.check_pickup_time!(
        { address: "某地址", address_type: "sender", send_time: "2026-09-05 12:00:00", province: "广东省" },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400, message: "Provide city_code, or all of province, city and county." });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
