import { describe, expect, it, vi } from "vitest";
import { kuaidi100ActionHandlers, kuaidi100ApiBaseUrl, validateKuaidi100Credential } from "./runtime.ts";

const context = (fetcher: typeof fetch) => ({ apiKey: "test-key", fetcher });

describe("Kuaidi100 provider runtime", () => {
  it("queries a trajectory with the key and JSON format query parameters", async () => {
    const fetcher = vi.fn<typeof fetch>(async (request) => {
      const url = new URL(String(request));
      expect(url.origin + url.pathname).toBe(`${kuaidi100ApiBaseUrl}/queryTrace`);
      expect(Object.fromEntries(url.searchParams)).toEqual({
        kuaidiNum: "YT0000000000000",
        phone: "13800138000",
        key: "test-key",
        responseFormat: "json",
      });
      return Response.json({
        kuaidiCom: "yuantong",
        kuaidiName: "圆通速递",
        kuaidiNum: "YT0000000000000",
        state: "已签收",
        fromTo: "广东省深圳市南山区 -> 北京市海淀区",
        data: [{ time: "2026-09-01 12:43:35", status: "揽收", context: "快件已揽收" }],
      });
    });

    const output = await kuaidi100ActionHandlers.query_trace(
      { kuaidi_num: "YT0000000000000", phone: "13800138000" },
      context(fetcher),
    );

    expect(fetcher).toHaveBeenCalledOnce();
    expect(output).toEqual({
      kuaidiCom: "yuantong",
      kuaidiName: "圆通速递",
      kuaidiNum: "YT0000000000000",
      state: "已签收",
      fromTo: "广东省深圳市南山区 -> 北京市海淀区",
      data: [{ time: "2026-09-01 12:43:35", status: "揽收", context: "快件已揽收" }],
    });
  });

  it("encodes in-transit trajectory events as the logistic JSON parameter", async () => {
    const fetcher = vi.fn<typeof fetch>(async (request) => {
      const url = new URL(String(request));
      expect(url.pathname).toBe("/stdio/estimateTimeWithLogistic");
      expect(JSON.parse(url.searchParams.get("logistic")!)).toEqual([
        { time: "2026-09-01 12:43:35", context: "快件已揽收", status: "揽收" },
        { time: "2026-09-02 08:48:27", context: "运输中", status: "在途" },
      ]);
      return Response.json({
        fromName: "广东深圳市南山区",
        toName: "北京朝阳区",
        orderTime: "2026-09-01 08:08:08",
        arrivalTime: "2026-09-03 16:00:00",
        deliveryExpendTime: "2",
        remainTime: null,
        expType: null,
      });
    });

    const output = await kuaidi100ActionHandlers.estimate_time_with_logistic(
      {
        kuaidi_com: "yuantong",
        from_loc: "广东省深圳市南山区",
        to_loc: "北京市海淀区",
        order_time: "2026-09-01 08:08:08",
        logistic: [
          { time: "2026-09-01 12:43:35", context: "快件已揽收", status: "揽收" },
          { time: "2026-09-02 08:48:27", context: "运输中", status: "在途" },
        ],
      },
      context(fetcher),
    );

    expect(output).toMatchObject({ arrivalTime: "2026-09-03 16:00:00", remainTime: null, expType: null });
  });

  it("omits the status key of a trajectory event that carries no status", async () => {
    const fetcher = vi.fn<typeof fetch>(async (request) => {
      const url = new URL(String(request));
      const logistic = JSON.parse(url.searchParams.get("logistic")!) as Array<Record<string, string>>;
      expect(logistic).toEqual([
        { time: "2026-09-01 12:43:35", context: "快件已揽收" },
        { time: "2026-09-02 08:48:27", context: "运输中", status: "在途" },
      ]);
      expect(Object.keys(logistic[0]!)).toEqual(["time", "context"]);
      return Response.json({
        fromName: "广东深圳市南山区",
        toName: "北京朝阳区",
        orderTime: "2026-09-01 08:08:08",
        arrivalTime: "2026-09-03 16:00:00",
        deliveryExpendTime: "2",
        remainTime: null,
        expType: null,
      });
    });

    const output = await kuaidi100ActionHandlers.estimate_time_with_logistic(
      {
        kuaidi_com: "yuantong",
        from_loc: "广东省深圳市南山区",
        to_loc: "北京市海淀区",
        logistic: [
          { time: "2026-09-01 12:43:35", context: "快件已揽收" },
          { time: "2026-09-02 08:48:27", context: "运输中", status: "在途" },
        ],
      },
      context(fetcher),
    );

    expect(fetcher).toHaveBeenCalledOnce();
    expect(output).toMatchObject({ arrivalTime: "2026-09-03 16:00:00" });
  });

  it("keeps a non-null remainTime as an integer for numeric and string upstream values", async () => {
    const estimate = (remainTime: unknown) =>
      vi.fn<typeof fetch>(async () =>
        Response.json({
          fromName: "广东深圳市南山区",
          toName: "北京朝阳区",
          orderTime: "2026-09-01 08:08:08",
          arrivalTime: "2026-09-03 16:00:00",
          deliveryExpendTime: "2",
          remainTime,
          expType: "标准快递",
        }),
      );
    const input = { kuaidi_com: "yuantong", from_loc: "广东省深圳市南山区", to_loc: "北京市海淀区" };

    await expect(kuaidi100ActionHandlers.estimate_time(input, context(estimate(57)))).resolves.toMatchObject({
      remainTime: 57,
      expType: "标准快递",
    });
    await expect(kuaidi100ActionHandlers.estimate_time(input, context(estimate("12")))).resolves.toMatchObject({
      remainTime: 12,
    });
  });

  it("maps an embedded 401 envelope to 401 when executing", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ code: "401", message: "用户鉴权失败", result: false }),
    );

    await expect(kuaidi100ActionHandlers.auto_number({ kuaidi_num: "123" }, context(fetcher))).rejects.toMatchObject({
      status: 401,
      message: "用户鉴权失败",
    });
  });

  it("maps embedded 400 and 500 envelopes to input and provider errors", async () => {
    const badInput = vi.fn<typeof fetch>(async () =>
      Response.json({ code: "400", message: "快递单号不能为空", result: false }),
    );
    await expect(kuaidi100ActionHandlers.query_trace({ kuaidi_num: "x" }, context(badInput))).rejects.toMatchObject({
      status: 400,
      message: "快递单号不能为空",
    });

    const upstream = vi.fn<typeof fetch>(async () =>
      Response.json({ code: "500", message: "预估价格|快递公司参数异常：未查到指定快递公司", result: false }),
    );
    await expect(
      kuaidi100ActionHandlers.estimate_price(
        { kuaidi_com: "yuantong", send_addr: "北京市海淀区", rec_addr: "广东省深圳市南山区", weight: 1 },
        context(upstream),
      ),
    ).rejects.toMatchObject({ status: 502, message: "预估价格|快递公司参数异常：未查到指定快递公司" });
  });

  it("maps a numeric envelope code the same way as a string one", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ code: 400, message: "快递单号不能为空", result: false }),
    );

    await expect(kuaidi100ActionHandlers.query_trace({ kuaidi_num: "x" }, context(fetcher))).rejects.toMatchObject({
      status: 400,
      message: "快递单号不能为空",
    });
  });

  it("maps non-2xx responses without echoing the upstream body", async () => {
    const gateway = vi.fn<typeof fetch>(
      async () =>
        new Response("<html>502 Bad Gateway</html>", { status: 502, headers: { "content-type": "text/html" } }),
    );
    const error = (await kuaidi100ActionHandlers
      .auto_number({ kuaidi_num: "123" }, context(gateway))
      .catch((reason: unknown) => reason)) as Error & { status: number };
    expect(error.status).toBe(502);
    expect(error.message).not.toContain("html");

    const throttled = vi.fn<typeof fetch>(async () => Response.json({ message: "too many requests" }, { status: 429 }));
    await expect(kuaidi100ActionHandlers.auto_number({ kuaidi_num: "123" }, context(throttled))).rejects.toMatchObject({
      status: 429,
      message: "too many requests",
    });
  });

  it("maps an embedded 401 envelope to 400 when validating a credential", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ code: "401", message: "用户鉴权失败", result: false }),
    );

    await expect(validateKuaidi100Credential("bad-key", fetcher)).rejects.toMatchObject({
      status: 400,
      message: "用户鉴权失败",
    });
  });

  it("maps a bare HTTP 401 to 400 when validating a credential", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("", { status: 401 }));

    await expect(validateKuaidi100Credential("bad-key", fetcher)).rejects.toMatchObject({ status: 400 });
  });

  it("validates a credential through the autoNumber endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>(async (request) => {
      const url = new URL(String(request));
      expect(url.pathname).toBe("/stdio/autoNumber");
      expect(url.searchParams.get("key")).toBe("good-key");
      return Response.json({ data: [{ comCode: "shunfeng", lengthPre: "15", name: "顺丰速运" }] });
    });

    const result = await validateKuaidi100Credential("good-key", fetcher);

    expect(result.profile?.displayName).toBe("Kuaidi100 API Key");
    expect(result.metadata?.apiBaseUrl).toBe(kuaidi100ApiBaseUrl);
  });
});
