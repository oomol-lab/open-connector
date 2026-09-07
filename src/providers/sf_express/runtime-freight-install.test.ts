import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sfExpressFreightInstallHandlers } from "./runtime-freight-install.ts";

const context = (fetcher: typeof fetch) => ({ partnerId: "TEST_PARTNER", checkWord: "TEST_CHECKWORD", fetcher });

const okObjectEnvelope = (obj: unknown): Response =>
  Response.json({
    apiResponseID: "resp-id",
    apiResultCode: "A1000",
    apiErrorMsg: "",
    apiResultData: { success: true, errorCode: null, errorMsg: null, obj },
  });

const businessError = (errorCode: string, errorMsg: string): Response =>
  Response.json({
    apiResponseID: "resp-id",
    apiResultCode: "A1000",
    apiErrorMsg: "",
    apiResultData: JSON.stringify({ success: false, errorCode, errorMsg, msgData: null }),
  });

const readForm = (init?: RequestInit): URLSearchParams => new URLSearchParams(String(init?.body));

describe("SF Express freight install-service handlers", () => {
  // The recovery pickup window is measured on SF's Asia/Shanghai calendar, so the
  // clock is frozen at an instant that is 2026-09-07 in Shanghai in every host timezone.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-07T04:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates an install order with receiver, cargoes, and added services", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(readForm(init).get("serviceCode")).toBe("FOP_RECE_FIS_INSTALL_ORDER");
      expect(msgData).toMatchObject({
        outerOrderId: "CUST_PICK_INSTALL_20240901002",
        monthlyCardNo: "75587654321",
        serviceType: "2",
        isArrive: 0,
        receiverContact: "李四",
        receiverMobile: "13900139000",
        receiverAddress: "广东省深圳市南山区软件产业基地",
        cargoes: [{ count: 2, productName: "家具-柜类-格子柜-1个格子", productSku: "8891886" }],
        addedServiceDtos: [{ addedServiceName: "好评返现", addedServiceCode: "JZ17", addedServicePrice: "15.00" }],
      });
      return okObjectEnvelope({
        orderId: "SJA350825000280",
        outerOrderId: "1756107175",
        installStatus: "0",
        feeList: [{ feeName: "安装费", feeTypeCode: "JZ01", feeAmt: 62.0 }],
      });
    });

    const output = await sfExpressFreightInstallHandlers.freight_create_install_order!(
      {
        outer_order_id: "CUST_PICK_INSTALL_20240901002",
        monthly_card_no: "75587654321",
        service_type: "2",
        is_arrive: false,
        receiver_contact: "李四",
        receiver_mobile: "13900139000",
        receiver_address: "广东省深圳市南山区软件产业基地",
        cargoes: [{ count: 2, product_name: "家具-柜类-格子柜-1个格子", product_sku: "8891886" }],
        added_services: [{ added_service_name: "好评返现", added_service_code: "JZ17", added_service_price: "15.00" }],
      },
      context(fetcher),
    );

    expect(output).toEqual({
      orderId: "SJA350825000280",
      outerOrderId: "1756107175",
      installStatus: "0",
      feeList: [{ feeName: "安装费", feeTypeCode: "JZ01", feeAmt: 62.0 }],
    });
  });

  it("appends an install service and rejects a cargo without any category", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toMatchObject({
        waybillNo: "SF12345678910",
        installTypeCode: "1",
        cargoList: [{ count: 1, standServiceName: "儿童学习桌", standServiceCode: "8893536" }],
      });
      return okObjectEnvelope({ installOrderId: "SF12345678910", installFee: "719" });
    });

    const output = await sfExpressFreightInstallHandlers.freight_append_install_service!(
      {
        waybill_no: "SF12345678910",
        install_type: "1",
        cargo_list: [{ count: 1, stand_service_name: "儿童学习桌", stand_service_code: "8893536" }],
      },
      context(fetcher),
    );
    expect(output).toEqual({ installOrderId: "SF12345678910", installFee: 719 });

    const noFetch = vi.fn<typeof fetch>();
    await expect(
      sfExpressFreightInstallHandlers.freight_append_install_service!(
        { waybill_no: "SF12345678910", install_type: "1", cargo_list: [{ count: 1 }] },
        context(noFetch),
      ),
    ).rejects.toMatchObject({ status: 400 });

    // A complete standard pair plus one stray customer field is also rejected.
    await expect(
      sfExpressFreightInstallHandlers.freight_append_install_service!(
        {
          waybill_no: "SF12345678910",
          install_type: "1",
          cargo_list: [
            { count: 1, stand_service_name: "儿童学习桌", stand_service_code: "8893536", cus_service_name: "格子柜" },
          ],
        },
        context(noFetch),
      ),
    ).rejects.toMatchObject({ status: 400 });

    // And vice versa: a complete customer pair plus a stray standard field.
    await expect(
      sfExpressFreightInstallHandlers.freight_append_install_service!(
        {
          waybill_no: "SF12345678910",
          install_type: "1",
          cargo_list: [
            { count: 1, cus_service_name: "格子柜", cus_service_code: "C1", stand_service_name: "儿童学习桌" },
          ],
        },
        context(noFetch),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(noFetch).not.toHaveBeenCalled();
  });

  it("cancels an install order by either identifier and maps business errors", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toEqual({ orderId: "SJA12345678910" });
      return okObjectEnvelope(null);
    });

    const output = await sfExpressFreightInstallHandlers.freight_cancel_install_order!(
      { order_id: "SJA12345678910" },
      context(fetcher),
    );
    expect(output).toEqual({ acknowledged: true, orderId: "SJA12345678910", waybillNo: undefined });

    const failing = vi.fn<typeof fetch>(async () => businessError("10010", "运单已揽收，不可取消"));
    await expect(
      sfExpressFreightInstallHandlers.freight_cancel_install_order!({ order_id: "SJA123" }, context(failing)),
    ).rejects.toMatchObject({ status: 400, message: "运单已揽收，不可取消" });
  });

  it("creates a recovery order with the fixed single product", async () => {
    // 2026-09-10 is the last day inside SF's 3-day window from 2026-09-07.
    const withinThreeDays = "2026-09-10";
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toEqual({
        outerOrderId: "asdfgergyhertwerwer",
        senderContact: "顺小丰",
        senderMobile: "13322222222",
        senderAddress: "广东省深圳市南山区软件产业基地B栋23楼",
        expectDate: withinThreeDays,
        expectStartTime: "09:00",
        expectEndTime: "10:00",
        productList: [{ productSku: "8895138", count: 1 }],
      });
      return okObjectEnvelope({
        orderId: "SJA12324353123123",
        outerOrderId: "456461849464654",
        feeList: [{ feeAmt: 30.0, feeName: "安装费", feeTypeCode: "JZ01" }],
      });
    });

    const output = await sfExpressFreightInstallHandlers.freight_create_recovery_order!(
      {
        outer_order_id: "asdfgergyhertwerwer",
        sender_contact: "顺小丰",
        sender_mobile: "13322222222",
        sender_address: "广东省深圳市南山区软件产业基地B栋23楼",
        expect_date: withinThreeDays,
        expect_start_time: "09:00",
        expect_end_time: "10:00",
        product_list: [{ product_sku: "8895138", count: 1 }],
      },
      context(fetcher),
    );

    expect(output).toMatchObject({ orderId: "SJA12324353123123", outerOrderId: "456461849464654" });
  });

  it("rejects a recovery expect_date outside the 3-day window or a non-calendar date", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const base = {
      outer_order_id: "x",
      sender_contact: "顺小丰",
      sender_mobile: "13322222222",
      sender_address: "广东省深圳市南山区",
      expect_start_time: "09:00",
      expect_end_time: "10:00",
      product_list: [{ product_sku: "8895138" }],
    };
    const beyond = "2026-09-11";
    await expect(
      sfExpressFreightInstallHandlers.freight_create_recovery_order!(
        { ...base, expect_date: beyond },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400, message: "expect_date must be within 3 days from today." });
    await expect(
      sfExpressFreightInstallHandlers.freight_create_recovery_order!(
        { ...base, expect_date: "2026-02-30" },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400, message: "expect_date must be a valid date in yyyy-MM-dd format." });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("normalizes the recovery product catalog from a bare array obj", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      okObjectEnvelope([
        {
          businessCode: "HY0001",
          businessName: "电视机",
          productCateCode: "5032",
          productCateName: "小米",
          categoryList: [{ cateName: "正常开机", cateValue: "是" }],
          productSku: "8864422",
        },
      ]),
    );

    const output = await sfExpressFreightInstallHandlers.freight_query_recovery_products!({}, context(fetcher));
    expect(output).toEqual({
      products: [
        {
          businessName: "电视机",
          businessCode: "HY0001",
          productCateName: "小米",
          productCateCode: "5032",
          categoryList: [{ cateName: "正常开机", cateValue: "是" }],
          productSku: "8864422",
        },
      ],
    });
  });

  it("queries delivery rules by monthly card list", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(JSON.parse(readForm(init).get("msgData")!)).toEqual({ monthlyCardList: ["7553033327"] });
      return okObjectEnvelope({
        serviceInfoResList: [
          { seviceId: "D00-2202230001", serviceName: "通用派件前宅配规则", monthlyCard: "7553033327" },
        ],
      });
    });

    const output = await sfExpressFreightInstallHandlers.freight_query_delivery_rules!(
      { monthly_cards: ["7553033327"] },
      context(fetcher),
    );
    expect(output).toEqual({
      rules: [{ seviceId: "D00-2202230001", serviceName: "通用派件前宅配规则", monthlyCard: "7553033327" }],
    });
  });

  it("requires images for completion operation codes before fetching", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      sfExpressFreightInstallHandlers.freight_supplier_report_operation_node!(
        {
          waybill_no: "SJA341107001123",
          task_code: "1018055",
          operate_code: 3,
          operate_time: "2024-11-07 18:29:00",
          content: "师傅已服务完工",
          install_master: "姜华",
          install_contact: "18055556666",
        },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400, message: "images is required when operate_code is 3, 17, 20, or 21." });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports a supplier operation node with conditional fields", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toMatchObject({
        waybillNo: "SJA341107001123",
        taskCode: "1018055",
        operateCode: 10,
        appStartTime: "2024-11-08 15:00:00",
        appEndTime: "2024-11-08 17:00:00",
        installMaster: "姜华",
        installContact: "180",
      });
      return okObjectEnvelope(null);
    });

    const output = await sfExpressFreightInstallHandlers.freight_supplier_report_operation_node!(
      {
        waybill_no: "SJA341107001123",
        task_code: "1018055",
        operate_code: 10,
        operate_time: "2024-11-07 18:29:00",
        content: "预约时间：2024-11-08 15:00:00",
        install_master: "姜华",
        install_contact: "180",
        app_start_time: "2024-11-08 15:00:00",
        app_end_time: "2024-11-08 17:00:00",
      },
      context(fetcher),
    );
    expect(output).toEqual({ acknowledged: true, waybillNo: "SJA341107001123", taskCode: "1018055" });
  });

  it("normalizes appointment time days and periods", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      okObjectEnvelope({ days: [{ day: "2025-02-17", periods: [{ end: "11:00", start: "09:00" }] }] }),
    );

    const output = await sfExpressFreightInstallHandlers.freight_supplier_query_appointment_times!(
      { waybill_no: "SJA100100177096", task_code: "393470" },
      context(fetcher),
    );
    expect(output).toEqual({ days: [{ day: "2025-02-17", periods: [{ start: "09:00", end: "11:00" }] }] });
  });

  it("enforces the bidding operate_data required keys per operate_code", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      sfExpressFreightInstallHandlers.freight_bid_report_operation_node!(
        {
          order_no: "SJA341107001123",
          content: "已完工",
          operate_code: "OP000001",
          operate_time: "2024-11-07 18:29:00",
          operate_data: { orderRealAmt: "100" },
        },
        context(fetcher),
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "operate_data.imgUrl is required when operate_code is OP000001.",
    });
    expect(fetcher).not.toHaveBeenCalled();

    const ok = vi.fn<typeof fetch>(async () => okObjectEnvelope(null));
    await sfExpressFreightInstallHandlers.freight_bid_report_operation_node!(
      {
        order_no: "SJA341107001123",
        content: "已完工",
        operate_code: "OP000001",
        operate_time: "2024-11-07 18:29:00",
        operate_data: { imgUrl: "https://example.com/done.jpg" },
      },
      context(ok),
    );
    expect(ok).toHaveBeenCalledOnce();
  });

  it("requires remark on rejected add-fee and refund results", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      sfExpressFreightInstallHandlers.freight_bid_report_add_fee_result!(
        { order_no: "O1", add_fee_no: "F1", detail_result: "2", add_amt: 10 },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400, message: "remark is required when detail_result is 2 (师傅拒绝)." });

    await expect(
      sfExpressFreightInstallHandlers.freight_bid_report_refund_result!(
        { order_no: "O1", refund_no: "R1", refund_status: "1", refund_amt: 10 },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400, message: "remark is required when refund_status is 1 (师傅拒绝)." });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reads sfAddFeeNo from the add-fee application result", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => okObjectEnvelope({ sfAddFeeNo: "12345648798461" }));

    const output = await sfExpressFreightInstallHandlers.freight_supplier_apply_add_fee!(
      { order_no: "O1", add_fee_no: "F1", function_flag: "0", add_amt: 56.78 },
      context(fetcher),
    );
    expect(output).toEqual({ sfAddFeeNo: "12345648798461" });
  });

  it("normalizes the add-fee query result including the example-only refundAmt", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      okObjectEnvelope({ detailResult: "2", remark: "用户拒绝增加费用", refundAmt: 56.78 }),
    );

    const output = await sfExpressFreightInstallHandlers.freight_supplier_query_add_fee_result!(
      { order_no: "O1", add_fee_no: "F1" },
      context(fetcher),
    );
    expect(output).toEqual({ detailResult: "2", remark: "用户拒绝增加费用", addAmt: null, refundAmt: 56.78 });
  });
});
