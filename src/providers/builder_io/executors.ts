import type {
  CredentialValidationResult,
  ProviderProxyExecutor,
  CredentialValidators,
  ProviderExecutors,
} from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { builderIoActionHandlers, builderIoWriteApiBaseUrl } from "./runtime.ts";

const service = "builder_io";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, builderIoActionHandlers);

const contentProxy = defineProviderProxy({
  service,
  baseUrl: "https://cdn.builder.io",
  auth: { type: "api_key_query", name: "apiKey" },
});

const writeProxy = defineProviderProxy({
  service,
  baseUrl: builderIoWriteApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const proxy: ProviderProxyExecutor = (input, context) => {
  const endpoint = typeof input.endpoint === "string" ? input.endpoint : "";
  const path = endpoint.split(/[?#]/u)[0] ?? "";
  return path === "/api/v3/content" || path.startsWith("/api/v3/content/")
    ? contentProxy(input, context)
    : writeProxy(input, context);
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input): Promise<CredentialValidationResult> {
    return {
      profile: {
        accountId: "builder_io_api_key",
        displayName: "Builder.io API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: builderIoWriteApiBaseUrl,
        validationStrategy: "local_required_key_check",
        keyPresent: input.apiKey.length > 0,
      },
    };
  },
};
