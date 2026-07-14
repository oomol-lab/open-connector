import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { OksignActionContext } from "./runtime.ts";

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
  buildOksignAuthorizationHeader,
  oksignActionHandlers,
  oksignApiBaseUrl,
  validateOksignCredential,
} from "./runtime.ts";

const service = "oksign";
const oksignFetch = createProviderFetch({ skipDnsValidation: true });

export const executors: ProviderExecutors = defineProviderExecutors<OksignActionContext>({
  service,
  handlers: oksignActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<OksignActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      authorizationHeader: buildOksignAuthorizationHeader({
        accountNumber: credential.apiKey,
        authorizationToken: credential.values.authorizationToken,
        organizationalToken: credential.values.organizationalToken,
      }),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(oksignApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set(
      "x-oksign-authorization",
      buildOksignAuthorizationHeader({
        accountNumber: credential.apiKey,
        authorizationToken: credential.values.authorizationToken,
        organizationalToken: credential.values.organizationalToken,
      }),
    );
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await oksignFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `OKSign request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "OKSign request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateOksignCredential(
      {
        accountNumber: input.apiKey,
        authorizationToken: input.values.authorizationToken,
        organizationalToken: input.values.organizationalToken,
      },
      fetcher,
      signal,
    );
  },
};
