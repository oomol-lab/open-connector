import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { AdyntelContext } from "./runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerInputError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { adyntelActionHandlers, adyntelApiBaseUrl, requireAdyntelEmail, validateAdyntelCredential } from "./runtime.ts";

const service = "adyntel";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: adyntelApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ body, headers, setBody, context }) {
    const credential = await requireApiKeyCredential(context, service);
    const email = optionalString(credential.values.email) ?? optionalString(credential.metadata.email);
    if (!email) throw providerInputError("adyntel proxy requires account email");
    const record = body == null ? {} : optionalRecord(body);
    if (!record) throw providerInputError("adyntel proxy auth requires a JSON object body");
    setBody({ ...record, api_key: credential.apiKey, email });
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  },
});

export const executors: ProviderExecutors = defineProviderExecutors<AdyntelContext>({
  service,
  handlers: adyntelActionHandlers,
  async createContext(context, fetcher): Promise<AdyntelContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      email: requireAdyntelEmail(optionalString(credential.values.email)),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateAdyntelCredential(input, { fetcher, signal });
  },
};
