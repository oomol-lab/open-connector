import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import {
  contentstackContentManagementActionHandlers,
  validateContentstackContentManagementCredential,
} from "./runtime.ts";

const service = "contentstack_content_management";
const contentstackContentManagementApiBaseUrl = "https://api.contentstack.io/v3";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: contentstackContentManagementActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      managementToken: credential.apiKey,
      stackApiKey: credential.values.stackApiKey,
      branch: credential.values.branch || credential.metadata.branch,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    // Reject an unusable credential before header normalization, keeping the 401/400 precedence.
    readContentstackStackApiKey((await requireApiKeyCredential(context, service)).values);
    return contentstackContentManagementApiBaseUrl;
  },
  auth: { type: "api_key_authorization", prefix: "" },
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    const branch = optionalString(credential.values.branch) ?? optionalString(credential.metadata.branch);
    headers.set("api_key", readContentstackStackApiKey(credential.values));
    if (branch) {
      headers.set("branch", branch);
    }
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  },
  skipDnsValidation: true,
});

function readContentstackStackApiKey(values: Record<string, string>): string {
  const stackApiKey = optionalString(values.stackApiKey);
  if (!stackApiKey) {
    throw new ProviderRequestError(400, "Contentstack Stack API Key is required");
  }
  return stackApiKey;
}

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateContentstackContentManagementCredential(
      {
        apiKey: input.apiKey,
        ...input.values,
      },
      fetcher,
      signal,
    );
  },
};
