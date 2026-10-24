import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { NpmContext } from "./runtime.ts";

import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { npmActionHandlers, npmRegistryBaseUrl, validateNpmCredential } from "./runtime.ts";

const service = "npm";

export const executors: ProviderExecutors = defineProviderExecutors<NpmContext>({
  service,
  handlers: npmActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<NpmContext> {
    const credential = await context.getCredential(service);
    if (!credential || credential.authType === "no_auth") {
      return context.signal ? { fetcher, signal: context.signal } : { fetcher };
    }
    if (credential.authType === "api_key") {
      return context.signal
        ? { apiKey: credential.apiKey, fetcher, signal: context.signal }
        : { apiKey: credential.apiKey, fetcher };
    }
    throw new ProviderRequestError(401, "Connect npm without authentication or configure an npm access token.");
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: npmRegistryBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await context.getCredential(service);
    if (credential?.authType === "api_key") {
      headers.set("authorization", `Bearer ${credential.apiKey}`);
    } else if (credential && credential.authType !== "no_auth") {
      throw new ProviderRequestError(401, "Connect npm without authentication or configure an npm access token.");
    }
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateNpmCredential(input.apiKey, fetcher, signal);
  },
};
