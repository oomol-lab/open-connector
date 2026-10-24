import type {
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { TextmagicActionContext } from "./runtime.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import {
  createProviderProxyUrl,
  normalizeProviderProxyHeaders,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-proxy.ts";
import { providerFetch, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";
import {
  requireTextmagicUsername,
  textmagicActionHandlers,
  textmagicApiBaseUrl,
  textmagicAuthorization,
  validateTextmagicCredential,
} from "./runtime.ts";

const service = "textmagic";

export const executors: ProviderExecutors = defineProviderExecutors<TextmagicActionContext>({
  service,
  handlers: textmagicActionHandlers,
  skipDnsValidation: true,
  async createContext(context, fetcher): Promise<TextmagicActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      username: requireTextmagicUsername(credential.values.username),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const username = requireTextmagicUsername(credential.values.username);
    const url = createProviderProxyUrl(textmagicApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("accept", "application/json");
    headers.set("authorization", textmagicAuthorization(username, credential.apiKey));
    headers.set("user-agent", providerUserAgent);
    if (input.body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }

    const response = await providerFetch(url, {
      method: input.method,
      headers,
      body:
        input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body),
      signal: context.signal,
    });
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status,
        await readProviderProxyErrorMessage(response, `provider request failed with HTTP ${response.status}`),
      );
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTextmagicCredential(
      {
        apiKey: input.apiKey,
        username: requireTextmagicUsername(input.values.username),
      },
      fetcher,
      signal,
    );
  },
};
