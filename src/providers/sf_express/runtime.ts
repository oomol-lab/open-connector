import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { createHash, randomUUID } from "node:crypto";
import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalNumberLike,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { sm3Hex } from "../../core/sm3.ts";
import {
  parseProviderJsonBodyText,
  ProviderRequestError,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  readProviderJson,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const sfExpressApiBaseUrl = "https://bspgw.sf-express.com/std/service";

/** The sandbox gateway; every documented 沙箱环境 row names this host. */
const sfExpressSandboxBaseUrl = "https://sfapi-sbox.sf-express.com/std/service";

/** Endpoints whose production URL differs from the default gateway, per their documented common-parameters sections. */
const sfExpressBaseUrlByServiceCode: Record<string, string> = {
  COM_RECE_BRAND_INSP_ADD_IMAGES: "https://sfapi.sf-express.com/std/service",
  COM_RECE_CITYWIDE_PRINT_STATUS: "https://sfapi.sf-express.com/std/service",
  COM_RECE_CITYWIDE_PRINT_SUBMIT: "https://sfapi.sf-express.com/std/service",
  COM_RECE_DELIVERY_OPERATION_VERIFY: "https://sfapi.sf-express.com/std/service",
  COM_RECE_EOS_ADD_STORE_INFO: "https://sfapi.sf-express.com/std/service",
  COM_RECE_EOS_ADD_VILLAGE_STORE_IMG: "https://sfapi.sf-express.com/std/service",
  COM_RECE_EOS_ADD_VILLAGE_STORE_INFO: "https://sfapi.sf-express.com/std/service",
  COM_RECE_EOS_FC_WBSTORE_ADD_OR_UPDATE: "https://sfapi.sf-express.com/std/service",
  COM_RECE_EOS_YSF_WBSTORE_ADD_OR_UPDATE: "https://sfapi.sf-express.com/std/service",
  COM_RECE_FC_SETTLE_VERIFY: "https://sfapi.sf-express.com/std/service",
  COM_RECE_KB_CUST_REC_PACK: "https://sfapi.sf-express.com/std/service",
  COM_RECE_KB_HANDOVER_PACK: "https://sfapi.sf-express.com/std/service",
  COM_RECE_KB_PRE_HANDOVER_PACK: "https://sfapi.sf-express.com/std/service",
  COM_RECE_KB_SEND_SMS: "https://sfapi.sf-express.com/std/service",
  COM_RECE_KB_STORE_IMG_ADD: "https://sfapi.sf-express.com/std/service",
  COM_RECE_KB_STORE_SAVE: "https://sfapi.sf-express.com/std/service",
  COM_RECE_KB_WAYBILL_CHECK: "https://sfapi.sf-express.com/std/service",
  COM_RECE_KB_WILLBILLBUSS_659: "https://sfapi.sf-express.com/std/service",
  COM_RECE_KB_WILLBILLBUSS_EXPRESS_CHECK: "https://sfapi.sf-express.com/std/service",
  COM_RECE_NOTIFY_REC: "https://sfapi.sf-express.com/std/service",
  COM_RECE_QUERY_CENTRALIZE_EXPRESS: "https://sfapi.sf-express.com/std/service",
  COM_RECE_QUERY_WAYBILL_ROUTE: "https://sfapi.sf-express.com/std/service",
  COM_RECE_SEND_SMS_BY_WAYBILL: "https://sfapi.sf-express.com/std/service",
  COM_RECE_STORE_EXPRESS_CHECK: "https://sfapi.sf-express.com/std/service",
  COM_RECE_TEMP_STORE: "https://sfapi.sf-express.com/std/service",
  COM_RECE_VALIDATE_DELIVERY_PWD: "https://sfapi.sf-express.com/std/service",
  COM_RECE_VERIFY_WAYBILL_NUMBER: "https://sfapi.sf-express.com/std/service",
  EXP_RECE_REGISTER_ROUTE: "https://sfapi.sf-express.com/std/service",
  SCS_RECE_CALC_TRANSPORT_FEE: "https://sfapi.sf-express.com/std/service",
  SCS_RECE_CANCEL_ORDER: "https://sfapi.sf-express.com/std/service",
  SCS_RECE_CHECK_TRANSPORT_FLOW: "https://sfapi.sf-express.com/std/service",
  SCS_RECE_CREATE_ORDER: "https://sfapi.sf-express.com/std/service",
  SCS_RECE_ESTIMATE_DELIVER_TM: "https://sfapi.sf-express.com/std/service",
  SCS_RECE_QUERY_ORDER_INFO: "https://sfapi.sf-express.com/std/service",
  SCS_RECE_QUERY_ROUTE: "https://sfapi.sf-express.com/std/service",
  SCS_RECE_QUERY_WAYBILL_NO: "https://sfapi.sf-express.com/std/service",
};

const sfExpressPlatformSuccessCode = "A1000";

/** The inner envelope's own success marker, which some dialects send instead of `success`. */
const sfExpressBusinessSuccessCode = "S0000";

/** Inner error codes that mean the failure is ours or the platform's, never the caller's input. */
const sfExpressSystemErrorCodes = new Set(["S0001", "S0003"]);

type SfExpressPhase = "validate" | "execute";

/**
 * The msgDigest algorithm a partnerID is bound to. SF fixes the choice when the
 * application is created and cannot change it afterwards, so it belongs to the
 * credential rather than to a request.
 */
export type SfExpressSignatureAlgorithm = "standard_md5" | "simple_md5" | "sm3";

export interface SfExpressActionContext {
  partnerId: string;
  checkWord: string;
  /** Defaults to 标准MD5, the algorithm every application predating the choice signs with. */
  signatureAlgorithm?: SfExpressSignatureAlgorithm;
  /** Business client code assigned separately for the UFTL city-delivery APIs. */
  cityClientCode?: string;
  /** When true, all calls go to the SF sandbox gateway regardless of the service's production host. */
  sandbox?: boolean;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export type SfExpressActionHandler = ProviderRuntimeHandler<SfExpressActionContext>;

export function createSfExpressContext(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): SfExpressActionContext {
  return {
    partnerId: requiredInputString(values.partnerId, "partnerId"),
    checkWord: requiredInputString(values.checkWord, "checkWord"),
    signatureAlgorithm: readSignatureAlgorithm(values.signatureAlgorithm),
    cityClientCode: optionalString(values.cityClientCode),
    sandbox: readSandboxFlag(values.sandbox),
    fetcher,
    signal,
  };
}

/**
 * Read the optional sandbox credential field. An unrecognized value is rejected
 * rather than ignored, because falling back to production would send live
 * shipment orders from a credential its owner meant for sandbox onboarding.
 */
function readSandboxFlag(value: unknown): boolean {
  const flag = optionalString(value)?.toLowerCase();
  if (flag === undefined || flag === "false") {
    return false;
  }
  if (flag === "true") {
    return true;
  }
  throw providerInputError("sandbox must be true or false.");
}

/**
 * Read the optional signature-algorithm credential field, leaving it unset when
 * the connection does not name one so {@link signSfExpressPayload} owns the
 * default. An unrecognized value is rejected rather than falling back, because
 * the wrong algorithm fails every call with A1006 数字签名无效.
 */
function readSignatureAlgorithm(value: unknown): SfExpressSignatureAlgorithm | undefined {
  const algorithm = optionalString(value)?.toLowerCase();
  if (algorithm === undefined) {
    return undefined;
  }
  if (algorithm === "standard_md5" || algorithm === "simple_md5" || algorithm === "sm3") {
    return algorithm;
  }
  throw providerInputError("signatureAlgorithm must be standard_md5, simple_md5 or sm3.");
}

/** Map an optional boolean action input to the 1/0 flags SF Express expects on the wire. */
export function optionalFlagNumber(value: unknown): 1 | 0 | undefined {
  const flag = optionalBoolean(value);
  return flag === undefined ? undefined : flag ? 1 : 0;
}

/** Read an optional value-added service list (name + value…value4) from action input. */
export function readServiceValueList(value: unknown, fieldName: string): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return objectArray(value, fieldName, providerInputError).map((service, index) =>
    compactObject({
      name: requiredInputString(service.name, `${fieldName}[${index}].name`),
      value: optionalString(service.value),
      value1: optionalString(service.value1),
      value2: optionalString(service.value2),
      value3: optionalString(service.value3),
      value4: optionalString(service.value4),
    }),
  );
}

export async function validateSfExpressCredential(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createSfExpressContext(values, fetcher, signal);
  await requestSfExpress("EXP_RECE_VALIDATE_WAYBILLNO", { waybillNo: "SF1040275268927" }, context, "validate");

  return {
    profile: {
      accountId: `sf_express:${context.partnerId}`,
      displayName: `SF Express (${context.partnerId})`,
    },
    grantedScopes: [],
    metadata: {
      environment: context.sandbox ? "sandbox" : "production",
      // The default gateway for that environment; a few services document their own host.
      apiBaseUrl: context.sandbox ? sfExpressSandboxBaseUrl : sfExpressApiBaseUrl,
      // The algorithm this validation signed with, so an A1006 on a later call
      // can be told apart from a wrong check word.
      signatureAlgorithm: context.signatureAlgorithm ?? "standard_md5",
      validationEndpoint: "EXP_RECE_VALIDATE_WAYBILLNO",
    },
  };
}

/**
 * Percent-encode the way `java.net.URLEncoder.encode(text, "UTF-8")` does, which
 * is the form SF Express hashes. `encodeURIComponent` differs from it on the
 * space and on the characters JavaScript leaves unescaped, so both are fixed up
 * here; `*` is the one punctuation mark both implementations pass through.
 */
function javaFormUrlEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/[!'()~]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Sign one request with the algorithm the application was created against. All
 * three sign the same `msgData + timestamp + checkWord` string and differ only
 * in how they turn it into msgDigest:
 *
 * - `standard_md5` (标准MD5) runs it through `URLEncoder.encode(text, "UTF-8")`
 *   first, then Base64(MD5(...)). Skipping that step fails verification for
 *   every payload, because JSON always carries characters the encoder rewrites.
 * - `simple_md5` (简易MD5) is the same Base64(MD5(...)) over the raw string.
 * - `sm3` (SM3) is the lowercase-hex 国密 SM3 digest of the raw string.
 *
 * 标准MD5 is the default, because it is what SF signed with before it offered
 * the choice and what every application created back then still uses.
 */
export function signSfExpressPayload(
  msgData: string,
  timestamp: string,
  checkWord: string,
  algorithm: SfExpressSignatureAlgorithm = "standard_md5",
): string {
  const text = msgData + timestamp + checkWord;
  if (algorithm === "sm3") {
    return sm3Hex(text);
  }
  return createHash("md5")
    .update(algorithm === "standard_md5" ? javaFormUrlEncode(text) : text)
    .digest("base64");
}

/**
 * Call one SF Express Open Platform service: POST form-urlencoded with the
 * business JSON in msgData, signed by {@link signSfExpressPayload}. msgData is
 * usually an object; a few services (e.g. EXP_RECE_FILTER_ORDER_BSP) take a JSON
 * array instead. `extraForm` carries the form-level fields a handful of forwarding
 * services document beside msgData; the signature covers msgData only, so they
 * never take part in it.
 */
export async function requestSfExpress(
  serviceCode: string,
  msgData: unknown,
  context: SfExpressActionContext,
  phase: SfExpressPhase,
  extraForm?: Record<string, string>,
): Promise<unknown> {
  return runProviderRequest({ signal: context.signal, label: "SF Express" }, async (signal) => {
    const body = JSON.stringify(msgData);
    const timestamp = String(Date.now());
    const form = new URLSearchParams({
      partnerID: context.partnerId,
      requestID: randomUUID(),
      serviceCode,
      timestamp,
      msgDigest: signSfExpressPayload(body, timestamp, context.checkWord, context.signatureAlgorithm),
      msgData: body,
    });
    // A few forwarding services document a field beside msgData rather than inside it.
    for (const [name, value] of Object.entries(extraForm ?? {})) {
      form.set(name, value);
    }
    const baseUrl = context.sandbox
      ? sfExpressSandboxBaseUrl
      : (sfExpressBaseUrlByServiceCode[serviceCode] ?? sfExpressApiBaseUrl);
    const response = await context.fetcher(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      body: form.toString(),
      signal,
    });
    const outer = requiredResponseRecord(
      await readProviderJson<unknown>(response, "SF Express"),
      "SF Express response",
    );
    return unwrapSfExpressEnvelope(outer, phase);
  });
}

/**
 * Unwrap the SF Express response. Standard gateway answers carry the platform
 * code in apiResultCode (A1000 even for business failures) and the business
 * envelope in apiResultData — stringified JSON for some endpoints, an
 * already-parsed object for others. A few COM_* endpoints answer with the bare
 * business envelope and no apiResultCode at all. Inner envelopes put the error
 * text in errorMsg, errorMessage, or message, the error code in errorCode or
 * code, and the payload in msgData, obj, or (SCS cold-chain) data.
 */
function unwrapSfExpressEnvelope(outer: Record<string, unknown>, phase: SfExpressPhase): unknown {
  const code = optionalString(outer.apiResultCode);
  if (code !== undefined && code !== sfExpressPlatformSuccessCode) {
    throw createSfExpressPlatformError(code, optionalString(outer.apiErrorMsg), phase);
  }

  const rawData = code === undefined ? outer : outer.apiResultData;
  if (typeof rawData !== "string" && optionalRecord(rawData) === undefined) {
    throw providerResponseError("SF Express response is missing apiResultData");
  }
  const inner =
    typeof rawData === "string"
      ? parseProviderJsonBodyText(rawData, {
          emptyBody: null,
          invalidJsonMessage: "SF Express returned invalid apiResultData JSON",
        })
      : rawData;

  const record = requiredResponseRecord(inner, "SF Express apiResultData");

  // UFTL (city-delivery) envelope: { status, msg, data, success? } — 200 marks success.
  const uftlStatus = optionalNumberLike(record.status);
  if (uftlStatus !== undefined && ("msg" in record || "data" in record)) {
    if (uftlStatus !== 200) {
      throw createSfExpressUftlError(uftlStatus, optionalString(record.msg), phase);
    }
    return record.data;
  }

  // Raw-spec truckload envelope: { errorCode, errorMessage, obj } with no success marker.
  if (record.success === undefined) {
    const errorCode = optionalString(record.errorCode) ?? optionalString(record.code);
    if (errorCode !== undefined && errorCode !== sfExpressBusinessSuccessCode) {
      throw createSfExpressBusinessError(
        errorCode,
        optionalString(record.errorMessage) ?? optionalString(record.errorMsg),
      );
    }
    const data = readEnvelopePayload(record);
    if (data === undefined) {
      throw providerResponseError("SF Express response shape is not recognized");
    }
    return data;
  }

  if (record.success !== true && record.success !== "true") {
    throw createSfExpressBusinessError(
      optionalString(record.errorCode) ?? optionalString(record.code),
      optionalString(record.errorMsg) ??
        optionalString(record.errorMessage) ??
        optionalString(record.message) ??
        optionalString(record.msg),
    );
  }
  return readEnvelopePayload(record);
}

/** Pick the business payload out of an inner envelope: msgData, obj, or (SCS cold-chain) data. */
function readEnvelopePayload(record: Record<string, unknown>): unknown {
  return "msgData" in record ? record.msgData : "obj" in record ? record.obj : record.data;
}

function createSfExpressPlatformError(
  code: string,
  message: string | undefined,
  phase: SfExpressPhase,
): ProviderRequestError {
  const detail = message ?? `SF Express request failed with code ${code}`;
  if (code === "A1006" || code === "A1011") {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, detail);
  }
  if (code === "A1003" || code === "A1004") {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, detail);
  }
  if (code === "A1005") {
    return new ProviderRequestError(429, detail);
  }
  if (code === "A1001" || code === "A1002" || code === "A1007" || code === "A1010") {
    return providerInputError(detail);
  }
  return providerResponseError(detail);
}

/**
 * The UFTL envelope answers with 200 for success, an HTTP status for a transport
 * or auth failure, and a five-digit business code (10000 and up) for a rejected
 * request. Only the HTTP range gets HTTP meaning; everything else is the
 * caller's to fix.
 */
function createSfExpressUftlError(
  status: number,
  message: string | undefined,
  phase: SfExpressPhase,
): ProviderRequestError {
  const detail = message ?? `SF Express request failed with status ${status}`;
  if (status >= 500 && status < 600) {
    return providerResponseError(detail);
  }
  if (status === 429) {
    return new ProviderRequestError(429, detail);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, detail);
  }
  return providerInputError(detail);
}

function createSfExpressBusinessError(code: string | undefined, message: string | undefined): ProviderRequestError {
  const detail = message ?? `SF Express request failed${code ? ` with code ${code}` : ""}`;
  // Documented business codes (numeric service codes and S0002/S0004-S0007) are
  // caller-fixable input errors; S0001/S0003 and codeless failures are upstream's.
  if (code === undefined || sfExpressSystemErrorCodes.has(code)) {
    return providerResponseError(detail);
  }
  return providerInputError(detail);
}
