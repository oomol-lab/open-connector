import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { createHash } from "node:crypto";
import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineProviderExecutors, requireApiKeyCredential, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import {
  requiredInputString,
  requiredResponseRecord,
  ProviderRequestError,
  runProviderRequest,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { bainiuActions } from "./actions.ts";
interface CredentialContext extends ApiKeyProviderContext {
  values: Record<string, string>;
}
const baseUrl = "https://openapi.bainiudata.com";
const versions: Record<string, string> = {
  get_company: "A1",
  list_company_changes: "A2",
  list_company_branches: "A3",
  list_company_shareholders: "B1",
};
function signedHeaders(clientId: string, clientKey: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    accept: "application/json",
    CLIENTID: clientId,
    TIMESPAN: timestamp,
    Authorization: createHash("md5").update(`${clientId}-${timestamp}-${clientKey}`).digest("hex").toUpperCase(),
  };
}
const handlers = mapProviderActionHandlers(
  "bainiu",
  bainiuActions,
  (action) => async (dataInput: Record<string, unknown>, context: CredentialContext) => {
    const clientKey = context.apiKey;
    const clientId = requiredInputString(context.values?.clientId, "clientId");
    const data = dataInput;
    if (action.name === "search_companies") {
      const query = optionalRecord(data.data)!;
      data.data = {
        ...query,
        page_index: query.page_index == null ? undefined : String(query.page_index),
        page_size: query.page_size == null ? undefined : String(query.page_size),
      };
    }
    const form = new FormData();
    for (const [key, value] of Object.entries(data)) {
      if (value != null) form.set(key, key === "data" ? JSON.stringify(value) : String(value));
    }
    const version = versions[action.name];
    if (version) form.set("version", version);
    const route =
      action.name === "search_companies"
        ? "mohu"
        : action.name === "resolve_companies"
          ? "get_entid"
          : "company_detail";
    return runProviderRequest({ signal: context.signal, label: "Bainiu" }, async (signal) => {
      const response = await context.fetcher(`${baseUrl}/openapi/common/${route}/`, {
        method: "POST",
        headers: signedHeaders(clientId, clientKey),
        body: form,
        signal,
      });
      const text = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = undefined;
      }
      const body = optionalRecord(payload);
      const code = optionalRawString(body?.code);
      if (!response.ok || code !== "200") {
        const message = optionalRawString(body?.message) ?? `HTTP ${response.status}`;
        const detail = `${code ? `${code}: ` : ""}${message}`
          .split(clientKey)
          .join("[REDACTED]")
          .split(clientId)
          .join("[REDACTED]");
        throw new ProviderRequestError(
          response.ok ? 502 : response.status,
          `Bainiu request failed: ${detail}`,
          undefined,
          "provider_error",
        );
      }
      return requiredResponseRecord(payload, "Bainiu response");
    });
  },
);
export const executors: ProviderExecutors = defineProviderExecutors({
  service: "bainiu",
  handlers,
  skipDnsValidation: true,
  async createContext(context, fetcher): Promise<CredentialContext> {
    const credential = await requireApiKeyCredential(context, "bainiu");
    return { apiKey: credential.apiKey, values: credential.values, fetcher, signal: context.signal };
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    requiredInputString(input.apiKey, "API Key");
    requiredInputString(input.values.clientId, "clientId");
    return {
      profile: { displayName: "Bainiu API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationMode: "format_only" },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "bainiu",
  baseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  sensitiveHeaders: ["CLIENTID", "TIMESPAN"],
  allowedEndpoint(endpoint) {
    const path = new URL(endpoint, baseUrl).pathname;
    return path === "/openapi" || path.startsWith("/openapi/");
  },
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, "bainiu");
    for (const [name, value] of Object.entries(
      signedHeaders(requiredInputString(credential.values.clientId, "clientId"), credential.apiKey),
    ))
      headers.set(name, value);
  },
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, "Bainiu request failed"),
      withRetryAfterSeconds(response),
      "provider_error",
    );
  },
});
