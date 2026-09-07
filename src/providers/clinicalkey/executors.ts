import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerInputError,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import {
  clinicalKeyActionHandlers,
  clinicalKeyApiBaseUrl,
  clinicalKeyPlatformCode,
  createClinicalKeyActionContext,
  validateClinicalKeyCredential,
} from "./runtime.ts";
const service = "clinicalkey";
export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: clinicalKeyActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await context.getCredential(service);
    if (!credential || credential.authType != "api_key")
      throw new ProviderRequestError(401, "Configure ClinicalKey credentials.");
    return createClinicalKeyActionContext({ apiKey: credential.apiKey, ...credential.values }, fetcher);
  },
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: clinicalKeyApiBaseUrl,
  auth: { type: "api_key_query", name: "api_key" },
  skipDnsValidation: true,
  async customizeRequest({ context, url, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    url.searchParams.set(
      "requestor_id",
      requiredString(credential.values.requestorId, "requestorId", providerInputError),
    );
    url.searchParams.set("customer_id", requiredString(credential.values.customerId, "customerId", providerInputError));
    url.searchParams.set("platform", clinicalKeyPlatformCode);
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateClinicalKeyCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
