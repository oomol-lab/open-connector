import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineProviderExecutors, defineProviderProxy, requireCustomCredential } from "../provider-runtime.ts";
import {
  createPayPalActionContext,
  paypalActionHandlers,
  resolvePayPalApiBaseUrl,
  validatePayPalCredential,
} from "./runtime.ts";

type PayPalContext = Awaited<ReturnType<typeof createPayPalActionContext>>;

export const executors: ProviderExecutors = defineProviderExecutors({
  service: "paypal",
  handlers: paypalActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<PayPalContext> {
    const credential = await requireCustomCredential(context, "paypal");
    return createPayPalActionContext(credential.values, fetcher);
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "paypal",
  async baseUrl(context) {
    const credential = await requireCustomCredential(context, "paypal");
    return resolvePayPalApiBaseUrl(credential.values.environment ?? credential.metadata.environment);
  },
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers, fetcher }) {
    const credential = await requireCustomCredential(context, "paypal");
    const actionContext = await createPayPalActionContext(credential.values, fetcher);
    headers.set("authorization", `Bearer ${actionContext.accessToken}`);
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher }) {
    return validatePayPalCredential(input.values, fetcher);
  },
};
