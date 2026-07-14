import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { ClicksendActionContext } from "./runtime.ts";

import { Buffer } from "node:buffer";
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
import { clicksendActionHandlers, clicksendApiBaseUrl, validateClicksendCredential } from "./runtime.ts";

const service = "clicksend";
const clicksendFetch = createProviderFetch({ skipDnsValidation: true });

export const executors: ProviderExecutors = defineProviderExecutors<ClicksendActionContext>({
  service,
  handlers: clicksendActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ClicksendActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      username: requireClicksendUsername(credential.values),
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "unknown clicksend action",
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(clicksendApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set(
      "authorization",
      `Basic ${Buffer.from(`${requireClicksendUsername(credential.values)}:${credential.apiKey}`).toString("base64")}`,
    );
    headers.set("user-agent", providerUserAgent);
    if (input.body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }

    const response = await clicksendFetch(url, {
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
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateClicksendCredential(input.apiKey, input.values, fetcher, signal);
  },
};

function requireClicksendUsername(values: Record<string, string>): string {
  const username = values.username?.trim();
  if (!username) {
    throw new ProviderRequestError(400, "username is required");
  }
  return username;
}
