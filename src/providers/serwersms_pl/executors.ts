import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  readProviderTextBody,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { serwersmsPlActions } from "./actions.ts";
const apiBaseUrl = "https://api2.serwersms.pl/";
const endpoints: Record<string, string> = {
  send_sms: "messages/send_sms",
  get_delivery_reports: "messages/reports",
  cancel_scheduled_sms: "messages/delete",
  get_account_limits: "account/limits",
  list_senders: "senders/index",
  add_sender: "senders/add",
};
function request(
  endpoint: string,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ signal: parentSignal, label: "SerwerSMS.pl" }, async (signal) => {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(input)) {
      if (value == null) continue;
      if (Array.isArray(value)) {
        value.forEach((item, index) => body.append(`${key}[${index}]`, String(item)));
      } else {
        body.set(key, String(value));
      }
    }
    const response = await fetcher(new URL(`${endpoint}.json`, apiBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": providerUserAgent,
      },
      body,
      signal,
    });
    const text = await readProviderTextBody(response, "serwersms_pl response", undefined, signal);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        "SerwerSMS.pl returned invalid JSON",
        undefined,
        "provider_error",
      );
    }
    const record = requiredResponseRecord(payload, "SerwerSMS.pl");
    const error = optionalRecord(record.error);
    if (!response.ok || record.error != null || record.success === false) {
      const message = optionalRawString(error?.message) ?? optionalRawString(record.message) ?? "Request failed";
      const code = error?.code;
      const type = optionalRawString(error?.type);
      const detail = [code, type, message].filter((part) => part != null).join(": ");
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `SerwerSMS.pl: ${detail}`,
        undefined,
        "provider_error",
      );
    }
    return record;
  });
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "serwersms_pl",
  mapProviderActionHandlers(
    "serwersms_pl",
    serwersmsPlActions,
    (_action, actionName) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
      const values = input;
      if (actionName === "send_sms" && values.details === undefined) values.details = true;
      if (actionName === "get_account_limits" && values.show_type === undefined) values.show_type = true;
      return request(endpoints[actionName], values, context.apiKey, context.fetcher, context.signal);
    },
  ),
  { skipDnsValidation: true },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    await request("account/limits", { show_type: true }, requiredInputString(input.apiKey, "API Key"), fetcher);
    return {
      profile: { displayName: "SerwerSMS.pl API Token" },
      grantedScopes: [],
      metadata: { apiBaseUrl },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "serwersms_pl",
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [key, value] of Object.entries({ accept: "application/json" }))
      if (!headers.has(key)) headers.set(key, value);
  },
});
