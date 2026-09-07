import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { MapleBillingActionContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  buildMapleBillingApiBaseUrl,
  mapleBillingActionHandlers,
  normalizeMapleBillingCompanyId,
  validateMapleBillingCredential,
} from "./runtime.ts";

const service = "maple_billing";

export const executors: ProviderExecutors = defineProviderExecutors<MapleBillingActionContext>({
  service,
  handlers: mapleBillingActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<MapleBillingActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      companyId: String(credential.metadata.companyId ?? credential.values.companyId ?? ""),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return buildMapleBillingApiBaseUrl(normalizeMapleBillingCompanyId(credential.metadata.companyId));
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateMapleBillingCredential,
};
