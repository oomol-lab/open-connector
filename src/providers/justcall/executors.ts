import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { JustCallActionContext } from "./runtime.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { requiredInputString } from "../provider-runtime.ts";
import { justCallActionHandlers, justCallApiBaseUrl, validateJustCallCredential } from "./runtime.ts";

const service = "justcall";

export const executors: ProviderExecutors = defineProviderExecutors<JustCallActionContext>({
  service,
  handlers: justCallActionHandlers,
  skipDnsValidation: true,
  async createContext(context, fetcher): Promise<JustCallActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiSecret: requiredInputString(credential.values.apiSecret, "apiSecret"),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: justCallApiBaseUrl,
  auth: {
    type: "credential_headers",
    headers: [
      { name: "x-justcall-api-key", source: { type: "api_key" } },
      { name: "x-justcall-api-secret", source: { type: "credential_value", name: "apiSecret" } },
    ],
  },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("authorization", `${headers.get("x-justcall-api-key")}:${headers.get("x-justcall-api-secret")}`);
    headers.delete("x-justcall-api-key");
    headers.delete("x-justcall-api-secret");
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateJustCallCredential(
      { apiKey: input.apiKey, apiSecret: requiredInputString(input.values.apiSecret, "apiSecret") },
      fetcher,
      signal,
    );
  },
};
