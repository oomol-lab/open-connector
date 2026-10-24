import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  buildSupportbeeBaseUrl,
  readSupportbeeCompany,
  supportbeeExecutors,
  validateSupportbeeCredential,
} from "./runtime.ts";

const service = "supportbee";

export const executors: ProviderExecutors = supportbeeExecutors;

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return buildSupportbeeBaseUrl(readSupportbeeCompany(credential.values.company));
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSupportbeeCredential(input, fetcher, signal);
  },
};
