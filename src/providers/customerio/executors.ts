import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { CustomerioCredentialContext } from "./runtime.ts";

import { Buffer } from "node:buffer";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerFetch,
  requireCustomCredential,
} from "../provider-runtime.ts";
import {
  customerioActionHandlers,
  resolveCustomerioCredentialContext,
  validateCustomerioCredential,
} from "./runtime.ts";

const service = "customerio";

export const executors: ProviderExecutors = defineProviderExecutors<CustomerioCredentialContext>({
  service,
  handlers: customerioActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<CustomerioCredentialContext> {
    const credential = await requireCustomCredential(context, service);
    return resolveCustomerioCredentialContext(credential.values, fetcher, context.signal, credential.metadata);
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => (await resolveCustomerioProxyContext(context)).apiBaseUrl,
  auth: { type: "none" },
  async customizeRequest({ context, headers }) {
    const customerioContext = await resolveCustomerioProxyContext(context);
    headers.set(
      "authorization",
      `Basic ${Buffer.from(`${customerioContext.siteId}:${customerioContext.apiKey}`).toString("base64")}`,
    );
  },
});

async function resolveCustomerioProxyContext(context: ExecutionContext): Promise<CustomerioCredentialContext> {
  const credential = await requireCustomCredential(context, service);
  return resolveCustomerioCredentialContext(credential.values, providerFetch, context.signal, credential.metadata);
}

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    return validateCustomerioCredential(input.values, fetcher, signal);
  },
};
