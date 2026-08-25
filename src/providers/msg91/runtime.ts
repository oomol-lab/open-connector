import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { jsonObject, queryParams } from "../../core/request.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const msg91ApiBaseUrl = "https://control.msg91.com";

const msg91RequestTimeoutMs = 15_000;

type AuthPlacement = "header" | "query";

interface Msg91RequestInput {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  authPlacement: AuthPlacement;
}

export const msg91ActionHandlers: ProviderActionHandlers<"msg91", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  send_flow_sms(input, context) {
    return sendFlowSms(input, context);
  },
  send_otp(input, context) {
    return sendOtp(input, context);
  },
  verify_otp(input, context) {
    return verifyOtp(input, context);
  },
  resend_otp(input, context) {
    return resendOtp(input, context);
  },
};

export async function validateMsg91Credential(apiKey: string): Promise<CredentialValidationResult> {
  if (!apiKey.trim()) {
    throw new ProviderRequestError(400, "apiKey is required.");
  }

  return {
    profile: {
      accountId: "msg91",
      displayName: "MSG91 Authkey",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: msg91ApiBaseUrl,
      validationMode: "local_only",
    },
  };
}

async function sendFlowSms(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  assertShortUrlExpiryAllowed(input);
  const payload = await requestMsg91Json(
    {
      method: "POST",
      path: "/api/v5/flow",
      authPlacement: "header",
      body: jsonObject({
        template_id: requireString(input.templateId, "templateId"),
        recipients: readFlowRecipients(input.recipients),
        short_url: booleanFlag(input.shortUrl),
        short_url_expiry: stringifyOptional(input.shortUrlExpirySeconds),
        realTimeResponse: booleanFlag(input.realTimeResponse),
      }),
    },
    context,
  );

  throwOnMsg91Error(payload, "send_flow_sms");
  const record = requireResponseObject(payload);
  const type = readResponseType(record);
  const message = readOptionalString(record.message);

  return {
    accepted: type === "success",
    type,
    message,
    requestId: readOptionalString(record.request_id) ?? message,
    raw: record,
  };
}

async function sendOtp(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  validateSendOtpInput(input);
  const payload = await requestMsg91Json(
    {
      method: "POST",
      path: "/api/v5/otp",
      authPlacement: "query",
      query: queryParams({
        template_id: requireString(input.templateId, "templateId"),
        mobile: requireString(input.mobile, "mobile"),
        otp: readOptionalString(input.otp) ?? undefined,
        otp_length: stringifyOptional(input.otpLength),
        otp_expiry: stringifyOptional(input.otpExpiryMinutes),
        userip: readOptionalString(input.userIp) ?? undefined,
        unicode: booleanFlag(input.unicode),
        invisible: booleanFlag(input.invisible),
        realTimeResponse: booleanFlag(input.realTimeResponse),
      }),
      body: readVariablesBody(input.variables),
    },
    context,
  );

  throwOnMsg91Error(payload, "send_otp");
  const record = requireResponseObject(payload);
  const type = readResponseType(record);

  return {
    sent: type === "success",
    type,
    message: readOptionalString(record.message),
    requestId: readOptionalString(record.request_id) ?? readOptionalString(record.requestId),
    raw: record,
  };
}

async function verifyOtp(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestMsg91Json(
    {
      method: "GET",
      path: "/api/v5/otp/verify",
      authPlacement: "header",
      query: {
        otp: requireString(input.otp, "otp"),
        mobile: requireString(input.mobile, "mobile"),
      },
    },
    context,
  );

  throwOnMsg91AuthError(payload);
  const record = requireResponseObject(payload);
  const type = readResponseType(record);
  const message = readOptionalString(record.message);

  return {
    verified: type === "success",
    type,
    message,
    code: readOptionalString(record.code),
    raw: record,
  };
}

async function resendOtp(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const retryType = requireString(input.retryType, "retryType");
  if (retryType !== "voice" && retryType !== "text") {
    throw new ProviderRequestError(400, "retryType must be voice or text");
  }

  const payload = await requestMsg91Json(
    {
      method: "GET",
      path: "/api/v5/otp/retry",
      authPlacement: "query",
      query: {
        retrytype: retryType,
        mobile: requireString(input.mobile, "mobile"),
      },
    },
    context,
  );

  throwOnMsg91Error(payload, "resend_otp");
  const record = requireResponseObject(payload);
  const type = readResponseType(record);

  return {
    sent: type === "success",
    type,
    message: readOptionalString(record.message),
    raw: record,
  };
}

async function requestMsg91Json(input: Msg91RequestInput, context: ApiKeyProviderContext): Promise<unknown> {
  const url = new URL(input.path, msg91ApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  if (input.authPlacement === "query") {
    url.searchParams.set("authkey", context.apiKey);
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (input.authPlacement === "header") {
    headers.authkey = context.apiKey;
  }
  if (input.method === "POST") {
    headers["content-type"] = "application/json";
  }

  const timeout = createProviderTimeout(context.signal, msg91RequestTimeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: input.method,
      headers,
      body: input.method === "POST" ? JSON.stringify(input.body ?? {}) : undefined,
      signal: timeout.signal,
    });
    payload = await readMsg91Payload(response);
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "msg91 request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `msg91 request failed: ${error.message}` : "msg91 request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createMsg91HttpError(response, payload);
  }

  return payload;
}

function readFlowRecipients(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, "recipients must be a non-empty array");
  }

  return value.map((item, index) => {
    const record = optionalRecord(item);
    if (!record) {
      throw new ProviderRequestError(400, `recipients[${index}] must be an object`);
    }

    return {
      mobiles: requireString(record.mobile, `recipients[${index}].mobile`),
      ...readVariablesBody(record.variables),
    };
  });
}

function readVariablesBody(value: unknown): Record<string, string> {
  const record = optionalRecord(value);
  if (!record) {
    return {};
  }

  const output: Record<string, string> = {};
  for (const [key, child] of Object.entries(record)) {
    const normalizedKey = key.trim();
    const variableValue = readTemplateVariableValue(child);
    if (normalizedKey && variableValue !== null) {
      output[normalizedKey] = variableValue;
    }
  }
  return output;
}

function readTemplateVariableValue(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  return value;
}

async function readMsg91Payload(response: Response): Promise<unknown> {
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

function createMsg91HttpError(response: Response, payload: unknown): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? response.statusText ?? "msg91 request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status || 500, message);
}

function throwOnMsg91Error(payload: unknown, actionName: string): void {
  throwOnMsg91AuthError(payload);
  const record = optionalRecord(payload);
  if (!record || readOptionalString(record.type) !== "error") {
    return;
  }

  const message = extractErrorMessage(record) ?? `msg91 ${actionName} request failed`;
  const lowerMessage = message.toLowerCase();
  if (
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("too many") ||
    lowerMessage.includes("maxed out") ||
    lowerMessage.includes("maximum retry") ||
    lowerMessage.includes("max retry")
  ) {
    throw new ProviderRequestError(429, message);
  }
  if (isInvalidInputMessage(lowerMessage)) {
    throw new ProviderRequestError(400, message);
  }
  throw new ProviderRequestError(502, message);
}

function throwOnMsg91AuthError(payload: unknown): void {
  const message = extractErrorMessage(payload);
  if (!message) {
    return;
  }

  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes("authkey") || lowerMessage.includes("auth key")) {
    throw new ProviderRequestError(401, message);
  }
}

function isInvalidInputMessage(message: string): boolean {
  return (
    message.includes("invalid") ||
    message.includes("missing") ||
    message.includes("empty") ||
    message.includes("required") ||
    message.includes("not numeric") ||
    message.includes("not found") ||
    message.includes("expired") ||
    message.includes("template")
  );
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.errors);
}

function requireResponseObject(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "msg91 returned an invalid JSON response");
  }
  return record;
}

function readResponseType(record: Record<string, unknown>): string {
  return readOptionalString(record.type) ?? "success";
}

function requireString(value: unknown, fieldName: string): string {
  const text = readOptionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readOptionalString(value: unknown): string | null {
  const text = optionalString(value);
  return text || null;
}

function stringifyOptional(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return String(value);
}

function booleanFlag(value: unknown): string | undefined {
  if (typeof value !== "boolean") {
    return undefined;
  }
  return value ? "1" : "0";
}

function assertShortUrlExpiryAllowed(input: Record<string, unknown>): void {
  if (input.shortUrlExpirySeconds !== undefined && input.shortUrl !== true) {
    throw new ProviderRequestError(400, "shortUrlExpirySeconds requires shortUrl to be true.");
  }
  if (input.shortUrlExpirySeconds !== undefined) {
    const value = input.shortUrlExpirySeconds;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      throw new ProviderRequestError(400, "shortUrlExpirySeconds must be a positive integer");
    }
  }
}

function validateSendOtpInput(input: Record<string, unknown>): void {
  validateOptionalIntegerRange(input.otpLength, "otpLength", 4, 9);
  validateOptionalIntegerRange(input.otpExpiryMinutes, "otpExpiryMinutes", 1, 10080);
}

function validateOptionalIntegerRange(value: unknown, fieldName: string, minimum: number, maximum: number): void {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer between ${minimum} and ${maximum}`);
  }
}
