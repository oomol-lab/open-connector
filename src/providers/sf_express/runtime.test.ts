import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { sfExpressQueryHandlers } from "./runtime-query.ts";
import { sfExpressStationHandlers } from "./runtime-stations.ts";
import { sfExpressApiBaseUrl, validateSfExpressCredential } from "./runtime.ts";

const context = (fetcher: typeof fetch) => ({ partnerId: "TEST_PARTNER", checkWord: "TEST_CHECKWORD", fetcher });

const okEnvelope = (msgData: unknown): Response =>
  Response.json({
    apiResponseID: "resp-id",
    apiResultCode: "A1000",
    apiErrorMsg: "",
    apiResultData: JSON.stringify({ success: true, errorCode: "S0000", errorMsg: null, msgData }),
  });

const platformError = (code: string, message: string): Response =>
  Response.json({ apiResponseID: "resp-id", apiResultCode: code, apiErrorMsg: message, apiResultData: "" });

const readForm = (init?: RequestInit): URLSearchParams => new URLSearchParams(String(init?.body ?? ""));

describe("SF Express provider core runtime", () => {
  it("signs the form envelope with Base64(MD5(msgData + timestamp + checkWord))", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe(sfExpressApiBaseUrl);
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({ "content-type": "application/x-www-form-urlencoded" });
      const form = readForm(init);
      expect(form.get("partnerID")).toBe("TEST_PARTNER");
      expect(form.get("serviceCode")).toBe("EXP_RECE_VALIDATE_WAYBILLNO");
      expect(form.get("requestID")).toBeTruthy();
      const msgData = form.get("msgData")!;
      const timestamp = form.get("timestamp")!;
      const expectedDigest = createHash("md5")
        .update(msgData + timestamp + "TEST_CHECKWORD")
        .digest("base64");
      expect(form.get("msgDigest")).toBe(expectedDigest);
      expect(JSON.parse(msgData)).toEqual({ waybillNo: "SF1040275268927" });
      return okEnvelope(true);
    });

    const output = await sfExpressQueryHandlers.validate_waybill_no!(
      { waybill_no: "SF1040275268927" },
      context(fetcher),
    );

    expect(fetcher).toHaveBeenCalledOnce();
    expect(output).toEqual({ waybillNo: "SF1040275268927", valid: true });
  });

  it("accepts apiResultData as an already-parsed object", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        apiResponseID: "resp-id",
        apiResultCode: "A1000",
        apiErrorMsg: "",
        apiResultData: { success: true, errorCode: "S0000", errorMsg: null, msgData: true },
      }),
    );

    const output = await sfExpressQueryHandlers.validate_waybill_no!(
      { waybill_no: "SF1040275268927" },
      context(fetcher),
    );

    expect(output).toEqual({ waybillNo: "SF1040275268927", valid: true });
  });

  it("accepts a bare business envelope without apiResultCode", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ success: true, obj: true }));

    const output = await sfExpressQueryHandlers.validate_waybill_no!(
      { waybill_no: "SF1040275268927" },
      context(fetcher),
    );

    expect(output).toEqual({ waybillNo: "SF1040275268927", valid: true });
  });

  it("reads errorMessage on bare business envelope failures", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ success: false, errorCode: "S0003", errorMessage: "模板不存在" }),
    );

    await expect(
      sfExpressQueryHandlers.validate_waybill_no!({ waybill_no: "SF1040275268927" }, context(fetcher)),
    ).rejects.toMatchObject({ status: 502, message: "模板不存在" });
  });

  it("maps platform error codes to execution statuses", async () => {
    const cases = [
      ["A1006", 401],
      ["A1005", 429],
      ["A1010", 400],
      ["A1004", 403],
      ["A1099", 502],
    ] as const;
    for (const [code, status] of cases) {
      const fetcher = vi.fn<typeof fetch>(async () => platformError(code, `平台错误 ${code}`));
      await expect(
        sfExpressQueryHandlers.validate_waybill_no!({ waybill_no: "SF1040275268927" }, context(fetcher)),
      ).rejects.toMatchObject({ status, message: `平台错误 ${code}` });
    }
  });

  it("routes to the sandbox gateway when the credential opts in", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      expect(String(url)).toBe("https://sfapi-sbox.sf-express.com/std/service");
      return okEnvelope(true);
    });

    const output = await sfExpressQueryHandlers.validate_waybill_no!(
      { waybill_no: "SF1040275268927" },
      { ...context(fetcher), sandbox: true },
    );

    expect(output).toEqual({ waybillNo: "SF1040275268927", valid: true });
  });

  it("routes sandbox calls for EOS station endpoints to the SIT host", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      expect(String(url)).toBe("https://sfapi.sit.sf-express.com:45273/std/service");
      return okEnvelope({});
    });

    await sfExpressStationHandlers.station_get_oss_token!(
      { header: { operatorId: "OP001" }, oss_client_name: "station-app", path_id: "images/" },
      { ...context(fetcher), sandbox: true },
    );

    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("maps a bad signature to 400 when validating a credential", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => platformError("A1006", "数字签名无效"));

    await expect(
      validateSfExpressCredential({ partnerId: "TEST_PARTNER", checkWord: "WRONG" }, fetcher),
    ).rejects.toMatchObject({ status: 400, message: "数字签名无效" });
  });

  it("validates a credential through EXP_RECE_VALIDATE_WAYBILLNO", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const form = readForm(init);
      expect(form.get("serviceCode")).toBe("EXP_RECE_VALIDATE_WAYBILLNO");
      return okEnvelope(true);
    });

    const result = await validateSfExpressCredential(
      { partnerId: "TEST_PARTNER", checkWord: "TEST_CHECKWORD" },
      fetcher,
    );

    expect(result.profile).toEqual({ accountId: "sf_express:TEST_PARTNER", displayName: "SF Express (TEST_PARTNER)" });
    expect(result.metadata?.apiBaseUrl).toBe(sfExpressApiBaseUrl);
  });
});
