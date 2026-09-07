import { describe, expect, it, vi } from "vitest";
import { sfExpressPushHandlers } from "./runtime-push.ts";

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

describe("SF Express push-registration handlers", () => {
  it("registers a route push on the sfapi host with the waybill mode and contact fallback", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe("https://sfapi.sf-express.com/std/service");
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toEqual({
        type: "2",
        attributeNo: "SF1040300507426",
        checkPhoneNo: "9784",
        contactInfo: {
          contact: "顺小丰",
          province: "广东省",
          city: "深圳市",
          county: "南山区",
          contactType: 2,
        },
        language: "zh-CN",
      });
      expect(readForm(init).get("serviceCode")).toBe("EXP_RECE_REGISTER_ROUTE");
      return okEnvelope(null);
    });

    const output = await sfExpressPushHandlers.register_route_push!(
      {
        register_by: "waybill",
        attribute_no: "SF1040300507426",
        check_phone_no: "9784",
        contact_info: {
          contact: "顺小丰",
          province: "广东省",
          city: "深圳市",
          county: "南山区",
          contact_type: "recipient",
        },
        language: "zh-CN",
      },
      context(fetcher),
    );

    expect(output).toEqual({ registered: true, attributeNo: "SF1040300507426" });
  });

  it("maps a phone-mismatch business error to 400", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => businessError("8181", "电话号码后四位与sisp运单中电话号码不匹配"));

    await expect(
      sfExpressPushHandlers.register_route_push!(
        { register_by: "waybill", attribute_no: "SF1040300507426", check_phone_no: "0000" },
        context(fetcher),
      ),
    ).rejects.toMatchObject({ status: 400, message: "电话号码后四位与sisp运单中电话号码不匹配" });
  });

  it("registers a picture push with the credential partnerID as clientCode", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe("https://bspgw.sf-express.com/std/service");
      const msgData = JSON.parse(readForm(init).get("msgData")!);
      expect(msgData).toEqual({
        clientCode: "TEST_PARTNER",
        waybillNo: "SF6026001285825",
        imgType: "122",
        customerAcctCode: "7551234567",
      });
      return okEnvelope(null);
    });

    const output = await sfExpressPushHandlers.register_waybill_picture_push!(
      { waybill_no: "SF6026001285825", img_type: "122", customer_acct_code: "7551234567" },
      context(fetcher),
    );

    expect(output).toEqual({ registered: true, waybillNo: "SF6026001285825", imgType: "122" });
  });
});
