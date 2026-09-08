import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { sfExpressQueryHandlers } from "./runtime-query.ts";
import { sfExpressStationHandlers } from "./runtime-stations.ts";
import {
  createSfExpressContext,
  sfExpressApiBaseUrl,
  signSfExpressPayload,
  validateSfExpressCredential,
} from "./runtime.ts";

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

/**
 * The documented SF Express signature, restated byte by byte instead of through
 * `encodeURIComponent`, so this stays an independent check of the runtime rather
 * than a copy of it: everything outside Java's URLEncoder unreserved set is
 * percent-encoded from its UTF-8 bytes, a space becomes `+`, then MD5/Base64.
 */
const referenceDigest = (msgData: string, timestamp: string, checkWord: string): string => {
  const encoded = Array.from(Buffer.from(msgData + timestamp + checkWord, "utf8"))
    .map((byte) => {
      const character = String.fromCharCode(byte);
      if (/[A-Za-z0-9.\-*_]/.test(character)) {
        return character;
      }
      return character === " " ? "+" : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    })
    .join("");
  return createHash("md5").update(encoded).digest("base64");
};

describe("SF Express provider core runtime", () => {
  it("signs the form envelope with Base64(MD5(URLEncoder.encode(msgData + timestamp + checkWord)))", async () => {
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
      expect(form.get("msgDigest")).toBe(referenceDigest(msgData, timestamp, "TEST_CHECKWORD"));
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

  describe("digital signature algorithms", () => {
    // The worked example the 数字签名认证说明 page repeats on all three tabs.
    const msgData = '{"language":"zh-CN","orderId":"QIAO-20200618-004"}';
    const timestamp = "12312334453453";
    const checkWord = "fjcg5PGKaNpPSHFAZ4QsCOkV71R3zVci";

    it("reproduces the documented 标准MD5 and SM3 digests", () => {
      expect(signSfExpressPayload(msgData, timestamp, checkWord, "standard_md5")).toBe("IIKJtuLVzoFTu4kHI8M8vA==");
      expect(signSfExpressPayload(msgData, timestamp, checkWord, "sm3")).toBe(
        "b05d21124eb6aedb3c6c99b1a37f9fc9a23a9898cb6a4b5df00d4402bda9081f",
      );
    });

    it("hashes the raw string for 简易MD5", () => {
      // The 简易MD5 page reprints the 标准MD5 digest for this sample, which cannot
      // be right: the payload is JSON, so URL-encoding rewrites most of it. The
      // expectation is therefore restated from the algorithm the same page describes.
      const expected = createHash("md5")
        .update(msgData + timestamp + checkWord, "utf8")
        .digest("base64");
      expect(signSfExpressPayload(msgData, timestamp, checkWord, "simple_md5")).toBe(expected);
      expect(expected).not.toBe(signSfExpressPayload(msgData, timestamp, checkWord, "standard_md5"));
    });

    it("defaults to 标准MD5 when the connection names no algorithm", () => {
      expect(signSfExpressPayload(msgData, timestamp, checkWord)).toBe(
        signSfExpressPayload(msgData, timestamp, checkWord, "standard_md5"),
      );
      expect(
        createSfExpressContext({ partnerId: "TEST_PARTNER", checkWord: "TEST_CHECKWORD" }, fetch).signatureAlgorithm,
      ).toBeUndefined();
    });

    it("signs live requests with the algorithm the credential selects", async () => {
      for (const algorithm of ["standard_md5", "simple_md5", "sm3"] as const) {
        const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
          const form = readForm(init);
          expect(form.get("msgDigest")).toBe(
            signSfExpressPayload(form.get("msgData")!, form.get("timestamp")!, "TEST_CHECKWORD", algorithm),
          );
          return okEnvelope(true);
        });

        await sfExpressQueryHandlers.validate_waybill_no!(
          { waybill_no: "SF1040275268927" },
          {
            ...context(fetcher),
            signatureAlgorithm: algorithm,
          },
        );

        expect(fetcher).toHaveBeenCalledOnce();
      }
    });

    it("rejects an unrecognized signatureAlgorithm instead of signing with the wrong one", () => {
      expect(() =>
        createSfExpressContext(
          { partnerId: "TEST_PARTNER", checkWord: "TEST_CHECKWORD", signatureAlgorithm: "md5" },
          fetch,
        ),
      ).toThrow(/signatureAlgorithm must be standard_md5, simple_md5 or sm3/);
    });
  });

  it("signs payloads carrying spaces, Chinese, and characters encodeURIComponent leaves alone", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const form = readForm(init);
      const msgData = form.get("msgData")!;
      expect(msgData).toContain("2026-09-05 17:01:48");
      expect(form.get("msgDigest")).toBe(referenceDigest(msgData, form.get("timestamp")!, "TEST_CHECKWORD"));
      return okEnvelope({ deliverTmDto: [] });
    });

    await sfExpressQueryHandlers.query_delivery_time_price!(
      {
        src_address: { province: "广东省", city: "深圳市", address: "南山区科技园 A'座(1~2)!*栋" },
        dest_address: { code: "020" },
        consigned_time: "2026-09-05 17:01:48",
      },
      context(fetcher),
    );

    expect(fetcher).toHaveBeenCalledOnce();
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

  it("routes sandbox calls for EOS station endpoints to the documented sandbox gateway", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      expect(String(url)).toBe("https://sfapi-sbox.sf-express.com/std/service");
      return okEnvelope({});
    });

    await sfExpressStationHandlers.station_get_oss_token!(
      { header: { operatorId: "OP001" }, oss_client_name: "station-app", path_id: "images/" },
      { ...context(fetcher), sandbox: true },
    );

    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("reads the sandbox credential flag case-insensitively and rejects any other value", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      expect(String(url)).toBe("https://sfapi-sbox.sf-express.com/std/service");
      return okEnvelope(true);
    });

    const sandboxResult = await validateSfExpressCredential(
      { partnerId: "TEST_PARTNER", checkWord: "TEST_CHECKWORD", sandbox: " TRUE " },
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledOnce();
    expect(sandboxResult.metadata).toMatchObject({
      environment: "sandbox",
      apiBaseUrl: "https://sfapi-sbox.sf-express.com/std/service",
    });

    await expect(
      validateSfExpressCredential({ partnerId: "TEST_PARTNER", checkWord: "TEST_CHECKWORD", sandbox: "yes" }, fetcher),
    ).rejects.toMatchObject({ status: 400, message: "sandbox must be true or false." });
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
    expect(result.metadata).toMatchObject({ environment: "production", apiBaseUrl: sfExpressApiBaseUrl });
  });
});
