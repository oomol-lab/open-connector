import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderFetch } from "../provider-runtime.ts";

import { looseArray, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { kingdeeMethods } from "./actions.ts";

export interface KingdeeCredential {
  baseUrl: string;
  dataCenterId: string;
  username: string;
  applicationId: string;
  applicationSecret: string;
  localeId: number;
}
export interface KingdeeContext {
  credential: KingdeeCredential;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}
type ActionName = keyof typeof kingdeeMethods;
type Handler = (input: Record<string, unknown>, context: KingdeeContext) => Promise<unknown>;

export const handlers: ProviderActionHandlers<"kingdee", Handler> = {
  query_records: (input, context) => execute("query_records", input, context),
  get_record: (input, context) => execute("get_record", input, context),
  query_report: (input, context) => execute("query_report", input, context),
  save_record: (input, context) => execute("save_record", input, context),
  batch_save_records: (input, context) => execute("batch_save_records", input, context),
  draft_record: (input, context) => execute("draft_record", input, context),
  submit_records: (input, context) => execute("submit_records", input, context),
  audit_records: (input, context) => execute("audit_records", input, context),
  unaudit_records: (input, context) => execute("unaudit_records", input, context),
  delete_records: (input, context) => execute("delete_records", input, context),
  push_records: (input, context) => execute("push_records", input, context),
  allocate_records: (input, context) => execute("allocate_records", input, context),
};

export function readCredential(values: Record<string, string>): KingdeeCredential {
  const raw = requiredInputString(values.baseUrl, "baseUrl");
  const url = assertPublicHttpUrl(raw, {
    fieldName: "baseUrl",
    allowPrivateNetwork: isPrivateNetworkAccessAllowed(),
    createError: providerInputError,
  });
  if (url.protocol != "https:" || url.username || url.password || url.search || url.hash)
    throw providerInputError("baseUrl must use HTTPS without credentials, query or fragment");
  if (url.hostname == "open.kingdee.com" || url.hostname == "openapi.open.kingdee.com")
    throw providerInputError("baseUrl must point to your enterprise instance, not the documentation site");
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  const localeId = values.localeId?.trim() ? Number(values.localeId) : 2052;
  if (!Number.isInteger(localeId) || localeId <= 0) throw providerInputError("localeId must be a positive integer");
  return {
    baseUrl: url.toString(),
    dataCenterId: requiredInputString(values.dataCenterId, "dataCenterId"),
    username: requiredInputString(values.username, "username"),
    applicationId: requiredInputString(values.applicationId, "applicationId"),
    applicationSecret: requiredInputString(values.applicationSecret, "applicationSecret"),
    localeId,
  };
}

export async function validateCredential(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const credential = readCredential(values);
  await login(credential, fetcher, signal);
  return {
    profile: {
      accountId: `${credential.baseUrl}:${credential.dataCenterId}:${credential.username}`,
      displayName: `${credential.username} · ${new URL(credential.baseUrl).host}`,
    },
    grantedScopes: [],
    metadata: { baseUrl: credential.baseUrl },
  };
}

export async function login(
  credential: KingdeeCredential,
  fetcher: ProviderFetch,
  parentSignal?: AbortSignal,
): Promise<string> {
  return runProviderRequest({ label: "Kingdee login", signal: parentSignal }, async (signal) => {
    const response = await fetcher(
      new URL("Kingdee.BOS.WebApi.ServicesStub.AuthService.LoginByAppSecret.common.kdsvc", credential.baseUrl),
      {
        method: "POST",
        redirect: "manual",
        signal,
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          parameters: [
            credential.dataCenterId,
            credential.username,
            credential.applicationId,
            credential.applicationSecret,
            credential.localeId,
          ],
        }),
      },
    );
    const payload = requiredResponseRecord(
      await readResponse(response, [credential.applicationSecret]),
      "Kingdee login response",
    );
    const succeeded =
      typeof payload.IsSuccessByAPI == "boolean"
        ? payload.IsSuccessByAPI
        : (payload.LoginResultType ?? payload.loginResultType) == 1;
    if (!succeeded)
      throw providerResponseError(
        redact(businessMessage(payload) ?? "Kingdee login did not succeed", [credential.applicationSecret]),
      );
    const sessionId =
      optionalString(payload.KDSVCSessionId) ??
      response.headers.get("kdservice-sessionid") ??
      response.headers
        .getSetCookie()
        .map((cookie) => cookie.split(";")[0] ?? "")
        .find((cookie) => cookie.startsWith("kdservice-sessionid="))
        ?.slice("kdservice-sessionid=".length);
    if (!sessionId || sessionId.includes("\r") || sessionId.includes("\n"))
      throw providerResponseError("Kingdee login returned no usable session ID");
    return sessionId;
  });
}

export function isBusinessEndpoint(endpoint: string): boolean {
  let relative = endpoint;
  try {
    relative = decodeURIComponent(endpoint);
  } catch {
    return false;
  }
  while (relative.startsWith("/")) relative = relative.slice(1);
  return (
    relative.length > 0 &&
    !relative.includes("/") &&
    !relative.includes("\\") &&
    relative.endsWith(".common.kdsvc") &&
    !relative.toLowerCase().includes("authservice.")
  );
}

async function execute(action: ActionName, input: Record<string, unknown>, context: KingdeeContext) {
  const body = actionBody(action, input);
  const sessionId = await login(context.credential, context.fetcher, context.signal);
  return runProviderRequest({ label: "Kingdee action", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(
      new URL(
        `Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.${kingdeeMethods[action]}.common.kdsvc`,
        context.credential.baseUrl,
      ),
      {
        method: "POST",
        signal,
        redirect: "manual",
        headers: { "content-type": "application/json", "kdservice-sessionid": sessionId },
        body: JSON.stringify(body),
      },
    );
    const payload = await readResponse(response, [context.credential.applicationSecret, sessionId]);
    const fail = (value: unknown): never => {
      throw providerResponseError(
        redact(businessMessage(value) ?? "Kingdee business operation failed", [
          context.credential.applicationSecret,
          sessionId,
        ]),
      );
    };
    if (action == "query_records") {
      const failure = findQueryFailure(payload);
      if (failure) fail(failure);
      if (!Array.isArray(payload) || !payload.every(Array.isArray))
        throw providerResponseError("Kingdee query did not return rows");
      const data = requiredResponseRecord(input.data, "Kingdee query input");
      return {
        rows: payload,
        fieldKeys: requiredInputString(data.FieldKeys, "FieldKeys")
          .split(",")
          .map((key) => key.trim()),
      };
    }
    const envelope = requiredResponseRecord(payload, "Kingdee business response");
    const result = requiredResponseRecord(envelope.Result, "Kingdee Result");
    const status = optionalRecord(result.ResponseStatus) ?? result;
    const errors = looseArray(status.Errors);
    const successfulEntities = looseArray(status.SuccessEntitys);
    const partialSuccess = successfulEntities.length > 0 && (status.IsSuccess === false || errors.length > 0);
    if ((status.IsSuccess === false || errors.length > 0) && !partialSuccess) fail(status);
    if (action == "get_record") {
      if (status.IsSuccess !== true || result.Result === undefined) fail(status);
      return { record: result.Result, result };
    }
    if (action == "query_report") {
      if (status.IsSuccess !== true) fail(status);
      return { result };
    }
    if (status.IsSuccess !== true && !partialSuccess) fail(status);
    return {
      success: status.IsSuccess === true && errors.length == 0,
      partialSuccess,
      errors,
      successfulEntities,
      result,
    };
  });
}

function actionBody(action: ActionName, input: Record<string, unknown>) {
  const formId = requiredInputString(input.formId, "formId");
  const data = { ...requiredResponseRecord(input.data, "Kingdee business input") };
  if (action == "query_records") return { data: JSON.stringify({ ...data, FormId: formId }) };
  if (action == "get_record" && !data.Id && !data.Number)
    throw providerInputError("data.Id or data.Number is required");
  if (
    ["submit_records", "audit_records", "unaudit_records", "delete_records", "push_records"].includes(action) &&
    !data.Ids &&
    !looseArray(data.Numbers).length &&
    !(action == "push_records" && data.EntryIds)
  )
    throw providerInputError("Record IDs, numbers, or push entry IDs are required");
  if (action == "push_records" && (data.IsEnableDefaultRule ? !data.TargetFormId : !data.RuleId))
    throw providerInputError("Push requires RuleId, or IsEnableDefaultRule with TargetFormId");
  return { formid: formId, data: JSON.stringify(data) };
}
async function readResponse(response: Response, secrets: string[]): Promise<unknown> {
  const raw = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    throw new ProviderRequestError(
      response.ok ? 502 : response.status,
      raw.startsWith("response_error:") ? redact(raw, secrets) : "Kingdee returned a non-JSON response",
    );
  }
  if (!response.ok || (typeof payload == "string" && payload.startsWith("response_error:")))
    throw new ProviderRequestError(
      response.ok ? 502 : response.status,
      redact(businessMessage(payload) ?? `Kingdee HTTP ${response.status}`, secrets),
    );
  return payload;
}
function redact(message: string, secrets: string[]): string {
  for (const secret of secrets) if (secret) message = message.split(secret).join("[REDACTED]");
  return message;
}
function businessMessage(payload: unknown): string | undefined {
  if (typeof payload == "string") return payload;
  const value = optionalRecord(payload);
  if (!value) return undefined;
  const direct = optionalString(value.Message) ?? optionalString(value.message);
  const errors = looseArray(value.Errors)
    .map(businessMessage)
    .filter((item): item is string => Boolean(item));
  const message =
    direct ||
    (errors.length ? errors.join("; ") : undefined) ||
    businessMessage(value.ResponseStatus) ||
    businessMessage(value.Result);
  const code =
    optionalString(value.ErrorCode) ??
    optionalNumber(value.ErrorCode) ??
    optionalString(value.MessageCode) ??
    optionalNumber(value.MessageCode);
  return code === undefined ? message : `${code}: ${message ?? "Kingdee business operation failed"}`;
}
function findQueryFailure(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    for (const value of payload) {
      const failure = findQueryFailure(value);
      if (failure) return failure;
    }
    return undefined;
  }
  const value = optionalRecord(payload);
  if (!value) return undefined;
  if (value.IsSuccess === false) return value;
  return findQueryFailure(value.Result) ?? findQueryFailure(value.ResponseStatus);
}
