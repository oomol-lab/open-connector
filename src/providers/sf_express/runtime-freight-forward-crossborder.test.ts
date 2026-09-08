import { describe, expect, it, vi } from "vitest";
import { sfExpressFreightForwardCrossborderHandlers as handlers } from "./runtime-freight-forward-crossborder.ts";

const context = (fetcher: typeof fetch) => ({ partnerId: "TEST_PARTNER", checkWord: "TEST_CHECKWORD", fetcher });

const bareEnvelope = (obj: unknown): Response =>
  Response.json({ business: null, date: 1778750837960, errorCode: null, errorMessage: null, obj, success: true });

const bareAck = (): Response => Response.json({ errorCode: null, errorMessage: null, success: true });

const readForm = (init?: RequestInit): URLSearchParams => new URLSearchParams(String(init?.body));

describe("SF Express freight forwarding handlers", () => {
  it("uploads a waybill remark and returns the ack", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(JSON.parse(readForm(init).get("msgData")!)).toEqual({
        waybillNo: "444124310163",
        operator: "王大雷",
        remark: "易碎物品",
      });
      return bareAck();
    });

    const output = await handlers.freight_forward_upload_waybill_remark!(
      { waybill_no: "444124310163", operator: "王大雷", remark: "易碎物品" },
      context(fetcher),
    );

    expect(output).toEqual({ accepted: true, waybillNo: "444124310163" });
  });

  it("sends the batch track upload as a JSON array msgData", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(readForm(init).get("serviceCode")).toBe("FOP_RECE_FORWARD_UPLOAD_TRACK_BATCH");
      expect(JSON.parse(readForm(init).get("msgData")!)).toEqual([
        {
          waybillNo: "SF1223548122",
          timestamp: 1561098516251,
          licensePlateNumber: "粤B888888",
          driver: "李丰田",
          driverPhone: "15985584758",
          province: "广东省",
          city: "深圳市",
          county: "南山区",
          address: "软件产业基地",
          latitude: 22.62,
          longitude: 114.07,
          elevation: 10.52,
          latLongType: 2,
          source: "GPS",
          traceType: 2,
        },
      ]);
      return bareAck();
    });

    const output = await handlers.freight_forward_upload_track_batch!(
      {
        tracks: [
          {
            waybillNo: "SF1223548122",
            timestamp: 1561098516251,
            licensePlateNumber: "粤B888888",
            driver: "李丰田",
            driverPhone: "15985584758",
            province: "广东省",
            city: "深圳市",
            county: "南山区",
            address: "软件产业基地",
            latitude: 22.62,
            longitude: 114.07,
            elevation: 10.52,
            latLongType: 2,
            source: "GPS",
            traceType: 2,
          },
        ],
      },
      context(fetcher),
    );

    expect(output).toEqual({ accepted: true, count: 1 });
  });

  it("maps the single track upload's snake_case input to the camelCase msgData", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(readForm(init).get("serviceCode")).toBe("FOP_RECE_FORWARD_UPLOAD_TRACK");
      expect(JSON.parse(readForm(init).get("msgData")!)).toEqual({
        waybillNo: "SF1223548122",
        timestamp: 1561098516251,
        licensePlateNumber: "粤B888888",
        driverPhone: "15985584758",
        latLongType: 2,
        source: "GPS",
        traceType: 2,
      });
      return bareAck();
    });

    await handlers.freight_forward_upload_track!(
      {
        waybill_no: "SF1223548122",
        timestamp: 1561098516251,
        license_plate_number: "粤B888888",
        driver_phone: "15985584758",
        lat_long_type: 2,
        source: "GPS",
        trace_type: 2,
      },
      context(fetcher),
    );

    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("keeps the upstream volumn spelling and integer order fields in the order status upload", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toMatchObject({
        forwardOrderId: 215151638454,
        waybillNo: "SF45458785862",
        status: 45,
        volumn: 12.5,
        weight: 3.2,
        isCheck: 0,
      });
      return bareAck();
    });

    await handlers.freight_forward_update_order_status!(
      {
        forward_order_id: 215151638454,
        waybill_no: "SF45458785862",
        status: 45,
        volume: 12.5,
        weight: 3.2,
        is_check: 0,
      },
      context(fetcher),
    );

    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("enforces the documented conditional fields for exception codes before fetching", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      handlers.freight_forward_report_exception!(
        { waybill_no: "SF123", abnormal_type: 2, abnormal_code: "SIGN_05" },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400, message: "delay_days is required when abnormal_code is SIGN_05." });

    await expect(
      handlers.freight_forward_report_exception!(
        { waybill_no: "SF123", abnormal_type: 0, abnormal_code: "HANDOVER_06", delay_days: 1 },
        context(fetcher),
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "weight, sub_items and supplier_code are required for the reweigh appeal code HANDOVER_06.",
    });

    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("SF Express freight cross-border bulky handlers", () => {
  it("builds the cross-border order msgData and normalizes the waybill numbers", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toMatchObject({
        customerReferenceNo: "SFGH55",
        username: "15273286698",
        settlementTypeCode: "2",
        customerAccount: "7553033327",
        receiverType: "1",
        warehouseCode: "XUSE",
        receiverAddressDTO: { country: "US", countryCode: "US" },
        senderAddressDTO: {
          address: "丰泰产业园6楼",
          contact: "赵明",
          province: "北京市",
          city: "北京市",
          county: "顺义区",
          mobile: "18888888888",
        },
        cargo: { cargoType: "1" },
        totalDeclaredValue: 645,
        declaredValueCode: "USD",
        productType: "A100",
        customsType: "agent_declear",
        declaredValue: "32323",
        pickupMode: 2,
        packages: [
          {
            boxNo: "FBA16XPGJB87U000001",
            packageHigh: 35,
            packageLong: 47,
            packageWeight: 14,
            packageWidth: 41,
            netWeight: 14,
          },
        ],
      });
      return bareEnvelope({ subWaybillNo: "SF1011865168974,SF2010303774310", waybillNo: "SF1011865168974" });
    });

    const output = await handlers.freight_crossborder_place_order!(
      {
        customer_reference_no: "SFGH55",
        username: "15273286698",
        settlement_type: "2",
        monthly_card: "7553033327",
        receiver_type: "1",
        warehouse_code: "XUSE",
        recipient: { country: "US", country_code: "US" },
        sender: {
          address: "丰泰产业园6楼",
          contact: "赵明",
          province: "北京市",
          city: "北京市",
          county: "顺义区",
          mobile: "18888888888",
        },
        cargo_type: "1",
        total_declared_value: 645,
        declared_value_code: "USD",
        product_type: "A100",
        customs_type: "agent_declear",
        declared_value: "32323",
        pickup_mode: 2,
        packages: [
          {
            box_no: "FBA16XPGJB87U000001",
            package_high: 35,
            package_long: 47,
            package_weight: 14,
            package_width: 41,
            net_weight: 14,
          },
        ],
      },
      context(fetcher),
    );

    expect(output).toEqual({
      waybillNo: "SF1011865168974",
      subWaybillNos: ["SF1011865168974", "SF2010303774310"],
      warningMsg: null,
    });
  });

  it("requires a monthly card for monthly-settlement payment and a warehouse code for FBA destinations before fetching", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const base = {
      customer_reference_no: "SFGH55",
      username: "15273286698",
      receiver_type: "2",
      recipient: { country: "US", country_code: "US" },
      sender: {
        address: "丰泰产业园6楼",
        contact: "赵明",
        province: "北京市",
        city: "北京市",
        county: "顺义区",
        mobile: "18888888888",
      },
      cargo_type: "1",
      total_declared_value: 645,
      declared_value_code: "USD",
      product_type: "A100",
      customs_type: "agent_declear",
      declared_value: "32323",
      pickup_mode: 2,
      packages: [
        { box_no: "1", package_high: 35, package_long: 47, package_weight: 14, package_width: 41, net_weight: 14 },
      ],
    };

    await expect(
      handlers.freight_crossborder_place_order!({ ...base, settlement_type: "2" }, context(fetcher)),
    ).rejects.toMatchObject({ status: 400, message: "monthly_card is required when settlement_type is 2 (寄付月结)." });

    await expect(
      handlers.freight_crossborder_place_order!(
        { ...base, settlement_type: "1", receiver_type: "1" },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400, message: "warehouse_code is required when receiver_type is 1 (FBA仓库)." });

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("normalizes the postcode address matches", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(JSON.parse(readForm(init).get("msgData")!)).toEqual({ cityZipCode: "01007", countryCode: "US" });
      return bareEnvelope([
        {
          cityZipCode: "01007",
          countryCode: "US",
          disable: false,
          distEnName: "Belchertown",
          isIsolated: true,
          provinceName: "Massachusetts",
        },
      ]);
    });

    const output = await handlers.freight_crossborder_query_postcode_address!(
      { city_zip_code: "01007", country_code: "US" },
      context(fetcher),
    );

    expect(output).toEqual({
      addresses: [
        {
          cityZipCode: "01007",
          countryCode: "US",
          disable: false,
          distEnName: "Belchertown",
          isIsolated: true,
          provinceName: "Massachusetts",
        },
      ],
    });
  });

  it("sends the fixed FOP-IFOS-CORE sysCode for the print batch flow", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const form = readForm(init);
      const serviceCode = form.get("serviceCode")!;
      if (serviceCode === "FOP_RECE_IFOS_ORDER_PRINT_INFO") {
        expect(JSON.parse(form.get("msgData")!)).toEqual({
          waybillNo: "SF1342849028987",
          sysCode: "FOP-IFOS-CORE",
        });
        return bareEnvelope({
          errorMsg: null,
          fileType: null,
          files: [],
          printBatchNo: "AAABj3GH6W8GvmS3z8lBZJtV1qajG9h9",
          sysCode: null,
        });
      }
      expect(JSON.parse(form.get("msgData")!)).toEqual({
        printBatchNo: "AAABj3GH6W8GvmS3z8lBZJtV1qajG9h9",
        sysCode: "FOP-IFOS-CORE",
      });
      return bareEnvelope({
        errorReason: null,
        files: [{ seqNo: 0, token: "AUTH_token", url: "https://oss.example.com/fba.pdf", waybillNo: null }],
        status: "1",
        sysCode: null,
      });
    });

    const batch = await handlers.freight_crossborder_get_print_batch!(
      { waybill_no: "SF1342849028987" },
      context(fetcher),
    );
    expect(batch).toEqual({ printBatchNo: "AAABj3GH6W8GvmS3z8lBZJtV1qajG9h9" });

    const result = await handlers.freight_crossborder_query_print_result!(
      { print_batch_no: "AAABj3GH6W8GvmS3z8lBZJtV1qajG9h9" },
      context(fetcher),
    );
    expect(result).toEqual({
      files: [{ seqNo: 0, token: "AUTH_token", url: "https://oss.example.com/fba.pdf", waybillNo: null }],
      status: "1",
      errorReason: null,
    });
  });

  it("normalizes the delivery window confirmation verdict", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      bareEnvelope({
        errorCode: "EXPIRED_DELIVERY_WINDOW_GRACE_PERIOD",
        errorMessage: "The chosen delivery window has passed its grace period, please choose another one.",
        sellerAllowCarrierUpdateDW: false,
        success: true,
        successful: false,
      }),
    );

    const output = await handlers.freight_crossborder_confirm_delivery_window!(
      {
        fba_shipment_id: "FBA1926JDPDD",
        delivery_window_option_id: "09bdceab-5e72-413c-b5d2-001ec1b5db44",
        reference_id: "FBA1926JDP9T",
      },
      context(fetcher),
    );

    expect(output).toEqual({
      sellerAllowCarrierUpdateDw: false,
      successful: false,
      errorCode: "EXPIRED_DELIVERY_WINDOW_GRACE_PERIOD",
      errorMessage: "The chosen delivery window has passed its grace period, please choose another one.",
    });
  });

  it("normalizes the POD info response with the fixed clientCode", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(JSON.parse(readForm(init).get("msgData")!)).toEqual({
        waybillNo: "SF0000013798347",
        clientCode: "API_ON_SHELVES",
      });
      return bareEnvelope({
        hasPod: true,
        message: "POD文件获取成功",
        podUrls: ["https://oss.example.com/pod.png"],
        signed: true,
        statusCode: 240,
        statusDescription: "已签收",
        waybillNo: "SF0000013798347",
      });
    });

    const output = await handlers.freight_crossborder_get_pod_info!(
      { waybill_no: "SF0000013798347" },
      context(fetcher),
    );

    expect(output).toEqual({
      waybillNo: "SF0000013798347",
      signed: true,
      hasPod: true,
      statusCode: 240,
      statusDescription: "已签收",
      podUrls: ["https://oss.example.com/pod.png"],
      message: "POD文件获取成功",
    });
  });

  it("normalizes the cross-border cancellation results", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(JSON.parse(readForm(init).get("msgData")!)).toEqual({
        waybillNos: ["SF1888888888888"],
        userName: "18888888888",
        remark: "不想发货了",
      });
      return bareEnvelope([{ msg: "", status: "Success", subWaybillNo: "", waybillNo: "SF1888888888888" }]);
    });

    const output = await handlers.freight_crossborder_cancel_order!(
      { waybill_nos: ["SF1888888888888"], user_name: "18888888888", remark: "不想发货了" },
      context(fetcher),
    );

    expect(output).toEqual({
      results: [{ status: "Success", waybillNo: "SF1888888888888" }],
    });
  });

  it("maps the trace report routes and base routes", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(JSON.parse(readForm(init).get("msgData")!)).toEqual({
        referenceNo: "SF1690019825402",
        clientCode: "TWTH",
        routes: [{ opTime: 1721957046000, opDesc: "订单创建", mileStone: "InfoReceived" }],
        baseRoutes: [{ serviceType: "TransferNo", transferNo: "1Z8123456789", carrierCode: "FEDEX" }],
      });
      return bareEnvelope(null);
    });

    const output = await handlers.freight_crossborder_report_trace!(
      {
        reference_no: "SF1690019825402",
        client_code: "TWTH",
        routes: [{ opTime: 1721957046000, opDesc: "订单创建", mileStone: "InfoReceived" }],
        base_routes: [{ serviceType: "TransferNo", transferNo: "1Z8123456789", carrierCode: "FEDEX" }],
      },
      context(fetcher),
    );

    expect(output).toEqual({ accepted: true, referenceNo: "SF1690019825402" });
  });
});
