import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { PrintavoActionContext } from "./runtime.ts";

import { requiredString } from "../../core/cast.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { printavoActionHandlers, printavoApiBaseUrl, validatePrintavoCredential } from "./runtime.ts";

const service = "printavo";

export const executors: ProviderExecutors = defineProviderExecutors<PrintavoActionContext>({
  service,
  handlers: printavoActionHandlers,
  skipDnsValidation: true,
  async createContext(context, fetcher): Promise<PrintavoActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      token: credential.apiKey,
      email: requiredString(credential.values.email, "email", (message) => new ProviderRequestError(400, message)),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: printavoApiBaseUrl,
  auth: { type: "api_key_header", name: "token" },
  skipDnsValidation: true,
  customizeRequest({ headers, credential }) {
    if (credential?.authType !== "api_key") {
      throw new ProviderRequestError(401, "Configure printavo API key credentials first.");
    }
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    headers.set(
      "email",
      requiredString(credential.values.email, "email", (message) => new ProviderRequestError(400, message)),
    );
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validatePrintavoCredential({
      token: input.apiKey,
      email: requiredString(input.values.email, "email", (message) => new ProviderRequestError(400, message)),
      fetcher,
      signal,
    });
  },
};
