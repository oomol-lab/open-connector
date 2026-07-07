import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { BuildiumActionContext } from "./runtime.ts";

import { requiredString } from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { buildiumActionHandlers, buildiumApiBaseUrl, validateBuildiumCredential } from "./runtime.ts";

const service = "buildium";

export const executors: ProviderExecutors = defineProviderExecutors<BuildiumActionContext>({
  service,
  handlers: buildiumActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<BuildiumActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      clientId: readClientId(credential.values),
      clientSecret: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(buildiumApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("x-buildium-client-id", readClientId(credential.values));
    headers.set("x-buildium-client-secret", credential.apiKey);
    headers.set("user-agent", providerUserAgent);

    const response = await fetch(url, {
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
  apiKey(input, { fetcher, signal }) {
    return validateBuildiumCredential({
      clientId: readClientId(input.values),
      clientSecret: input.apiKey,
      fetcher,
      signal,
    });
  },
};

function readClientId(values: Record<string, string>): string {
  return requiredString(values.clientId, "clientId", (message) => new ProviderRequestError(400, message));
}
