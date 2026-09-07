import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { SevenShiftsContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { sevenShiftsActionHandlers, sevenShiftsApiBaseUrl, validateSevenShiftsCredential } from "./runtime.ts";

const service = "7_shifts";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: sevenShiftsApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ credential, headers }) {
    const companyGuid =
      credential?.authType === "api_key" ? optionalString(credential.values.companyGuid)?.trim() : undefined;
    if (companyGuid) headers.set("x-company-guid", companyGuid);
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const executors: ProviderExecutors = defineProviderExecutors<SevenShiftsContext>({
  service,
  handlers: sevenShiftsActionHandlers,
  async createContext(context, fetcher): Promise<SevenShiftsContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      companyGuid: optionalString(credential.values.companyGuid),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSevenShiftsCredential(input, fetcher, signal);
  },
};
