import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  readProviderTextBody,
  ProviderRequestError,
  providerInputError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  isAbortLikeError,
} from "../provider-runtime.ts";
import { wbiztoolActions } from "./actions.ts";
const baseUrl = "https://wbiztool.com/api/v1/";
const headers = {
  accept: "application/json",
  "content-type": "application/json",
  "user-agent": providerUserAgent,
};
function parseClientId(value: string | undefined) {
  const id = value?.trim() ? Number(value) : NaN;
  if (!Number.isSafeInteger(id)) {
    throw new ProviderRequestError(400, "clientId must be a whole-number API Client ID", undefined, "invalid_input");
  }
  return id;
}
function validateSchedule(body: Record<string, unknown>) {
  const [day, month, year] = String(body.date).split("/").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year!, month! - 1, day!);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day) {
    throw new ProviderRequestError(
      400,
      "date must be a valid calendar date in dd/mm/yyyy format",
      undefined,
      "invalid_input",
    );
  }
  const timezone = optionalRawString(body.timezone);
  if (!timezone) return;
  const abbreviations: Record<string, string> = {
    IST: "Asia/Kolkata",
    UTC: "UTC",
    GMT: "GMT",
    EST: "US/Eastern",
    CST: "US/Central",
    MST: "US/Mountain",
    PST: "US/Pacific",
    CET: "Europe/Paris",
    CEST: "Europe/Paris",
    EET: "Europe/Athens",
    EEST: "Europe/Athens",
    JST: "Asia/Tokyo",
    AEST: "Australia/Sydney",
    AEDT: "Australia/Sydney",
  };
  const normalized = abbreviations[timezone] ?? timezone;
  try {
    new Intl.DateTimeFormat("en", { timeZone: normalized });
  } catch {
    throw new ProviderRequestError(
      400,
      "timezone must be an IANA timezone or a documented uppercase abbreviation",
      undefined,
      "invalid_input",
    );
  }
  body.timezone = normalized;
}
async function request(
  endpoint: string,
  body: Record<string, unknown>,
  apiKey: string,
  clientId: number,
  fetcher: typeof fetch,
  validating = false,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest(
    { signal: parentSignal, label: "Wbiztool", timeoutMs: endpoint === "send_msg/" ? 120000 : undefined },
    async (signal) => {
      const response = await fetcher(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers,
        signal,
        body: JSON.stringify({ ...body, client_id: clientId, api_key: apiKey }),
      });
      let payload: unknown;
      try {
        payload = await JSON.parse(await readProviderTextBody(response, "wbiztool response", undefined, signal));
      } catch (error) {
        if (error instanceof ProviderRequestError || isAbortLikeError(error)) throw error;
        throw new ProviderRequestError(
          response.ok ? 502 : response.status,
          "Wbiztool returned a non-JSON response",
          undefined,
          "provider_error",
        );
      }
      const result = requiredResponseRecord(payload, "Wbiztool response");
      const message = optionalRawString(result.message);
      const isStatus = endpoint.startsWith("message/status/");
      const validStatus = isStatus && result.status_text != null && message !== "Unknown message id";
      if (!response.ok || (isStatus ? !validStatus : result.status !== 1)) {
        const invalidKey = message === "Auth Error: invalid api key";
        throw new ProviderRequestError(
          invalidKey ? (validating ? 400 : 401) : response.ok ? 502 : response.status,
          `Wbiztool: ${message ?? `request failed (HTTP ${response.status})`}`,
          undefined,
          invalidKey ? (validating ? "invalid_input" : "authorization_failed") : "provider_error",
        );
      }
      return result;
    },
  );
}
export const executors: ProviderExecutors = defineProviderExecutors({
  service: "wbiztool",
  handlers: mapProviderActionHandlers(
    "wbiztool",
    wbiztoolActions,
    (_action, actionName) => async (input: Record<string, unknown>, context: WbiztoolContext) => {
      const body = input;
      let endpoint: string;
      switch (actionName) {
        case "send_message":
          endpoint = "send_msg/";
          body.msg_type ??= 0;
          break;
        case "schedule_message":
          endpoint = "schedule_msg/";
          validateSchedule(body);
          body.msg_type ??= 0;
          break;
        case "get_message_status":
          endpoint = `message/status/${body.msg_id}/`;
          delete body.msg_id;
          break;
        case "cancel_message":
          endpoint = "cancel_msg/";
          break;
        default:
          throw new ProviderRequestError(400, "Unknown Wbiztool action", undefined, "invalid_input");
      }
      return request(
        endpoint,
        body,
        context.apiKey,
        parseClientId(context.values?.clientId),
        context.fetcher,
        undefined,
        context.signal,
      );
    },
  ),
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, "wbiztool");
    return { apiKey: credential.apiKey, values: credential.values, fetcher, signal: context.signal };
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const clientId = parseClientId(input.values.clientId);
    const result = await request("me/", {}, requiredInputString(input.apiKey, "API Key"), clientId, fetcher, true);
    return {
      profile: { displayName: optionalRawString(result.name) ?? "Wbiztool API Key" },
      grantedScopes: [],
      metadata: { clientId },
    };
  },
};

interface WbiztoolContext extends ApiKeyProviderContext {
  values?: Record<string, string>;
}
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "wbiztool",
  baseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, method, body, setBody, headers: requestHeaders }) {
    if (method.toUpperCase() !== "POST")
      throw providerInputError("Wbiztool proxy supports JSON POST endpoints with body authentication");
    const data = body == null ? {} : optionalRecord(body);
    if (!data) throw providerInputError("Wbiztool proxy requires a JSON object body");
    const credential = await requireApiKeyCredential(context, "wbiztool");
    setBody({ ...data, api_key: credential.apiKey, client_id: parseClientId(credential.values?.clientId) });
    for (const [key, value] of Object.entries(headers)) requestHeaders.set(key, value);
  },
});
