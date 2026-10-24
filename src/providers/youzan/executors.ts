import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { YouzanContext } from "./runtime.ts";

import { defineProviderExecutors, requireCustomCredential } from "../provider-executors.ts";
import {
  createProviderProxyUrl,
  normalizeProviderProxyHeaders,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
} from "../provider-proxy.ts";
import { createProviderFetch, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";
import {
  getYouzanToken,
  resolveYouzanCredential,
  toYouzanExecutionError,
  validateYouzanCredential,
  youzanActionHandlers,
  youzanApiBaseUrl,
} from "./runtime.ts";

const service = "youzan";

export const executors: ProviderExecutors = defineProviderExecutors<YouzanContext>({
  service,
  handlers: youzanActionHandlers,
  skipDnsValidation: true,
  mapError: toYouzanExecutionError,
  async createContext(context: ExecutionContext, fetcher): Promise<YouzanContext> {
    const credential = await requireCustomCredential(context, service);
    return {
      credential: resolveYouzanCredential(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

const proxyFetch = createProviderFetch({ skipDnsValidation: true });

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireCustomCredential(context, service);
    const token = await getYouzanToken(
      resolveYouzanCredential(credential.values),
      proxyFetch,
      "execute",
      context.signal,
    );
    const url = createProviderProxyUrl(youzanApiBaseUrl, input.endpoint, input.query);
    url.searchParams.set("access_token", token.accessToken);
    const headers = normalizeProviderProxyHeaders(input.headers);
    if (!headers.has("accept")) headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = { method: input.method, headers, signal: context.signal };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }
    const response = await proxyFetch(url, init);
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status,
        await readProviderProxyErrorMessage(response, `Youzan request failed with HTTP ${response.status}`),
      );
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    const result = toYouzanExecutionError(error);
    return {
      ok: false,
      error: result.error ?? { code: "provider_error", message: "Youzan request failed" },
    };
  }
};

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    return validateYouzanCredential(
      input.values,
      createProviderFetch({ fetch: fetcher, skipDnsValidation: true }),
      signal,
    );
  },
};
