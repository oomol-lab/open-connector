import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { createProviderFetch, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  sellerSpriteActionHandlers,
  sellerSpriteApiBaseUrl,
  toSellerSpriteExecutionError,
  validateSellerSpriteCredential,
} from "./runtime.ts";

const service = "sellersprite";
const sellerSpriteFetch = createProviderFetch({ skipDnsValidation: true });

export const executors: ProviderExecutors = defineSellerSpriteExecutors();

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: sellerSpriteApiBaseUrl,
  auth: { type: "api_key_header", name: "secret-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json;charset=UTF-8");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSellerSpriteCredential(input.apiKey, fetcher, signal);
  },
};

function defineSellerSpriteExecutors(): ProviderExecutors {
  const output: ProviderExecutors = {};
  for (const [name, handler] of Object.entries(sellerSpriteActionHandlers)) {
    output[`${service}.${name}`] = async (input, context: ExecutionContext) => {
      try {
        const credential = await requireApiKeyCredential(context, service);
        const providerContext: ApiKeyProviderContext = {
          apiKey: credential.apiKey,
          fetcher: sellerSpriteFetch,
          signal: context.signal,
        };
        if (context.transitFiles) {
          providerContext.transitFiles = context.transitFiles;
        }
        return {
          ok: true,
          output: await handler(input as Record<string, unknown>, providerContext),
        };
      } catch (error) {
        return toSellerSpriteExecutionError(error);
      }
    };
  }
  return output;
}
