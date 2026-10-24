import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { msg91ActionHandlers, msg91ApiBaseUrl, validateMsg91Credential } from "./runtime.ts";

const service = "msg91";
const headerAuthPathPrefixes = ["/api/v5/flow", "/api/v5/otp/verify"];

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, msg91ActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input) {
    return validateMsg91Credential(input.apiKey);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: msg91ApiBaseUrl,
  auth: { type: "none" },
  async customizeRequest({ context, endpoint, url, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
    if (headerAuthPathPrefixes.some((prefix) => endpoint.startsWith(prefix))) {
      headers.set("authkey", credential.apiKey);
    } else {
      url.searchParams.set("authkey", credential.apiKey);
    }
  },
});
