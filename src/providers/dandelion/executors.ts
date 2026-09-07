import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerInputError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { dandelionActionHandlers, dandelionApiBaseUrl, validateDandelionApiKey } from "./runtime.ts";

const service = "dandelion";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, dandelionActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: dandelionApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ body, context, headers, method, setBody }) {
    if (method.toUpperCase() !== "POST") {
      throw providerInputError("Dandelion API proxy requests must use POST so the API token stays out of the URL");
    }
    if (body != null && typeof body !== "string") {
      throw providerInputError("Dandelion API proxy requests require a form-encoded string body");
    }
    const credential = await requireApiKeyCredential(context, service);
    const form = new URLSearchParams(body ?? "");
    form.set("token", credential.apiKey);
    setBody(form.toString());
    headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateDandelionApiKey(input.apiKey, fetcher);
  },
};
