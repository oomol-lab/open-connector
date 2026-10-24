import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import {
  providerInputError,
  requiredInputString,
  requiredResponseRecord,
  providerUserAgent,
  runProviderRequest,
  ProviderRequestError,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { keyzyActions } from "./actions.ts";
const baseUrl = "https://api.keyzy.io/v2";
interface LicenseEndpoint {
  method: string;
  path: string;
}
const endpoints: Record<string, LicenseEndpoint> = {
  register_license: { method: "POST", path: "/licenses/register" },
  get_license: { method: "GET", path: "/licenses/show-license" },
  update_license_sku: { method: "POST", path: "/licenses/update-sku" },
  update_license_time: { method: "POST", path: "/licenses/update-time" },
  delete_license: { method: "DELETE", path: "/licenses/destroy-serial" },
};
const defaultHeaders = {
  accept: "application/json",
  "content-type": "application/json",
  "user-agent": providerUserAgent,
};
const handlers = mapProviderActionHandlers(
  "keyzy",
  keyzyActions,
  (action) => async (values: Record<string, unknown>, context: CredentialContext) => {
    const { apiKey, appId } = context;
    const endpoint = endpoints[action.name]!;
    const url = new URL(`${baseUrl}${endpoint.path}`);
    let body: string | undefined = undefined;
    if (action.name === "get_license") {
      const serial = requiredInputString(values.serial, "serial");
      if (serial === "." || serial === "..") {
        throw providerInputError("serial must not be a dot path segment");
      }
      url.pathname += `/${encodeURIComponent(serial)}`;
      url.searchParams.set("app_id", appId);
      url.searchParams.set("api_key", apiKey);
    } else {
      body = JSON.stringify({ ...values, app_id: appId, api_key: apiKey });
    }
    return runProviderRequest({ label: "KEYZY", signal: context.signal }, async (signal) => {
      const response = await context.fetcher(url, {
        method: endpoint.method,
        headers: defaultHeaders,
        body,
        signal,
      });
      const text = await response.text();
      let payload: unknown = undefined;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new ProviderRequestError(
          response.ok ? 502 : response.status,
          "KEYZY returned a non-JSON response",
          undefined,
          "provider_error",
        );
      }
      const record = requiredResponseRecord(payload, "KEYZY response");
      const error = optionalRecord(record.error);
      if (!response.ok || error) {
        const message =
          optionalRawString(error?.message) ??
          (optionalRecord(error?.message) ? JSON.stringify(error?.message) : undefined) ??
          optionalRawString(record.message) ??
          "KEYZY request failed";
        throw new ProviderRequestError(response.ok ? 502 : response.status, message, undefined, "provider_error");
      }
      return record;
    });
  },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    requiredInputString(input.apiKey, "apiKey");
    requiredInputString(input.values.appId, "appId");
    return {
      profile: { displayName: "KEYZY API Key" },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: baseUrl,
        validationMode: "local_non_empty_fields",
        validationReason: "No documented non-resource authentication endpoint",
      },
    };
  },
};
interface CredentialContext extends ApiKeyProviderContext {
  appId: string;
}
export const executors: ProviderExecutors = defineProviderExecutors({
  service: "keyzy",
  handlers,
  skipDnsValidation: true,
  async createContext(context, fetcher): Promise<CredentialContext> {
    const credential = await requireApiKeyCredential(context, "keyzy");
    return {
      apiKey: requiredInputString(credential.apiKey, "apiKey"),
      appId: requiredInputString(credential.values.appId, "appId"),
      fetcher,
      signal: context.signal,
    };
  },
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "keyzy",
  baseUrl,
  auth: { type: "api_key_query_or_json_body", name: "api_key", bodyMethods: ["POST", "PUT", "PATCH", "DELETE"] },
  skipDnsValidation: true,
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, `Provider request failed with HTTP ${response.status}`),
      withRetryAfterSeconds(response),
      response.status === 429 ? "rate_limited" : "provider_error",
    );
  },
  customizeRequest({ headers, credential, method, url, body, setBody }) {
    for (const [name, value] of Object.entries(defaultHeaders)) if (!headers.has(name)) headers.set(name, value);
    const appId = requiredInputString(
      credential && "values" in credential ? credential.values.appId : undefined,
      "appId",
    );
    if (method === "GET" || method === "HEAD") url.searchParams.set("app_id", appId);
    else {
      const record = optionalRecord(body);
      if (body != null && !record) throw providerInputError("KEYZY proxy requires a JSON object body");
      url.searchParams.delete("app_id");
      url.searchParams.delete("api_key");
      setBody({ ...record, app_id: appId });
    }
  },
});
