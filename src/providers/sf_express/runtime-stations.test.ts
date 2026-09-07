import { describe, expect, it, vi } from "vitest";
import { sfExpressStationHandlers } from "./runtime-stations.ts";

const context = (fetcher: typeof fetch) => ({ partnerId: "TEST_PARTNER", checkWord: "TEST_CHECKWORD", fetcher });

const okEnvelope = (msgData: unknown): Response =>
  Response.json({
    apiResponseID: "resp-id",
    apiResultCode: "A1000",
    apiErrorMsg: "",
    apiResultData: JSON.stringify({ success: true, errorCode: "S0000", errorMsg: null, msgData }),
  });

const okObjEnvelope = (obj: unknown): Response =>
  Response.json({
    apiResponseID: "resp-id",
    apiResultCode: "A1000",
    apiErrorMsg: "",
    apiResultData: JSON.stringify({ success: true, obj }),
  });

const readMsgData = (init?: RequestInit): Record<string, unknown> =>
  JSON.parse(new URLSearchParams(String(init?.body)).get("msgData")!) as Record<string, unknown>;

const header = { operatorId: "13099090", deptCode: "755" };

describe("SF Express station handlers", () => {
  it("sends the KB batch inventory with its api discriminator to the sfapi host", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe("https://sfapi.sf-express.com/std/service");
      expect(readMsgData(init)).toEqual({
        api: "kbExpressCheck",
        store_code: "KBYZ2094091",
        partner_id: "KBWL8S6H",
        waybill_nos: ["033222868176"],
      });
      return okObjEnvelope({
        msg: "部分操作成功",
        failList: [{ waybill_no: "033222868176", reason: "客户已签收不允许盘点" }],
      });
    });

    const output = await sfExpressStationHandlers.station_batch_inventory!(
      { store_code: "KBYZ2094091", partner_id: "KBWL8S6H", waybill_nos: ["033222868176"] },
      context(fetcher),
    );

    expect(output).toEqual({
      msg: "部分操作成功",
      failList: [{ waybill_no: "033222868176", reason: "客户已签收不允许盘点" }],
    });
  });

  it("wraps the store exception report in the EOS header/content/param structure", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(readMsgData(init)).toEqual({
        header: { oprId: "13099090", deptCode: "755" },
        content: {
          param: {
            api: "sf_exception_pack",
            agent_code: "SF001",
            partner_id: "YSF14SD1",
            area_code: "755A",
            waybill_no: "SF1336451265468",
            type: "2",
            exception_time: "2026-09-01 13:19:16",
            exception_reason: "包裹破损，客户拒收",
          },
        },
      });
      return okEnvelope(null);
    });

    const output = await sfExpressStationHandlers.station_store_handle_exception_return!(
      {
        header,
        agent_code: "SF001",
        partner_id: "YSF14SD1",
        area_code: "755A",
        waybill_no: "SF1336451265468",
        type: "2",
        exception_time: "2026-09-01 13:19:16",
        exception_reason: "包裹破损，客户拒收",
      },
      context(fetcher),
    );

    expect(output).toEqual({ waybillNo: "SF1336451265468" });
  });

  it("enforces the sender-pays fee fields for customer_send_in_store before fetching", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      sfExpressStationHandlers.station_customer_send_in_store!(
        {
          header,
          agent_code: "SF001",
          partner_id: "YSF14SD1",
          area_code: "755A",
          city_id: "755",
          waybill_no: "SF40000021380133",
          receiver_payment: "0",
          receive_waybill_time: "2026-09-01 18:09:00",
        },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("routes the centralization query through the shared api multiplexor", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(readMsgData(init)).toEqual({
        api: "query_centralize_express",
        partner_id: "MYJ2U352",
        params: { type: 1, waybill_no: "033222868176" },
      });
      return okObjEnvelope({ api: "query_centralizee_xpress", resultMsg: { isCentralism: true } });
    });

    const output = await sfExpressStationHandlers.station_query_centralization!(
      { partner_id: "MYJ2U352", waybill_no: "033222868176", type: 1 },
      context(fetcher),
    );

    expect(output).toEqual({ isCentralism: true });
  });

  it("normalizes the FC settlement verdict", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(readMsgData(init)).toEqual({
        type: 1,
        data: {
          opType: 1,
          orderId: "10002949559603",
          cabinetCode: "FC7556162",
          empNo: "01412278",
          phone: "13888888888",
          paymentType: "网点钱包（公司月结）",
          waybillNo: "SF1828711649427",
          gridType: "小",
          discountType: null,
          discountFee: null,
          payedFee: 0.4,
          deliverTm: "2026-09-01 00:41:00",
        },
      });
      return okObjEnvelope({
        settleFlag: 0,
        reason: "小哥工号在黑名单中",
        failCode: "A001",
        areaCode: "755Y",
        deptCode: "755A",
        responseId: "17e83ef0-b719-4eca-a541-eee487d270f8",
      });
    });

    const output = await sfExpressStationHandlers.station_verify_fc_settlement!(
      {
        op_type: 1,
        order_id: "10002949559603",
        cabinet_code: "FC7556162",
        emp_no: "01412278",
        phone: "13888888888",
        payment_type: "网点钱包（公司月结）",
        waybill_no: "SF1828711649427",
        grid_type: "小",
        payed_fee: 0.4,
        deliver_tm: "2026-09-01 00:41:00",
      },
      context(fetcher),
    );

    expect(output).toEqual({
      settleFlag: 0,
      reason: "小哥工号在黑名单中",
      failCode: "A001",
      areaCode: "755Y",
      deptCode: "755A",
      responseId: "17e83ef0-b719-4eca-a541-eee487d270f8",
    });
  });

  it("accepts a bare-string obj for the store upsert result", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => okObjEnvelope("SF353534534"));

    const output = await sfExpressStationHandlers.station_save_village_store!(
      {
        header,
        store_code: "V001",
        name: "纳洋-琶洲快递收发室",
        partner_id: "YSF14SD1",
        store_type: 86,
        provincename: "广东省",
        cityname: "广州市",
        countyname: "海珠区",
        townname: "琶洲街道",
        address: "琶洲新村18栋B",
        agent_name: "张三",
        agent_no: "A001",
        agent_phone: "13692439678",
        linkman_name: "张三",
        linkman_phone: "13692439678",
        open_flag: 1,
        short_name: "琶洲店",
      },
      context(fetcher),
    );

    expect(output).toEqual({ virtualAddr: "SF353534534" });
  });

  it("maps a station business failure to invalid input", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        apiResponseID: "resp-id",
        apiResultCode: "A1000",
        apiErrorMsg: "",
        apiResultData: JSON.stringify({ success: false, errorCode: "-150", errorMessage: "合作网点不能为空" }),
      }),
    );

    await expect(
      sfExpressStationHandlers.station_verify_waybill_number!(
        { partner_id: "MYJ2U352", waybill_no: "033222868176" },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400, message: "合作网点不能为空" });
  });

  it("sends the KB pre-handover fields without an api discriminator to the sfapi host", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe("https://sfapi.sf-express.com/std/service");
      expect(readMsgData(init)).toEqual({
        partner_id: "KBWL8S6H",
        store_code: "KBYZ2094091",
        waybill_no: "033222868176",
        extendJson: '{"remark":"易碎"}',
      });
      return okEnvelope(null);
    });

    const output = await sfExpressStationHandlers.station_pre_handover_pack!(
      {
        partner_id: "KBWL8S6H",
        store_code: "KBYZ2094091",
        waybill_no: "033222868176",
        extend_json: { remark: "易碎" },
      },
      context(fetcher),
    );

    expect(output).toEqual({ waybillNo: "033222868176" });
  });

  it("routes every KB pack handover to its own documented service code", async () => {
    const cases = [
      ["station_pre_handover_pack", "COM_RECE_KB_PRE_HANDOVER_PACK"],
      ["station_handover_pack", "COM_RECE_KB_HANDOVER_PACK"],
      ["station_customer_receive_pack", "COM_RECE_KB_CUST_REC_PACK"],
    ] as const;

    for (const [action, serviceCode] of cases) {
      const fetcher = vi.fn<typeof fetch>(async (url, init) => {
        expect(String(url)).toBe("https://sfapi.sf-express.com/std/service");
        expect(new URLSearchParams(String(init?.body)).get("serviceCode")).toBe(serviceCode);
        return okEnvelope(null);
      });

      await sfExpressStationHandlers[action]!(
        { partner_id: "KBWL8S6H", store_code: "KBYZ2094091", waybill_no: "033222868176" },
        context(fetcher),
      );

      expect(fetcher).toHaveBeenCalledOnce();
    }
  });

  it("maps the station_save_store inputs to the camelCase msgData with numeric enums", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(readMsgData(init)).toEqual({
        name: "幸福驿站",
        partnerId: "KBWL8S6H",
        storeCode: "KBYZ2094091",
        storeType: 81,
        linkman: "张三",
        phone: "15912748901",
        telephone: "0755-86885000",
        serviceTime: "08:00--20:00",
        lng: 113.93041,
        lat: 22.53332,
        provincename: "广东省",
        cityname: "深圳市",
        countyname: "南山区",
        address: "科技园南路100号",
        businessScope: 2,
        areaType: 6,
        isDelete: 0,
      });
      return okEnvelope(null);
    });

    const output = await sfExpressStationHandlers.station_save_store!(
      {
        name: "幸福驿站",
        partner_id: "KBWL8S6H",
        store_code: "KBYZ2094091",
        store_type: "81",
        linkman: "张三",
        phone: "15912748901",
        telephone: "0755-86885000",
        service_time: "08:00--20:00",
        lng: 113.93041,
        lat: 22.53332,
        province_name: "广东省",
        city_name: "深圳市",
        county_name: "南山区",
        address: "科技园南路100号",
        business_scope: "2",
        area_type: "6",
        is_delete: false,
      },
      context(fetcher),
    );

    expect(output).toEqual({ storeCode: "KBYZ2094091" });
  });

  it("sends the pickup-password validation with the api discriminator and reads obj.msg", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(readMsgData(init)).toEqual({
        api: "validate_delivery_pwd",
        partner_id: "MYJ2U352",
        waybill_no: "033222868176",
        agent_code: "5726",
        pwd: "8862",
      });
      return okObjEnvelope({ msg: "取件密码验证通过" });
    });

    const output = await sfExpressStationHandlers.station_validate_delivery_password!(
      { partner_id: "MYJ2U352", waybill_no: "033222868176", agent_code: "5726", pwd: "8862" },
      context(fetcher),
    );

    expect(output).toEqual({ waybillNo: "033222868176", msg: "取件密码验证通过" });
  });

  it("passes the delivery permission check through with mixed-case msgData fields", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(readMsgData(init)).toEqual({
        sgs_username: "13099090",
        sgs_netcode: "755Q",
        sgs_distcode: "755",
        waybillNo: "SF1336451265468",
        channel: "MYJ",
        operationScenario: "DELIVERY",
      });
      return okObjEnvelope({ allow: true });
    });

    const output = await sfExpressStationHandlers.station_verify_delivery_permission!(
      {
        sgs_username: "13099090",
        sgs_netcode: "755Q",
        sgs_distcode: "755",
        waybill_no: "SF1336451265468",
        channel: "MYJ",
        operation_scenario: "DELIVERY",
      },
      context(fetcher),
    );

    expect(output).toEqual({ allow: true });
  });

  it("sends the temp-store hold with the bill_type discriminator", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(readMsgData(init)).toEqual({
        bill_type: "2",
        agent_code: "5726",
        waybill_no: "033222868176",
        partner_id: "MYJ2U352",
      });
      return okEnvelope(null);
    });

    const output = await sfExpressStationHandlers.station_temp_store!(
      { bill_type: "2", agent_code: "5726", waybill_no: "033222868176", partner_id: "MYJ2U352" },
      context(fetcher),
    );

    expect(output).toEqual({ waybillNo: "033222868176" });
  });
});
