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

/** The sandbox gateway most endpoints share. */
const sfExpressSandboxBaseUrl = "https://sfapi-sbox.sf-express.com/std/service";

/** Endpoints whose documented test environment is the SIT host rather than the shared sandbox gateway. */
const sfExpressSandboxBaseUrlByServiceCode: Record<string, string> = {
  COM_RECE_BRAND_INSP_ADD_IMAGES: "https://sfapi.sit.sf-express.com:45273/std/service",
  COM_RECE_EOS_ADD_FC_IMG: "https://sfapi.sit.sf-express.com:45273/std/service",
  COM_RECE_EOS_ADD_STORE_IMG: "https://sfapi.sit.sf-express.com:45273/std/service",
  COM_RECE_EOS_ADD_VILLAGE_STORE_IMG: "https://sfapi.sit.sf-express.com:45273/std/service",
  COM_RECE_EOS_ADD_XGJ_IMG: "https://sfapi.sit.sf-express.com:45273/std/service",
  COM_RECE_EOS_ADD_XGJ_STORE_INFO: "https://sfapi.sit.sf-express.com:45273/std/service",
  COM_RECE_EOS_FC_WBSTORE_ADD_OR_UPDATE: "https://sfapi.sit.sf-express.com:45273/std/service",
  COM_RECE_EOS_GET_OSS_TOKEN: "https://sfapi.sit.sf-express.com:45273/std/service",
  COM_RECE_EOS_QUERY_WAYBILL_INFO: "https://sfapi.sit.sf-express.com:45273/std/service",
  COM_RECE_EOS_RECEIPT_WAYBILL_INFO: "https://sfapi.sit.sf-express.com:45273/std/service",
  COM_RECE_EOS_UPLOAD_PICTURE: "https://sfapi.sit.sf-express.com:45273/std/service",
  COM_RECE_EOS_XGJ_UPDATE_SAFE_FEE: "https://sfapi.sit.sf-express.com:45273/std/service",
  COM_RECE_EOS_XGJ_WAYBILL_INFO: "https://sfapi.sit.sf-express.com:45273/std/service",
  COM_RECE_EOS_YSF_WBSTORE_ADD_OR_UPDATE: "https://sfapi.sit.sf-express.com:45273/std/service",
};

/** Endpoints whose production URL differs from the default gateway, per their documented common-parameters sections. */
const sfExpressBaseUrlByServiceCode: Record<string, string> = {
  COM_RECE_CITYWIDE_PRINT_STATUS: "https://sfapi.sf-express.com/std/service",
  COM_RECE_CITYWIDE_PRINT_SUBMIT: "https://sfapi.sf-express.com/std/service",
  COM_RECE_DELIVERY_OPERATION_VERIFY: "https://sfapi.sf-express.com/std/service",
  COM_RECE_EOS_ADD_STORE_INFO: "https://sfapi.sf-express.com/std/service",
  COM_RECE_EOS_ADD_VILLAGE_STORE_INFO: "https://sfapi.sf-express.com/std/service",
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

/** Inner error codes that mean the failure is ours or the platform's, never the caller's input. */
const sfExpressSystemErrorCodes = new Set(["S0001", "S0003"]);

type SfExpressPhase = "validate" | "execute";

export interface SfExpressActionContext {
  partnerId: string;
  checkWord: string;
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
    sandbox: values.sandbox === "true",
    fetcher,
    signal,
  };
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
      apiBaseUrl: sfExpressApiBaseUrl,
      validationEndpoint: "EXP_RECE_VALIDATE_WAYBILLNO",
    },
  };
}

/**
 * Call one SF Express Open Platform service: POST form-urlencoded with the
 * business JSON in msgData, signed as Base64(MD5(msgData + timestamp + checkWord)).
 * msgData is usually an object; a few services (e.g. EXP_RECE_FILTER_ORDER_BSP)
 * take a JSON array instead.
 */
export async function requestSfExpress(
  serviceCode: string,
  msgData: unknown,
  context: SfExpressActionContext,
  phase: SfExpressPhase,
): Promise<unknown> {
  return runProviderRequest({ signal: context.signal, label: "SF Express" }, async (signal) => {
    const body = JSON.stringify(msgData);
    const timestamp = String(Date.now());
    const form = new URLSearchParams({
      partnerID: context.partnerId,
      requestID: randomUUID(),
      serviceCode,
      timestamp,
      msgDigest: createHash("md5")
        .update(body + timestamp + context.checkWord)
        .digest("base64"),
      msgData: body,
    });
    const baseUrl = context.sandbox
      ? (sfExpressSandboxBaseUrlByServiceCode[serviceCode] ?? sfExpressSandboxBaseUrl)
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

  // UFTL (city-delivery) envelope: { status, msg, data } — 200 marks success.
  const uftlStatus = optionalNumberLike(record.status);
  if (record.success === undefined && uftlStatus !== undefined) {
    if (uftlStatus !== 200) {
      throw createSfExpressBusinessError(String(record.status), optionalString(record.msg));
    }
    return record.data;
  }

  // Raw-spec truckload envelope: { errorCode, errorMessage, obj } with no success marker.
  if (record.success === undefined) {
    const errorCode = optionalString(record.errorCode) ?? optionalString(record.code);
    if (errorCode !== undefined) {
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
      optionalString(record.errorMsg) ?? optionalString(record.errorMessage) ?? optionalString(record.message),
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

function createSfExpressBusinessError(code: string | undefined, message: string | undefined): ProviderRequestError {
  const detail = message ?? `SF Express request failed${code ? ` with code ${code}` : ""}`;
  // Documented business codes (numeric service codes and S0002/S0004-S0007) are
  // caller-fixable input errors; S0001/S0003 and codeless failures are upstream's.
  if (code === undefined || sfExpressSystemErrorCodes.has(code)) {
    return providerResponseError(detail);
  }
  return providerInputError(detail);
}
