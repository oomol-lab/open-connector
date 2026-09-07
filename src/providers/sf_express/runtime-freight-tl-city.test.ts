import { describe, expect, it, vi } from "vitest";
import { sfExpressFreightTlCityHandlers } from "./runtime-freight-tl-city.ts";

const context = (fetcher: typeof fetch) => ({ partnerId: "TEST_PARTNER", checkWord: "TEST_CHECKWORD", fetcher });

const readForm = (init?: RequestInit): URLSearchParams => new URLSearchParams(String(init?.body));

const readMsgData = (init?: RequestInit): unknown => JSON.parse(readForm(init).get("msgData")!);

/** Bare UFTL (city-delivery) envelope: { status, msg, data } — no apiResultCode at all. */
const uftlEnvelope = (status: number, data: unknown, msg = "success"): Response => Response.json({ status, msg, data });

/** Bare truckload envelope: { success, errorCode, errorMessage, obj }. */
const tlEnvelope = (obj: unknown): Response =>
  Response.json({ success: true, errorCode: null, errorMessage: null, obj });

describe("SF Express freight truckload handlers", () => {
  it("builds a truckload order with flat send/delivery fields and normalizes the result", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(readForm(init).get("serviceCode")).toBe("FOP_RECE_TL_CREATE_ORDER");
      expect(readMsgData(init)).toEqual({
        orderId: "TL-20260905-001",
        operaterType: 1,
        payMethod: 1,
        custId: "7551234567",
        isGenWaybillNo: 1,
        sendContact: "张三",
        sendMobile: "13112345678",
        sendAddress: "新洲十一街万基商务大厦10楼",
        sendProvince: "广东省",
        sendCity: "深圳市",
        deliveryContact: "李四",
        deliveryMobile: "15000000008",
        deliveryAddress: "上海市浦东新区世纪大道1号",
        cargoName: "冰箱",
        vehicleType: "5",
        needTrackingReturn: 1,
        expectedStops: [{ stopAddress: "东莞市中转仓", stopOperateType: 3, stopCity: "东莞市" }],
      });
      return tlEnvelope({ orderId: "TL-20260905-001", waybillNo: "SF7000000000001", signBackWaybillNo: null });
    });

    const output = await sfExpressFreightTlCityHandlers.freight_create_tl_order!(
      {
        order_id: "TL-20260905-001",
        pay_method: 1,
        monthly_card: "7551234567",
        generate_waybill_no: true,
        sender: {
          contact: "张三",
          mobile: "13112345678",
          address: "新洲十一街万基商务大厦10楼",
          province: "广东省",
          city: "深圳市",
        },
        recipient: { contact: "李四", mobile: "15000000008", address: "上海市浦东新区世纪大道1号" },
        cargo_name: "冰箱",
        vehicle_type: "5",
        need_tracking_return: true,
        expected_stops: [{ stop_address: "东莞市中转仓", stop_operate_type: 3, stop_city: "东莞市" }],
      },
      context(fetcher),
    );

    expect(output).toEqual({
      orderId: "TL-20260905-001",
      waybillNo: "SF7000000000001",
      signBackWaybillNo: null,
    });
  });

  it("requires waybill_no when not generating one, and monthly_card for pay_method 1 or 2", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      sfExpressFreightTlCityHandlers.freight_create_tl_order!(
        {
          order_id: "TL-1",
          pay_method: 3,
          sender: { contact: "张三", mobile: "13112345678", address: "新洲十一街" },
          recipient: { contact: "李四", mobile: "15000000008", address: "世纪大道1号" },
        },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      sfExpressFreightTlCityHandlers.freight_create_tl_order!(
        {
          order_id: "TL-1",
          pay_method: 1,
          generate_waybill_no: true,
          sender: { contact: "张三", mobile: "13112345678", address: "新洲十一街" },
          recipient: { contact: "李四", mobile: "15000000008", address: "世纪大道1号" },
        },
        context(fetcher),
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "monthly_card is required when pay_method is 1 (寄付月结) or 2 (寄付转第三方).",
    });

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps cancel and query payloads and accepts the no-success-marker envelope", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = readMsgData(init) as Record<string, unknown>;
      if (msgData.cancelReason !== undefined) {
        // The TL cancel doc's response table carries no payload fields at all.
        return Response.json({ success: true, errorCode: null, errorMessage: null });
      }
      expect(msgData).toEqual({ orderId: "TL-1", waybillNo: "SF7000000000001" });
      // The TL create/search doc tables omit success entirely.
      return Response.json({
        errorCode: null,
        errorMessage: null,
        obj: { orderId: "TL-1", waybillNo: "SF7000000000001" },
      });
    });

    const cancelOutput = await sfExpressFreightTlCityHandlers.freight_cancel_tl_order!(
      { order_id: "TL-1", cancel_reason: "客户取消" },
      context(fetcher),
    );
    expect(cancelOutput).toEqual({ orderId: "TL-1", cancelled: true });

    const queryOutput = await sfExpressFreightTlCityHandlers.freight_query_tl_order!(
      { order_id: "TL-1", waybill_no: "SF7000000000001" },
      context(fetcher),
    );
    expect(queryOutput).toEqual({ orderId: "TL-1", waybillNo: "SF7000000000001", signBackWaybillNo: null });
  });

  it("maps a TL business failure to an input error", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ errorCode: "80503", errorMessage: "订单不存在", obj: null }),
    );

    await expect(
      sfExpressFreightTlCityHandlers.freight_query_tl_order!({ order_id: "TL-X" }, context(fetcher)),
    ).rejects.toMatchObject({ status: 400, message: "订单不存在" });
  });

  it("builds the vehicle track URL request", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(readForm(init).get("serviceCode")).toBe("FOP_RECE_GENERATE_VEHICLE_TRACK_URL");
      expect(readMsgData(init)).toEqual({ waybillNo: "SF7000301277425", customerNo: "7556008292" });
      return tlEnvelope({ url: "https://gis.example.com/track?sign=abc" });
    });

    const output = await sfExpressFreightTlCityHandlers.freight_create_vehicle_track_url!(
      { waybill_no: "SF7000301277425", monthly_card: "7556008292" },
      context(fetcher),
    );

    expect(output).toEqual({ url: "https://gis.example.com/track?sign=abc" });
  });
});

describe("SF Express freight city-delivery handlers", () => {
  it("auto-fills clientCode from the credential and maps city order fields", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(readForm(init).get("serviceCode")).toBe("FOP_RECE_UFTL_OF_CONFIRM_ORDER");
      expect(readMsgData(init)).toEqual({
        clientCode: "TEST_PARTNER",
        vehicle: "中面",
        carNum: 1,
        sendStartTime: "2026-09-06 10:00:00",
        addressList: [
          {
            coordinate: "113.93041,22.53332",
            contact: "张三",
            tel: "13112345678",
            address: "广东省深圳市南山区桃园路",
            addressDetail: "202号",
            floor: 0,
            lift: 0,
            replyStatus: 0,
          },
        ],
        phone: "13112345678",
        nickname: "张三",
        place: "深圳市",
        destinationCity: "深圳市",
        monthCardNo: "7551234567",
      });
      return uftlEnvelope(200, { orderNo: "U20260905300015" });
    });

    const output = await sfExpressFreightTlCityHandlers.freight_city_confirm_order!(
      {
        vehicle: "中面",
        car_num: 1,
        send_start_time: "2026-09-06 10:00:00",
        address_list: [
          {
            coordinate: "113.93041,22.53332",
            contact: "张三",
            tel: "13112345678",
            address: "广东省深圳市南山区桃园路",
            address_detail: "202号",
            floor: 0,
            lift: false,
            reply_status: false,
          },
        ],
        phone: "13112345678",
        nickname: "张三",
        place: "深圳市",
        destination_city: "深圳市",
        monthly_card: "7551234567",
      },
      context(fetcher),
    );

    expect(output).toEqual({ orderNo: "U20260905300015" });
  });

  it("maps a UFTL business failure to an input error", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => uftlEnvelope(10000, null, "车型不能为空"));

    await expect(
      sfExpressFreightTlCityHandlers.freight_city_list_vehicles!(
        { city: "深圳市", order_category: 2 },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400, message: "车型不能为空" });
  });

  it("maps a UFTL gateway status to the matching execution error", async () => {
    const cases = [
      [500, 502],
      [429, 429],
      [403, 403],
    ] as const;

    for (const [status, expected] of cases) {
      const fetcher = vi.fn<typeof fetch>(async () => uftlEnvelope(status, null, `UFTL ${status}`));
      await expect(
        sfExpressFreightTlCityHandlers.freight_city_list_vehicles!(
          { city: "深圳市", order_category: 2 },
          context(fetcher),
        ),
      ).rejects.toMatchObject({ status: expected, message: `UFTL ${status}` });
    }
  });

  it("normalizes the fee breakdown", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = readMsgData(init) as Record<string, unknown>;
      expect(msgData.clientCode).toBe("TEST_PARTNER");
      expect(msgData.orderAddressVOList).toEqual([
        {
          contact: "张三",
          tel: "13112345678",
          address: "深圳市福田区梅康路",
          coordinate: "113.03041,22.63332",
          floor: 3,
          lift: 1,
          replyStatus: 0,
        },
      ]);
      return uftlEnvelope(200, {
        baseFee: 52.2,
        totalFee: 419.3,
        totalVasFee: 367.1,
        mileage: 32.195,
        cutPayment: 1.0,
        orderVasFeeList: [{ vasCode: "BAOZHUANGXIANG", vehicle: "箱货", num: 2, fee: 12.0, name: "包装箱" }],
      });
    });

    const output = await sfExpressFreightTlCityHandlers.freight_city_calc_fee!(
      {
        vehicle: "4.2米箱货",
        car_num: 1,
        send_start_time: "2026-09-06 14:00:00",
        addresses: [
          {
            contact: "张三",
            tel: "13112345678",
            address: "深圳市福田区梅康路",
            coordinate: "113.03041,22.63332",
            floor: 3,
            lift: true,
            reply_status: false,
          },
        ],
        city: "深圳市",
        order_source: "MALL",
      },
      context(fetcher),
    );

    expect(output).toEqual({
      baseFee: 52.2,
      totalFee: 419.3,
      totalVasFee: 367.1,
      mileage: 32.195,
      cutPayment: 1.0,
      orderVasFeeList: [{ vasCode: "BAOZHUANGXIANG", vehicle: "箱货", num: 2, fee: 12.0, name: "包装箱" }],
    });
  });

  it("normalizes the order list", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(readMsgData(init)).toEqual({ clientCode: "TEST_PARTNER", phone: "13112345678", index: 1, size: 10 });
      return uftlEnvelope(200, [
        {
          orderNo: "U20200227000026",
          orderTime: "2020-02-27 14:43:56",
          finishTime: "2020-02-27 19:52:43",
          contact: "张三",
          tel: "15000000000",
          orderStatus: 3,
          remark: "请准时上门取件",
          customerOrderNo: "MALL-1",
          totalFee: 143.2,
        },
      ]);
    });

    const output = await sfExpressFreightTlCityHandlers.freight_city_list_orders!(
      { phone: "13112345678", index: 1, size: 10 },
      context(fetcher),
    );

    expect(output).toEqual({
      orders: [
        {
          orderNo: "U20200227000026",
          orderTime: "2020-02-27 14:43:56",
          finishTime: "2020-02-27 19:52:43",
          contact: "张三",
          tel: "15000000000",
          orderStatus: 3,
          remark: "请准时上门取件",
          customerOrderNo: "MALL-1",
          totalFee: 143.2,
        },
      ],
    });
  });

  it("reads the order detail address list from either documented key", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      uftlEnvelope(200, {
        orderNo: "U20200227000026",
        orderTime: "2020-02-27 14:43:56",
        orderStatus: 3,
        vehicle: "依维柯",
        city: "深圳",
        orderAddress: [
          { serialNo: 0, address: "深圳市福田区梅康路", floor: 3, lift: 1, contact: "张三", tel: "15000000000" },
        ],
      }),
    );

    const output = (await sfExpressFreightTlCityHandlers.freight_city_get_order_detail!(
      { order_no: "U20200227000026" },
      context(fetcher),
    )) as Record<string, unknown>;

    expect(output.orderNo).toBe("U20200227000026");
    expect(output.addressList).toEqual([
      { serialNo: 0, address: "深圳市福田区梅康路", floor: 3, lift: 1, contact: "张三", tel: "15000000000" },
    ]);
  });

  it("requires an order number or customer order number for detail and cancel", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      sfExpressFreightTlCityHandlers.freight_city_get_order_detail!({}, context(fetcher)),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      sfExpressFreightTlCityHandlers.freight_city_cancel_order!({ cancel_message: "地址填错" }, context(fetcher)),
    ).rejects.toMatchObject({ status: 400 });

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("cancels a city order with an empty data payload", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(readMsgData(init)).toEqual({
        clientCode: "TEST_PARTNER",
        customerOrderNo: "MALL-1",
        cancelMessage: "订单地址填写错误",
      });
      return uftlEnvelope(200, "", "成功");
    });

    const output = await sfExpressFreightTlCityHandlers.freight_city_cancel_order!(
      { customer_order_no: "MALL-1", cancel_message: "订单地址填写错误" },
      context(fetcher),
    );

    expect(output).toEqual({ orderNo: null, customerOrderNo: "MALL-1", cancelled: true });
  });

  it("normalizes the available value-added services", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      uftlEnvelope(200, [
        { vasCode: "QITA", name: "其他费用", numUnit: null, infoName: null },
        { vasCode: "DENGDAIFEI", name: "等待费", numUnit: "min", infoName: "等待时间" },
      ]),
    );

    const output = await sfExpressFreightTlCityHandlers.freight_city_list_available_vas!(
      { place: "深圳市", vehicle: "4.2米箱货" },
      context(fetcher),
    );

    expect(output).toEqual({
      services: [
        { vasCode: "QITA", name: "其他费用", numUnit: null, bailMinFee: undefined, fee: undefined, infoName: null },
        {
          vasCode: "DENGDAIFEI",
          name: "等待费",
          numUnit: "min",
          bailMinFee: undefined,
          fee: undefined,
          infoName: "等待时间",
        },
      ],
    });
  });

  it("normalizes the vehicle models", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(readMsgData(init)).toEqual({ clientCode: "TEST_PARTNER", city: "深圳市", orderCategory: 2 });
      return uftlEnvelope(200, {
        carModels: [
          {
            model: "依维柯",
            weight: 3.5,
            length: 2.8,
            width: 1.8,
            height: 2.2,
            volume: 11.1,
            flag: 0,
            photo: "",
            specialModelList: [{ name: "双排座", code: "SHUANGPAIZUO" }],
          },
        ],
      });
    });

    const output = await sfExpressFreightTlCityHandlers.freight_city_list_vehicles!(
      { city: "深圳市", order_category: 2 },
      context(fetcher),
    );

    expect(output).toEqual({
      carModels: [
        {
          model: "依维柯",
          weight: 3.5,
          length: 2.8,
          width: 1.8,
          height: 2.2,
          volume: 11.1,
          flag: 0,
          specialModelList: [{ name: "双排座", code: "SHUANGPAIZUO" }],
          photo: undefined,
        },
      ],
    });
  });

  it("lists cities and appointment windows", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = readMsgData(init) as Record<string, unknown>;
      if (msgData.city === undefined) {
        return uftlEnvelope(200, ["深圳市", "成都市"]);
      }
      return uftlEnvelope(200, { startTime: "08:00:00", endTime: "23:00:00" });
    });

    const cities = await sfExpressFreightTlCityHandlers.freight_city_list_cities!({}, context(fetcher));
    expect(cities).toEqual({ cities: ["深圳市", "成都市"] });

    const windows = await sfExpressFreightTlCityHandlers.freight_city_list_appointment_times!(
      { city: "深圳市" },
      context(fetcher),
    );
    expect(windows).toEqual({ startTime: "08:00:00", endTime: "23:00:00" });
  });
});
