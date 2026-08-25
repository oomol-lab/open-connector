import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { OnfleetActionContext } from "./runtime.ts";

import { Buffer } from "node:buffer";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerFetch,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { onfleetActionHandlers, validateOnfleetCredential } from "./runtime.ts";

const service = "onfleet";

export const executors: ProviderExecutors = defineProviderExecutors<OnfleetActionContext>({
  service,
  handlers: onfleetActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher): Promise<OnfleetActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return { apiKey: credential.apiKey, fetcher, signal: context.signal };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateOnfleetCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("accept", "application/json");
    headers.set("authorization", `Basic ${Buffer.from(`${credential.apiKey}:`).toString("base64")}`);
    headers.set("user-agent", providerUserAgent);
    if (input.body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }
    const response = await providerFetch(
      createProviderProxyUrl("https://onfleet.com/api/v2", input.endpoint, input.query),
      {
        method: input.method,
        headers,
        body:
          input.body === undefined
            ? undefined
            : typeof input.body === "string"
              ? input.body
              : JSON.stringify(input.body),
        signal: context.signal,
      },
    );
    if (!response.ok) {
      const message = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(
        response.status,
        message || `provider request failed with HTTP ${response.status}`,
      );
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Onfleet proxy request failed");
  }
};
