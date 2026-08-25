import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { defineProviderExecutors, requireCustomCredential } from "../provider-runtime.ts";
import { createPayPalActionContext, paypalActionHandlers, validatePayPalCredential } from "./runtime.ts";

type PayPalContext = Awaited<ReturnType<typeof createPayPalActionContext>>;

export const executors: ProviderExecutors = defineProviderExecutors({
  service: "paypal",
  handlers: paypalActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<PayPalContext> {
    const credential = await requireCustomCredential(context, "paypal");
    return createPayPalActionContext(credential.values, fetcher);
  },
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher }) {
    return validatePayPalCredential(input.values, fetcher);
  },
};
