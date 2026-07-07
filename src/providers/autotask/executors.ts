import type {
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { AutotaskActionContext } from "./runtime.ts";

import { optionalString, requiredString } from "../../core/cast.ts";
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
import { autotaskActionHandlers, resolveAutotaskApiBaseUrl, validateAutotaskCredential } from "./runtime.ts";

const service = "autotask";
const autotaskApiVersionPath = "v1.0";

export const executors: ProviderExecutors = defineProviderExecutors<AutotaskActionContext>({
  service,
  handlers: autotaskActionHandlers,
  async createContext(context, fetcher): Promise<AutotaskActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      username: credential.apiKey,
      secret: requiredCredentialValue(credential.values.secret, "secret"),
      integrationCode: requiredCredentialValue(credential.values.integrationCode, "integrationCode"),
      apiBaseUrl: resolveAutotaskApiBaseUrl(credential.metadata),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const secret = requiredCredentialValue(credential.values.secret, "secret");
    const integrationCode = requiredCredentialValue(credential.values.integrationCode, "integrationCode");
    const url = createProviderProxyUrl(
      `${resolveAutotaskApiBaseUrl(credential.metadata)}/${autotaskApiVersionPath}`,
      input.endpoint,
      input.query,
    );
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("accept", "application/json");
    headers.set("username", credential.apiKey);
    headers.set("secret", secret);
    headers.set("apiintegrationcode", integrationCode);
    headers.set("user-agent", providerUserAgent);
    if (input.body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }

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
    return validateAutotaskCredential(
      {
        username: input.apiKey,
        secret: requiredCredentialValue(input.values.secret, "secret"),
        integrationCode: requiredCredentialValue(input.values.integrationCode, "integrationCode"),
      },
      fetcher,
      signal,
    );
  },
};

function requiredCredentialValue(value: unknown, fieldName: string): string {
  return requiredString(optionalString(value), fieldName, (message) => new ProviderRequestError(400, message));
}
