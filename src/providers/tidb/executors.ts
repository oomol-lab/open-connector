import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import {
  createProviderFetch,
  defineProviderExecutors,
  normalizeProviderProxyEndpoint,
  normalizeProviderProxyHeaders,
  normalizeProviderProxyQuery,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireCustomCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { requestTiDBProxy, resolveTiDBProxyTarget, tidbActionHandlers, validateTiDBCredential } from "./runtime.ts";

const service = "tidb";

const tidbFetch = createProviderFetch({ skipDnsValidation: true });

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: tidbActionHandlers,
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireCustomCredential(context, service);
    return {
      publicKey: credential.values.publicKey,
      privateKey: credential.values.privateKey,
      fetcher,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireCustomCredential(context, service);
    const target = resolveTiDBProxyTarget(normalizeProviderProxyEndpoint(input.endpoint));
    const headers = normalizeProviderProxyHeaders(input.headers);

    let body: BodyInit | undefined;
    if (input.body !== undefined) {
      body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await requestTiDBProxy({
      ...target,
      method: input.method,
      headers,
      query: normalizeProviderProxyQuery(input.query),
      body,
      publicKey: credential.values.publicKey,
      privateKey: credential.values.privateKey,
      fetcher: tidbFetch,
      signal: context.signal,
    });

    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `tidb request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "tidb request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher }): ReturnType<typeof validateTiDBCredential> {
    return validateTiDBCredential(input.values, fetcher);
  },
};
