import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { EagleDocActionName } from "./actions.ts";

import {
  base64Bytes,
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const eagleDocApiBaseUrl = "https://de.eagle-doc.com";
const eagleDocFinanceProcessingPath = "/api/finance/v1/processing";
const eagleDocCurrentUsagePath = "/api/usage/v1/current";
const eagleDocMonthlyUsagePath = "/api/usage/v1/monthly";
const eagleDocUsageLogsPath = "/api/usage/v1/logs";
const eagleDocQuotaPath = "/api/management/v1/quota";

type EagleDocRequestPhase = "validate" | "execute";
type EagleDocActionContext = ApiKeyProviderContext;
type EagleDocActionHandler = (input: Record<string, unknown>, context: EagleDocActionContext) => Promise<unknown>;

export const eagleDocActionHandlers: Record<EagleDocActionName, EagleDocActionHandler> = {
  process_finance_document(input, context) {
    return processFinanceDocument(input, context);
  },
  get_current_usage(_input, context) {
    return getCurrentUsage(context);
  },
  list_monthly_usage(_input, context) {
    return listMonthlyUsage(context);
  },
  list_usage_logs(_input, context) {
    return listUsageLogs(context);
  },
  get_quota(_input, context) {
    return getQuota(context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("eagle_doc", eagleDocActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "eagle_doc",
  baseUrl: eagleDocApiBaseUrl,
  auth: { type: "api_key_header", name: "api-key" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const context: EagleDocActionContext = { apiKey: input.apiKey, fetcher, signal };
    const usage = requireObject(
      await eagleDocGetJson(eagleDocCurrentUsagePath, context, "validate"),
      "current usage validation",
    );
    return {
      profile: {
        accountId: "api_key",
        displayName: "Eagle Doc API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: eagleDocApiBaseUrl,
        validationEndpoint: eagleDocCurrentUsagePath,
        currentMonth: optionalString(usage.currentMonth),
        contractQuota: optionalInteger(usage.contractQuota),
        quotaUsed: optionalInteger(usage.quotaUsed),
      }),
    };
  },
};

async function processFinanceDocument(input: Record<string, unknown>, context: EagleDocActionContext) {
  const formData = new FormData();
  const contentBase64 = readRequiredString(input.contentBase64, "contentBase64");
  const fileName = readRequiredString(input.fileName, "fileName");
  const mimeType = optionalString(input.mimeType) ?? "application/octet-stream";
  formData.set(
    "file",
    new File(
      [base64Bytes(contentBase64, "contentBase64", (message) => new ProviderRequestError(400, message))],
      fileName,
      {
        type: mimeType,
      },
    ),
  );

  const query = compactObject({
    privacy: stringifyOptionalBoolean(optionalBoolean(input.privacy)),
    polygon: stringifyOptionalBoolean(optionalBoolean(input.polygon)),
    fullText: stringifyOptionalBoolean(optionalBoolean(input.fullText)),
    signature: stringifyOptionalBoolean(optionalBoolean(input.signature)),
  });

  const payload = await eagleDocPostForm(eagleDocFinanceProcessingPath, formData, context, query);

  return normalizeFinanceDocument(payload);
}

async function getCurrentUsage(context: EagleDocActionContext) {
  return normalizeCurrentUsage(await eagleDocGetJson(eagleDocCurrentUsagePath, context, "execute"));
}

async function listMonthlyUsage(context: EagleDocActionContext) {
  return normalizeMonthlyUsage(await eagleDocGetJson(eagleDocMonthlyUsagePath, context, "execute"));
}

async function listUsageLogs(context: EagleDocActionContext) {
  return normalizeUsageLogs(await eagleDocGetJson(eagleDocUsageLogsPath, context, "execute"));
}

async function getQuota(context: EagleDocActionContext) {
  return normalizeQuota(await eagleDocGetJson(eagleDocQuotaPath, context, "execute"));
}

async function eagleDocGetJson(path: string, context: EagleDocActionContext, phase: EagleDocRequestPhase) {
  let response: Response;
  try {
    response = await context.fetcher(new URL(path, eagleDocApiBaseUrl), {
      method: "GET",
      headers: eagleDocHeaders(context.apiKey, { accept: "application/json" }),
      signal: context.signal,
    });
  } catch (error) {
    throw createTransportError(error);
  }

  const payload = await readEagleDocPayload(response);
  if (!response.ok) {
    throw createEagleDocError(response.status, payload, phase);
  }
  return payload;
}

async function eagleDocPostForm(
  path: string,
  formData: FormData,
  context: EagleDocActionContext,
  query: Record<string, string | undefined>,
) {
  const url = new URL(path, eagleDocApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "POST",
      headers: eagleDocHeaders(context.apiKey, { accept: "application/json" }),
      body: formData,
      signal: context.signal,
    });
  } catch (error) {
    throw createTransportError(error);
  }

  const payload = await readEagleDocPayload(response);
  if (!response.ok) {
    throw createEagleDocError(response.status, payload, "execute");
  }
  return payload;
}

function eagleDocHeaders(apiKey: string, extraHeaders: Record<string, string>) {
  return {
    "api-key": apiKey,
    "user-agent": providerUserAgent,
    ...extraHeaders,
  };
}

async function readEagleDocPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createEagleDocError(status: number, payload: unknown, phase: EagleDocRequestPhase) {
  const message = extractEagleDocErrorMessage(payload) ?? "Eagle Doc request failed";

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }

  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function createTransportError(error: unknown) {
  return new ProviderRequestError(
    502,
    error instanceof Error ? `Eagle Doc request failed: ${error.message}` : "Eagle Doc request failed",
    error,
  );
}

function extractEagleDocErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.exception) ??
    optionalString(record.title) ??
    optionalString(record.detail)
  );
}

function normalizeFinanceDocument(payload: unknown) {
  const record = requireObject(payload, "finance OCR response");
  return {
    docType: optionalString(record.docType) ?? null,
    general: normalizeFieldMap(record.general),
    productItems: normalizeFieldMapArray(record.productItems, "productItems"),
    taxes: normalizeNullableFieldMapArray(record.taxes, "taxes"),
    payments: normalizeNullableFieldMapArray(record.payments, "payments"),
    paymentBanks: normalizeNullableFieldMapArray(record.paymentBanks, "paymentBanks"),
    signatures: normalizeNullableLooseObjectArray(record.signatures),
    signatureImages: normalizeNullableUnknownArray(record.signatureImages),
    qrCodes: normalizeNullableLooseObjectArray(record.qrCodes),
    performanceOption: optionalString(record.performanceOption) ?? null,
    fileHash: optionalString(record.fileHash) ?? null,
    version: optionalString(record.version) ?? null,
    numberOfPages: optionalInteger(record.numberOfPages) ?? null,
    pages: normalizePages(record.pages),
    fullText: normalizeFullText(record.fullText),
    languages: normalizeStringArray(record.languages, "languages"),
    mainLanguage: optionalString(record.mainLanguage) ?? null,
    templateId: record.templateId ?? null,
  };
}

function normalizeCurrentUsage(payload: unknown) {
  const record = requireObject(payload, "current usage response");
  return {
    currentMonth: readRequiredString(record.currentMonth, "currentMonth"),
    contractQuota: readRequiredInteger(record.contractQuota, "contractQuota"),
    quotaUsed: readRequiredInteger(record.quotaUsed, "quotaUsed"),
    overUsageAllowed: readRequiredBoolean(record.overUsageAllowed, "overUsageAllowed"),
    hardLimit: optionalInteger(record.hardLimit) ?? null,
    overUsage: readRequiredInteger(record.overUsage, "overUsage"),
    pricePerPageOverUsage: readRequiredNumber(record.pricePerPageOverUsage, "pricePerPageOverUsage"),
    overUsageCost: readRequiredNumber(record.overUsageCost, "overUsageCost"),
  };
}

function normalizeMonthlyUsage(payload: unknown) {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Eagle Doc monthly usage response is invalid");
  }

  return {
    months: payload.map((item, index) => {
      const record = requireObject(item, `monthly usage row ${index}`);
      return {
        quotaUsed: readRequiredInteger(record.quotaUsed, `months[${index}].quotaUsed`),
        quotaDate: readRequiredString(record.quotaDate, `months[${index}].quotaDate`),
        additionalInfo: optionalRecord(record.additionalInfo) ?? {},
      };
    }),
  };
}

function normalizeUsageLogs(payload: unknown) {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Eagle Doc usage logs response is invalid");
  }

  return {
    logs: payload.map((item, index) => {
      const record = requireObject(item, `usage log row ${index}`);
      return {
        pages: readRequiredInteger(record.pages, `logs[${index}].pages`),
        time: readRequiredString(record.time, `logs[${index}].time`),
        timeRequested: readRequiredString(record.timeRequested, `logs[${index}].timeRequested`),
      };
    }),
  };
}

function normalizeQuota(payload: unknown) {
  const record = requireObject(payload, "quota response");
  return {
    quota: optionalInteger(record.quota) ?? null,
    quotaUsed: readRequiredInteger(record.quotaUsed, "quotaUsed"),
    currentMonth: readRequiredString(record.currentMonth, "currentMonth"),
  };
}

function normalizeFieldMap(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }

  return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, normalizeExtractedField(child)]));
}

function normalizeFieldMapArray(value: unknown, fieldName: string) {
  return readOptionalArray(value, fieldName).map((item, index) => {
    const record = requireObject(item, `field map row ${index}`);
    return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, normalizeExtractedField(child)]));
  });
}

function normalizeNullableFieldMapArray(value: unknown, fieldName: string) {
  if (value == null) {
    return null;
  }

  return normalizeFieldMapArray(value, fieldName);
}

function normalizeExtractedField(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    return {
      value,
      polygon: null,
      page: null,
      confidence: null,
    };
  }

  return {
    value: record.value,
    polygon: normalizePolygon(record.polygon),
    page: optionalInteger(record.page) ?? null,
    confidence: optionalNumber(record.confidence) ?? null,
  };
}

function normalizePolygon(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }

  const p1 = normalizePoint(record.p1);
  const p2 = normalizePoint(record.p2);
  const p3 = normalizePoint(record.p3);
  const p4 = normalizePoint(record.p4);
  if (!p1 || !p2 || !p3 || !p4) {
    return null;
  }

  return { p1, p2, p3, p4 };
}

function normalizePoint(value: unknown) {
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }

  const x = typeof value[0] === "number" ? value[0] : Number(value[0]);
  const y = typeof value[1] === "number" ? value[1] : Number(value[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return [x, y] as const;
}

function normalizePages(value: unknown) {
  return readOptionalArray(value, "pages").map((item, index) => {
    const record = requireObject(item, `pages[${index}]`);
    return {
      width: readRequiredNumber(record.width, `pages[${index}].width`),
      height: readRequiredNumber(record.height, `pages[${index}].height`),
    };
  });
}

function normalizeFullText(value: unknown) {
  if (value == null) {
    return null;
  }

  return readRequiredArray(value, "fullText").map((page, index) => {
    if (!Array.isArray(page)) {
      throw invalidProviderResponse(`fullText[${index}]`);
    }
    return page.map((line, lineIndex) => {
      if (typeof line !== "string") {
        throw invalidProviderResponse(`fullText[${index}][${lineIndex}]`);
      }
      return line;
    });
  });
}

function normalizeStringArray(value: unknown, fieldName: string) {
  return readOptionalArray(value, fieldName).map((item, index) => {
    if (typeof item !== "string") {
      throw invalidProviderResponse(`${fieldName}[${index}]`);
    }
    return item;
  });
}

function normalizeNullableLooseObjectArray(value: unknown) {
  if (value == null) {
    return null;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Eagle Doc array response is invalid");
  }

  return value.map((item, index) => requireObject(item, `array item ${index}`));
}

function normalizeNullableUnknownArray(value: unknown) {
  if (value == null) {
    return null;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Eagle Doc array response is invalid");
  }

  return value;
}

function stringifyOptionalBoolean(value: boolean | undefined) {
  return value === undefined ? undefined : String(value);
}

function requireObject(value: unknown, fieldName: string) {
  const record = optionalRecord(value);
  if (!record) {
    throw invalidProviderResponse(fieldName);
  }
  return record;
}

function readOptionalArray(value: unknown, fieldName: string) {
  if (value == null) {
    return [];
  }
  return readRequiredArray(value, fieldName);
}

function readRequiredArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw invalidProviderResponse(fieldName);
  }
  return value;
}

function invalidProviderResponse(fieldName: string) {
  return new ProviderRequestError(502, `Eagle Doc ${fieldName} response is invalid`);
}

function readRequiredString(value: unknown, fieldName: string) {
  const text = optionalString(value)?.trim();
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readRequiredInteger(value: unknown, fieldName: string) {
  const integer = optionalInteger(value);
  if (integer === undefined) {
    throw new ProviderRequestError(502, `Eagle Doc ${fieldName} response is invalid`);
  }
  return integer;
}

function readRequiredNumber(value: unknown, fieldName: string) {
  const number = optionalNumber(value);
  if (number === undefined) {
    throw new ProviderRequestError(502, `Eagle Doc ${fieldName} response is invalid`);
  }
  return number;
}

function readRequiredBoolean(value: unknown, fieldName: string) {
  const booleanValue = optionalBoolean(value);
  if (booleanValue === undefined) {
    throw new ProviderRequestError(502, `Eagle Doc ${fieldName} response is invalid`);
  }
  return booleanValue;
}
