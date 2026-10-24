import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import {
  providerResponseError,
  requiredInputString,
  requiredResponseRecord,
  providerUserAgent,
  runProviderRequest,
  isAbortLikeError,
  ProviderRequestError,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { sendblueActions } from "./actions.ts";
const baseUrl = "https://api.sendblue.com";
const contactsPath = "/api/v2/contacts";
interface SendblueRequest extends CredentialContext {
  endpoint: string;
  method: string;
  parameters: Record<string, unknown>;
}
async function request({
  endpoint,
  method,
  parameters,
  apiKey,
  apiSecret,
  fetcher,
  signal: parentSignal,
}: SendblueRequest) {
  const url = new URL(endpoint, baseUrl);
  if (method === "GET") {
    for (const [key, value] of Object.entries(parameters)) {
      if (value != null) url.searchParams.set(key, String(value));
    }
  }
  try {
    return await runProviderRequest({ label: "Sendblue", signal: parentSignal }, async (signal) => {
      const response = await fetcher(url, {
        method,
        signal,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": providerUserAgent,
          "sb-api-key-id": apiKey,
          "sb-api-secret-key": apiSecret,
        },
        body: method === "GET" || Object.keys(parameters).length === 0 ? undefined : JSON.stringify(parameters),
      });
      let payload: unknown = undefined;
      try {
        payload = await response.json();
      } catch (error) {
        if (isAbortLikeError(error)) throw error;
        if (response.ok) throw providerResponseError("Sendblue returned malformed JSON");
      }
      const record = optionalRecord(payload);
      if (!response.ok || record?.status === "ERROR") {
        throw new ProviderRequestError(
          response.ok ? 502 : response.status,
          optionalRawString(record?.message) ?? optionalRawString(record?.error) ?? `Sendblue HTTP ${response.status}`,
          withRetryAfterSeconds(response),
          response.status === 429 ? "rate_limited" : "provider_error",
        );
      }
      return payload;
    });
  } catch (error) {
    // Redact credentials from upstream and network errors.
    if (error instanceof Error)
      error.message = error.message.replaceAll(apiKey, "[REDACTED]").replaceAll(apiSecret, "[REDACTED]");
    throw error;
  }
}
const handlers = mapProviderActionHandlers(
  "sendblue",
  sendblueActions,
  (action) => async (values: Record<string, unknown>, context: CredentialContext) => {
    let endpoint = contactsPath;
    let method = "GET";
    let parameters = values;
    if (action.name === "list_contacts")
      parameters = { ...values, limit: values.limit ?? 100, offset: values.offset ?? 0 };
    if (action.name === "set_contact_opt_out") parameters = { ...values, opted_out: values.opted_out ?? true };
    switch (action.name) {
      case "count_contacts":
        endpoint += "/count";
        break;
      case "get_contact":
      case "delete_contact":
      case "update_contact": {
        const { number, ...body } = values;
        endpoint += `/${encodeURIComponent(String(number))}`;
        method = action.name === "update_contact" ? "PUT" : action.name === "delete_contact" ? "DELETE" : "GET";
        parameters = body;
        break;
      }
      case "create_contact":
        method = "POST";
        break;
      case "bulk_create_contacts":
        method = "POST";
        endpoint += "/bulk";
        break;
      case "bulk_delete_contacts":
        method = "DELETE";
        break;
      case "set_contact_opt_out":
        method = "POST";
        endpoint += "/opt-out";
        break;
    }
    const payload = await request({ ...context, endpoint, method, parameters });
    if (action.name === "list_contacts") return { contacts: requireContacts(payload) };
    return requiredResponseRecord(payload, "Sendblue response");
  },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = requiredResponseRecord(
      await request({
        endpoint: `${contactsPath}/count`,
        method: "GET",
        parameters: {},
        apiKey: requiredInputString(input.apiKey, "API Key"),
        apiSecret: requiredInputString(input.values.apiSecret, "apiSecret"),
        fetcher,
        signal,
      }),
      "Sendblue contact count",
    );
    if (typeof payload.count !== "number" || !Number.isFinite(payload.count)) {
      throw providerResponseError("Sendblue contact count is missing");
    }
    return {
      profile: { displayName: "Sendblue API Key" },
      grantedScopes: [],
      metadata: { validationEndpoint: `${contactsPath}/count` },
    };
  },
};
function requireContacts(payload: unknown): unknown[] {
  if (!Array.isArray(payload)) throw providerResponseError("Sendblue contacts is not an array");
  return payload;
}
interface CredentialContext extends ApiKeyProviderContext {
  apiSecret: string;
}
export const executors: ProviderExecutors = defineProviderExecutors({
  service: "sendblue",
  handlers,
  skipDnsValidation: true,
  async createContext(context, fetcher): Promise<CredentialContext> {
    const credential = await requireApiKeyCredential(context, "sendblue");
    return {
      apiKey: credential.apiKey,
      apiSecret: requiredInputString(credential.values.apiSecret, "apiSecret"),
      fetcher,
      signal: context.signal,
    };
  },
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "sendblue",
  baseUrl,
  auth: {
    type: "credential_headers",
    headers: [
      { name: "sb-api-key-id", source: { type: "api_key" } },
      { name: "sb-api-secret-key", source: { type: "credential_value", name: "apiSecret" } },
    ],
  },
  skipDnsValidation: true,
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, `Provider request failed with HTTP ${response.status}`),
      withRetryAfterSeconds(response),
      response.status === 429 ? "rate_limited" : "provider_error",
    );
  },
  customizeRequest({ headers }) {
    for (const [name, value] of Object.entries({
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    }))
      if (!headers.has(name)) headers.set(name, value);
  },
});
