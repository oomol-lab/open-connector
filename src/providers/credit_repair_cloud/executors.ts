import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import XMLBuilder from "fast-xml-builder";
import { XMLParser } from "fast-xml-parser";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "credit_repair_cloud";
const creditRepairCloudApiBaseUrl = "https://app.creditrepaircloud.com/api";
const validationRecordId = "MQ==";
const creditRepairCloudMaxResponseBytes = 10 * 1024 * 1024;

interface CreditRepairCloudActionSpec {
  readonly path: string;
  readonly rootElement: "lead" | "client" | "affiliate";
  readonly resultType: "mutation" | "view";
}

interface CreditRepairCloudRequestContext {
  readonly apiKey: string;
  readonly secretKey: string;
  readonly phase: "validate" | "execute";
  readonly actionName: string;
  readonly input: Record<string, unknown>;
  readonly fetcher: typeof fetch;
  readonly signal?: AbortSignal;
}

interface CreditRepairCloudActionContext {
  apiKey: string;
  secretKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

const actionSpecs: Record<string, CreditRepairCloudActionSpec> = {
  insert_lead_client: {
    path: "/lead/insertRecord",
    rootElement: "lead",
    resultType: "mutation",
  },
  update_lead_client: {
    path: "/lead/updateRecord",
    rootElement: "lead",
    resultType: "mutation",
  },
  delete_lead_client: {
    path: "/lead/deleteRecord",
    rootElement: "client",
    resultType: "mutation",
  },
  view_lead_client: {
    path: "/lead/viewRecord",
    rootElement: "client",
    resultType: "view",
  },
  insert_affiliate: {
    path: "/affiliate/insertRecord",
    rootElement: "affiliate",
    resultType: "mutation",
  },
  update_affiliate: {
    path: "/affiliate/updateRecord",
    rootElement: "affiliate",
    resultType: "mutation",
  },
  delete_affiliate: {
    path: "/affiliate/deleteRecord",
    rootElement: "affiliate",
    resultType: "mutation",
  },
  view_affiliate: {
    path: "/affiliate/viewRecord",
    rootElement: "affiliate",
    resultType: "view",
  },
};

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  suppressEmptyNode: true,
});

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  ignoreDeclaration: true,
  parseTagValue: false,
  trimValues: true,
});

type CreditRepairCloudActionHandler = (
  input: Record<string, unknown>,
  context: CreditRepairCloudActionContext,
) => Promise<unknown>;

const actionHandlers: ProviderActionHandlers<"credit_repair_cloud", CreditRepairCloudActionHandler> = {
  insert_lead_client: bindAction("insert_lead_client"),
  update_lead_client: bindAction("update_lead_client"),
  delete_lead_client: bindAction("delete_lead_client"),
  view_lead_client: bindAction("view_lead_client"),
  insert_affiliate: bindAction("insert_affiliate"),
  update_affiliate: bindAction("update_affiliate"),
  delete_affiliate: bindAction("delete_affiliate"),
  view_affiliate: bindAction("view_affiliate"),
};

export const executors: ProviderExecutors = defineProviderExecutors<CreditRepairCloudActionContext>({
  service,
  handlers: actionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher): Promise<CreditRepairCloudActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      secretKey: requireSecretKey(credential.values.secretKey),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: creditRepairCloudApiBaseUrl,
  auth: { type: "api_key_query", name: "apiauthkey" },
  skipDnsValidation: true,
  async customizeRequest({ context, url }) {
    const credential = await requireApiKeyCredential(context, service);
    url.searchParams.set("secretkey", requireSecretKey(credential.values.secretKey));
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const secretKey = requireSecretKey(input.values.secretKey);
    try {
      await requestCreditRepairCloud({
        apiKey: input.apiKey,
        secretKey,
        phase: "validate",
        actionName: "view_lead_client",
        input: { id: validationRecordId },
        fetcher,
        signal,
      });
    } catch (error) {
      if (!isValidationRecordMiss(error)) {
        throw error;
      }
    }
    return {
      profile: {
        accountId: "credit_repair_cloud",
        displayName: "Credit Repair Cloud API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: creditRepairCloudApiBaseUrl,
        validationEndpoint: "/lead/viewRecord",
      },
    };
  },
};

function executeCreditRepairCloudAction(
  actionName: string,
  input: Record<string, unknown>,
  context: CreditRepairCloudActionContext,
) {
  return requestCreditRepairCloud({
    ...context,
    phase: "execute",
    actionName,
    input,
  });
}

function bindAction(actionName: string): CreditRepairCloudActionHandler {
  return (input, context) => executeCreditRepairCloudAction(actionName, input, context);
}

async function requestCreditRepairCloud(context: CreditRepairCloudRequestContext) {
  const spec = actionSpecs[context.actionName];
  if (!spec) {
    throw new ProviderRequestError(500, `Unsupported Credit Repair Cloud action: ${context.actionName}`);
  }
  const url = new URL(`/api${spec.path}`, "https://app.creditrepaircloud.com");
  url.searchParams.set("apiauthkey", context.apiKey);
  url.searchParams.set("secretkey", context.secretKey);

  const xmlData = buildXmlData(spec.rootElement, context.input);
  const body = new URLSearchParams();
  body.set("xmlData", xmlData);

  const timeout = createProviderTimeout(context.signal);
  try {
    const response = await context.fetcher(url, {
      method: "POST",
      headers: {
        accept: "application/xml, text/xml, text/html",
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent": providerUserAgent,
      },
      body,
      signal: timeout.signal,
    });
    const rawText = await readProviderTextBody(
      response,
      "Credit Repair Cloud response",
      creditRepairCloudMaxResponseBytes,
    );
    const payload = parseCreditRepairCloudXml(rawText);
    if (!response.ok) {
      throw createCreditRepairCloudHttpError(response.status, readResponseMessage(payload), context.phase);
    }
    const normalized = normalizeCreditRepairCloudResponse(payload, spec);
    if (!normalized.success) {
      throw createCreditRepairCloudResponseError(normalized.code, normalized.message, context.phase, payload);
    }
    return normalized;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Credit Repair Cloud request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Credit Repair Cloud request failed: ${error.message}`
        : "Credit Repair Cloud request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildXmlData(rootElement: CreditRepairCloudActionSpec["rootElement"], input: Record<string, unknown>) {
  const recordInput = optionalRecord(input.record);
  const record = compactXmlRecord({
    id: optionalString(input.id),
    ...(recordInput ?? {}),
  });
  return xmlBuilder.build({
    crcloud: {
      [rootElement]: record,
    },
  });
}

function compactXmlRecord(input: Record<string, unknown>) {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const stringValue = optionalString(value);
    if (stringValue) {
      output[key] = stringValue;
    }
  }
  return output;
}

function parseCreditRepairCloudXml(rawText: string) {
  try {
    const payload = xmlParser.parse(rawText) as unknown;
    const record = optionalRecord(payload);
    if (!record) {
      throw new Error("Credit Repair Cloud returned a non-object XML payload");
    }
    return record;
  } catch (error) {
    throw new ProviderRequestError(502, "Credit Repair Cloud returned malformed XML", error);
  }
}

function normalizeCreditRepairCloudResponse(payload: Record<string, unknown>, spec: CreditRepairCloudActionSpec) {
  const response = optionalRecord(payload.response) ?? payload;
  const result = optionalRecord(response.result);
  const errors = optionalRecord(result?.errors) ?? optionalRecord(response.errors);
  const success = errors ? false : readSuccess(response.success);
  const code = readFirstString(response.code, response.error_no, result?.code, result?.error_no, errors?.error_no);
  const message = readFirstString(
    response.message,
    response.error_message,
    result?.message,
    result?.error_message,
    errors?.error_message,
  );
  const id = readFirstString(response.id, result?.id, result?.record_id);

  if (spec.resultType === "view") {
    return {
      success,
      record: readRecord(response, result),
      code,
      message,
      raw: payload,
    };
  } else {
    return {
      success,
      id,
      code,
      message,
      raw: payload,
    };
  }
}

function readSuccess(value: unknown) {
  const stringValue = optionalString(value)?.toLowerCase();
  if (stringValue == "true" || stringValue == "1" || stringValue == "success") {
    return true;
  } else if (stringValue == "false" || stringValue == "0" || stringValue == "failure") {
    return false;
  } else {
    return false;
  }
}

function readRecord(response: Record<string, unknown>, result: Record<string, unknown> | undefined) {
  const candidates = [
    result?.client,
    result?.lead,
    result?.affiliate,
    result?.record,
    response.client,
    response.lead,
    response.affiliate,
    response.record,
    result,
  ];
  for (const candidate of candidates) {
    const record = optionalRecord(candidate);
    if (record && !optionalRecord(record.errors)) {
      return record;
    }
  }
  return null;
}

function readResponseMessage(payload: Record<string, unknown>) {
  const response = optionalRecord(payload.response) ?? payload;
  const result = optionalRecord(response.result);
  const errors = optionalRecord(result?.errors) ?? optionalRecord(response.errors);
  return readFirstString(response.message, result?.message, errors?.error_message);
}

function readFirstString(...values: unknown[]) {
  for (const value of values) {
    const stringValue = optionalString(value);
    if (stringValue) {
      return stringValue;
    }
  }
  return null;
}

function createCreditRepairCloudResponseError(
  code: string | null,
  message: string | null,
  phase: CreditRepairCloudRequestContext["phase"],
  payload: Record<string, unknown>,
) {
  const errorCode =
    code == "4409"
      ? "rate_limited"
      : phase == "execute" && isCreditRepairCloudCredentialErrorCode(code)
        ? "credential_expired"
        : isCreditRepairCloudInvalidInputCode(code)
          ? "invalid_input"
          : "provider_error";
  const status =
    errorCode == "rate_limited"
      ? 429
      : errorCode == "invalid_input"
        ? 400
        : errorCode == "credential_expired"
          ? 401
          : 502;
  return new ProviderRequestError(status, message ?? `Credit Repair Cloud returned error${code ? ` ${code}` : ""}`, {
    providerErrorCode: code,
    payload,
  });
}

function createCreditRepairCloudHttpError(
  status: number,
  message: string | null,
  phase: CreditRepairCloudRequestContext["phase"],
) {
  const errorCode =
    status == 429
      ? "rate_limited"
      : status == 401 || status == 403
        ? phase == "execute"
          ? "credential_expired"
          : "invalid_input"
        : "provider_error";
  const normalizedStatus =
    errorCode == "rate_limited"
      ? 429
      : errorCode == "invalid_input"
        ? 400
        : errorCode == "credential_expired"
          ? 401
          : status;
  return new ProviderRequestError(normalizedStatus, message ?? `Credit Repair Cloud request failed with ${status}`);
}

function isCreditRepairCloudCredentialErrorCode(code: string | null) {
  return code == "4405" || code == "4406" || code == "4411";
}

function isCreditRepairCloudInvalidInputCode(code: string | null) {
  return (
    code == "4401" ||
    code == "4402" ||
    code == "4403" ||
    code == "4404" ||
    code == "4405" ||
    code == "4406" ||
    code == "4407" ||
    code == "4410" ||
    code == "4411" ||
    code == "4413" ||
    code == "4416" ||
    code == "4417"
  );
}

function isValidationRecordMiss(error: unknown) {
  return (
    error instanceof ProviderRequestError &&
    error.status === 400 &&
    optionalRecord(error.details)?.providerErrorCode === "4413"
  );
}

function requireSecretKey(value: unknown) {
  const secretKey = optionalString(value);
  if (!secretKey) {
    throw new ProviderRequestError(400, "secretKey is required");
  }
  return secretKey;
}
