import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  contentstackContentManagementActionHandlers,
  validateContentstackContentManagementCredential,
} from "./runtime.ts";

const service = "contentstack_content_management";
const contentstackContentManagementApiBaseUrl = "https://api.contentstack.io/v3";
const contentstackContentManagementFetch = createProviderFetch({ skipDnsValidation: true });

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

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const stackApiKey = optionalString(credential.values.stackApiKey);
    if (!stackApiKey) {
      throw new ProviderRequestError(400, "Contentstack Stack API Key is required");
    }
    const url = createProviderProxyUrl(contentstackContentManagementApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    const branch = optionalString(credential.values.branch) ?? optionalString(credential.metadata.branch);
    headers.set("authorization", credential.apiKey);
    headers.set("api_key", stackApiKey);
    headers.set("user-agent", providerUserAgent);
    if (branch) {
      headers.set("branch", branch);
    }
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await contentstackContentManagementFetch(url, {
      method: input.method,
      headers,
      body:
        input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body),
      signal: context.signal,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

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
