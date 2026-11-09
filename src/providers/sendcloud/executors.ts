import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalRawString, optionalRecord, optionalString } from "../../core/cast.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError, requiredInputString } from "../provider-runtime.ts";
import { endpoints, executeSendcloudAction, requestSendcloud, sendcloudBaseUrl } from "./runtime.ts";
export const executors: ProviderExecutors = defineProviderExecutors({
  service: "sendcloud",
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, "sendcloud");
    return { apiKey: credential.apiKey, values: credential.values, fetcher };
  },
  handlers: Object.fromEntries(
    Object.keys(endpoints).map((actionName) => [
      actionName,
      (
        input: Record<string, unknown>,
        context: { apiKey: string; values: Record<string, string>; fetcher: typeof fetch },
      ) =>
        executeSendcloudAction({ actionName, input, apiKey: context.apiKey, values: context.values }, context.fetcher),
    ]),
  ),
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const apiUser = requiredInputString(input.values.apiUser, "apiUser");
    const payload = await requestSendcloud("userinfo/get", {}, { apiKey: input.apiKey, apiUser }, fetcher, "validate");
    return {
      profile: { accountId: apiUser, displayName: optionalString(optionalRecord(payload.info)?.userName) || apiUser },
      metadata: {},
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "sendcloud",
  baseUrl: sendcloudBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, url, method, headers, body, setBody }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    const credential = await requireApiKeyCredential(context, "sendcloud");
    const values = { apiUser: requiredInputString(credential.values.apiUser, "apiUser"), apiKey: credential.apiKey };
    url.searchParams.delete("apiKey");
    url.searchParams.delete("apiUser");
    if (!["POST", "PUT", "PATCH"].includes(method.toUpperCase())) {
      for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
      return;
    }
    const contentType = headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (typeof body === "string" && contentType && contentType !== "application/x-www-form-urlencoded") {
      throw new ProviderRequestError(400, "SendCloud string bodies must use application/x-www-form-urlencoded");
    }
    const form = new URLSearchParams(optionalRawString(body));
    if (body != null && typeof body !== "string") {
      const record = optionalRecord(body);
      if (!record) throw new ProviderRequestError(400, "SendCloud proxy requires a form-compatible body");
      for (const [key, value] of Object.entries(record)) {
        if (value != null) form.set(key, String(value));
      }
    }
    for (const [key, value] of Object.entries(values)) form.set(key, value);
    headers.set("content-type", "application/x-www-form-urlencoded");
    setBody(form.toString());
  },
});
