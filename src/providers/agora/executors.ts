import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { Buffer } from "node:buffer";
import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { agoraActionHandlers, agoraApiBaseUrl, readAgoraCustomerId, validateAgoraCredential } from "./runtime.ts";

const service = "agora";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: agoraActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      customerId: readAgoraCustomerId(credential.values),
      customerSecret: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    // Reject an unusable credential before header normalization, keeping the 401/400 precedence.
    readAgoraCustomerId((await requireApiKeyCredential(context, service)).values);
    return agoraApiBaseUrl;
  },
  auth: { type: "none" },
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    const customerId = readAgoraCustomerId(credential.values);
    headers.set("authorization", `Basic ${Buffer.from(`${customerId}:${credential.apiKey}`).toString("base64")}`);
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAgoraCredential(
      {
        customerId: input.values.customerId,
        customerSecret: input.apiKey,
      },
      fetcher,
      signal,
    );
  },
};
