import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  buildReferralRockAuthorization,
  referralRockActionHandlers,
  referralRockApiBaseUrl,
  validateReferralRockCredential,
} from "./runtime.ts";

const service = "referralrock";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: referralRockActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    const privateKey = credential.values.privateKey?.trim();
    if (!privateKey) throw new ProviderRequestError(400, "Referral Rock private API key is missing");
    return { publicKey: credential.apiKey, privateKey, fetcher, signal: context.signal };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: referralRockApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    const privateKey = credential.values.privateKey?.trim();
    if (!privateKey) throw new ProviderRequestError(400, "Referral Rock private API key is missing");
    headers.set("authorization", buildReferralRockAuthorization(credential.apiKey, privateKey));
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    const privateKey = input.values.privateKey?.trim();
    if (!privateKey) throw new ProviderRequestError(400, "Referral Rock private API key is required");
    return validateReferralRockCredential({ publicKey: input.apiKey, privateKey, fetcher, signal });
  },
};
