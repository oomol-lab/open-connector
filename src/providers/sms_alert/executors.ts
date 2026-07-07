import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { SmsAlertActionName } from "./actions.ts";

import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderProxy,
  defineProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "sms_alert";
const smsAlertApiOrigin = "https://www.smsalert.co.in";
const smsAlertApiBasePath = "/api";
const smsAlertRequestTimeoutMs = 10_000;

type SmsAlertPhase = "validate" | "execute";

interface SmsAlertActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type SmsAlertActionHandler = (input: Record<string, unknown>, context: SmsAlertActionContext) => Promise<unknown>;

export const smsAlertActionHandlers: Record<SmsAlertActionName, SmsAlertActionHandler> = {
  get_credit_balance(_input, context) {
    return requestCreditBalance(context, "execute");
  },
  list_sender_ids(_input, context) {
    return requestSenderList(context);
  },
  list_templates(input, context) {
    return requestTemplateList({
      context,
      order: optionalString(input.order),
      page: optionalInteger(input.page),
      limit: optionalInteger(input.limit),
    });
  },
  send_sms(input, context) {
    return requestBatchOperation({
      context,
      path: "/push.json",
      query: {
        sender: readInputString(input.senderId, "senderId"),
        mobileno: readInputString(input.mobileNumbers, "mobileNumbers"),
        text: readInputString(input.message, "message"),
      },
    });
  },
  generate_otp(input, context) {
    const template = readInputString(input.template, "template");
    if (!hasOtpPlaceholderToken(template)) {
      throw new ProviderRequestError(400, 'template must include an "[otp]" placeholder token');
    }
    return requestBatchOperation({
      context,
      path: "/mverify.json",
      query: {
        sender: readInputString(input.senderId, "senderId"),
        mobileno: readInputString(input.mobileNumber, "mobileNumber"),
        template,
      },
    });
  },
  validate_otp(input, context) {
    return requestOtpValidation({
      context,
      mobileNumber: readInputString(input.mobileNumber, "mobileNumber"),
      code: readInputString(input.code, "code"),
    });
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<SmsAlertActionContext>({
  service,
  handlers: smsAlertActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<SmsAlertActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: `${smsAlertApiOrigin}${smsAlertApiBasePath}`,
  auth: { type: "api_key_query", name: "apikey" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const result = await requestCreditBalance({ apiKey: input.apiKey, fetcher, signal }, "validate");
    const resultRecord = optionalRecord(result);
    return {
      profile: {
        accountId: "sms_alert",
        displayName: "SMS Alert API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: `${smsAlertApiOrigin}${smsAlertApiBasePath}`,
        validationEndpoint: "/creditstatus.json",
        creditSummary: resultRecord?.summary,
        availableRoutes: resultRecord?.routes,
      },
    };
  },
};

async function requestCreditBalance(context: SmsAlertActionContext, phase: SmsAlertPhase): Promise<unknown> {
  const payload = await requestSmsAlert({ path: "/creditstatus.json", method: "GET", context, phase });
  const description = requireDescriptionObject(payload, "/creditstatus.json");
  const routeRecords = Array.isArray(description.routes) ? description.routes : [];
  return {
    summary: readResponseString(description.desc, "description.desc"),
    routes: routeRecords.map((item) => {
      const routeRecord = requireObject(item, "description.routes[]");
      return {
        route: readResponseString(routeRecord.route, "route"),
        displayName: readResponseString(routeRecord.display_name, "display_name"),
        credits: readResponseInteger(routeRecord.credits, "credits"),
      };
    }),
  };
}

async function requestSenderList(context: SmsAlertActionContext): Promise<unknown> {
  const payload = await requestSmsAlert({ path: "/senderlist.json", method: "GET", context, phase: "execute" });
  if (isDescriptionMessage(payload, "no senderid available for your account")) {
    return { senders: [] };
  }
  const description = requireDescriptionArray(payload, "/senderlist.json");
  return {
    senders: description.map((item) => {
      const senderWrapper = requireObject(item, "description[]");
      const sender = requireObject(senderWrapper.Senderid, "Senderid");
      return {
        sender: readResponseString(sender.sender, "sender"),
        approved: readResponseBoolean(sender.approved, "approved"),
        open: readResponseBoolean(sender.open, "open"),
        createdAt: readResponseString(sender.datetime, "datetime"),
      };
    }),
  };
}

async function requestTemplateList(input: {
  context: SmsAlertActionContext;
  order?: string;
  page?: number;
  limit?: number;
}): Promise<unknown> {
  let payload: Record<string, unknown> | null;
  try {
    payload = await requestSmsAlert({
      path: "/templatelist.json",
      method: "GET",
      context: input.context,
      phase: "execute",
      query: {
        order: input.order,
        page: input.page == null ? undefined : String(input.page),
        limit: input.limit == null ? undefined : String(input.limit),
      },
    });
  } catch (error) {
    if (
      error instanceof ProviderRequestError &&
      error.status >= 500 &&
      error.message === "no template available for your account"
    ) {
      payload = null;
    } else {
      throw error;
    }
  }
  if (payload === null) {
    return { templates: [] };
  }
  const description = requireDescriptionArray(payload, "/templatelist.json");
  return {
    templates: description.map((item) => {
      const templateWrapper = requireObject(item, "description[]");
      const template = requireObject(templateWrapper.Smstemplate, "Smstemplate");
      return {
        id: readResponseString(template.id, "id"),
        title: readResponseString(template.title, "title"),
        template: readResponseString(template.template, "template"),
        createdAt: readResponseString(template.creationdate, "creationdate"),
      };
    }),
  };
}

async function requestBatchOperation(input: {
  context: SmsAlertActionContext;
  path: string;
  query: Record<string, string>;
}): Promise<unknown> {
  const payload = await requestSmsAlert({
    path: input.path,
    method: "POST",
    context: input.context,
    phase: "execute",
    query: input.query,
  });
  const description = requireDescriptionObject(payload, input.path);
  const batchDetails = Array.isArray(description.batch_dtl) ? description.batch_dtl : [];
  return {
    message: readResponseString(description.desc, "description.desc"),
    batchId: readResponseString(description.batchid, "description.batchid"),
    deliveries: batchDetails.map((item) => {
      const detail = requireObject(item, "description.batch_dtl[]");
      return {
        mobileNumber: readResponseString(detail.mobileno, "mobileno"),
        messageId: readResponseString(detail.msgid, "msgid"),
        status: readResponseString(detail.status, "status"),
      };
    }),
  };
}

async function requestOtpValidation(input: {
  context: SmsAlertActionContext;
  mobileNumber: string;
  code: string;
}): Promise<unknown> {
  const payload = await requestSmsAlert({
    path: "/mverify.json",
    method: "POST",
    context: input.context,
    phase: "execute",
    query: {
      mobileno: input.mobileNumber,
      code: input.code,
    },
  });
  const description = requireDescriptionObject(payload, "/mverify.json");
  const message = readResponseString(description.desc, "description.desc");
  return {
    matched: message.toLowerCase() === "code matched successfully.",
    message,
  };
}

async function requestSmsAlert(input: {
  path: string;
  method: "GET" | "POST";
  context: SmsAlertActionContext;
  phase: SmsAlertPhase;
  query?: Record<string, string | undefined>;
}): Promise<Record<string, unknown>> {
  const url = new URL(`${smsAlertApiBasePath}${input.path}`, smsAlertApiOrigin);
  url.searchParams.set("apikey", input.context.apiKey);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(input.context.signal, smsAlertRequestTimeoutMs);
  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, `sms_alert ${input.path} transport error: request timed out`);
    }
    throw new ProviderRequestError(
      504,
      error instanceof Error
        ? `sms_alert ${input.path} transport error: ${error.message}`
        : `sms_alert ${input.path} transport error: unknown transport error`,
    );
  } finally {
    timeout.cleanup();
  }

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, `sms_alert ${input.path} returned invalid JSON`);
  }

  const record = requireObject(parsed, "response");
  const status = readResponseString(record.status, "status").toLowerCase();
  if (status !== "success") {
    const message = extractErrorMessage(record);
    if (input.phase === "validate" && message.toLowerCase() === "invalid username/password.") {
      throw new ProviderRequestError(400, message);
    }
    throw new ProviderRequestError(502, message);
  }

  return record;
}

function extractErrorMessage(record: Record<string, unknown>): string {
  const description = record.description;
  if (typeof description === "string" && description.trim()) {
    return description;
  }
  const descriptionRecord = optionalRecord(description);
  const desc = optionalString(descriptionRecord?.desc);
  return desc ?? "sms_alert request failed";
}

function isDescriptionMessage(record: Record<string, unknown>, expected: string): boolean {
  const description = optionalRecord(record.description);
  return optionalString(description?.desc) === expected;
}

function requireDescriptionObject(record: Record<string, unknown>, context: string): Record<string, unknown> {
  const description = optionalRecord(record.description);
  if (!description) {
    throw new ProviderRequestError(502, `sms_alert ${context} returned invalid description`);
  }
  return description;
}

function requireDescriptionArray(record: Record<string, unknown>, context: string): unknown[] {
  if (!Array.isArray(record.description)) {
    throw new ProviderRequestError(502, `sms_alert ${context} returned invalid description`);
  }
  return record.description;
}

function requireObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `sms_alert returned invalid ${fieldName}`);
  }
  return record;
}

function readInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readResponseString(value: unknown, fieldName: string): string {
  return requiredString(
    value,
    fieldName,
    () => new ProviderRequestError(502, `sms_alert returned invalid ${fieldName}`),
  );
}

function readResponseInteger(value: unknown, fieldName: string): number {
  const result = optionalInteger(value);
  if (result === undefined) {
    throw new ProviderRequestError(502, `sms_alert returned invalid ${fieldName}`);
  }
  return result;
}

function readResponseBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `sms_alert returned invalid ${fieldName}`);
  }
  return value;
}

function hasOtpPlaceholderToken(value: string): boolean {
  let searchFrom = 0;
  while (searchFrom < value.length) {
    const tokenStart = value.indexOf("[otp", searchFrom);
    if (tokenStart === -1) {
      return false;
    }
    const tokenBodyStart = tokenStart + "[otp".length;
    const nextChar = value[tokenBodyStart];
    if (nextChar !== "]" && nextChar !== " " && nextChar !== "\t" && nextChar !== "\n") {
      searchFrom = tokenBodyStart;
      continue;
    }
    for (let index = tokenBodyStart; index < value.length; index += 1) {
      const char = value[index];
      if (char === "]") {
        return true;
      }
      if (char === "[") {
        break;
      }
    }
    searchFrom = tokenStart + "[otp".length;
  }
  return false;
}
