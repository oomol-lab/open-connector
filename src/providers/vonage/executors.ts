import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { Buffer } from "node:buffer";
import { requireCustomCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { createVonageContext, validateVonageCredential, vonageActionHandlers, vonageApiBaseUrl } from "./runtime.ts";

const service = "vonage";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: vonageActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireCustomCredential(context, service);
    return createVonageContext(credential.values, fetcher, context.signal);
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: vonageApiBaseUrl,
  auth: { type: "none" },
  async customizeRequest({ context, headers, fetcher }) {
    const credential = await requireCustomCredential(context, service);
    const vonage = createVonageContext(credential.values, fetcher, context.signal);
    headers.set("authorization", `Basic ${Buffer.from(`${vonage.apiKey}:${vonage.apiSecret}`).toString("base64")}`);
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    return validateVonageCredential(input.values, fetcher, signal);
  },
};
