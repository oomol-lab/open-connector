import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ClicksendActionContext } from "./runtime.ts";

import { Buffer } from "node:buffer";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { clicksendActionHandlers, clicksendApiBaseUrl, validateClicksendCredential } from "./runtime.ts";

const service = "clicksend";

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

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    // Reject an unusable credential before header normalization, keeping the 401/400 precedence.
    await requireApiKeyCredential(context, service);
    return clicksendApiBaseUrl;
  },
  auth: { type: "none" },
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    headers.set(
      "authorization",
      `Basic ${Buffer.from(`${requireClicksendUsername(credential.values)}:${credential.apiKey}`).toString("base64")}`,
    );
  },
  skipDnsValidation: true,
});

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
