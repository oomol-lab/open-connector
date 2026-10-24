import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { WangdianContext } from "./runtime.ts";

import { requireCustomCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import {
  createProviderProxyUrl,
  normalizeProviderProxyHeaders,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-proxy.ts";
import { createProviderFetch, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";
import {
  buildSignedWangdianBody,
  readWangdianCredential,
  readWangdianProxyParameters,
  toWangdianExecutionError,
  validateWangdianCredential,
  wangdianActionHandlers,
  wangdianApiBaseUrl,
} from "./runtime.ts";

const service = "wangdian";

export const executors: ProviderExecutors = defineProviderExecutors<WangdianContext>({
  service,
  handlers: wangdianActionHandlers,
  skipDnsValidation: true,
  mapError: toWangdianExecutionError,
  async createContext(context: ExecutionContext, fetcher): Promise<WangdianContext> {
    const credential = await requireCustomCredential(context, service);
    return {
      credential: readWangdianCredential(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

const proxyFetch = createProviderFetch({ skipDnsValidation: true });

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    if (input.method.toUpperCase() !== "POST") {
      throw new ProviderRequestError(400, "Wangdian proxy requests must use POST");
    }
    const credential = await requireCustomCredential(context, service);
    const url = createProviderProxyUrl(wangdianApiBaseUrl, input.endpoint, input.query);
    const parameters = readWangdianProxyParameters(input.body);
    for (const [name, value] of url.searchParams) parameters[name] = value;
    url.search = "";

    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("accept", "application/json");
    headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
    headers.set("user-agent", providerUserAgent);
    const response = await proxyFetch(url, {
      method: "POST",
      headers,
      body: buildSignedWangdianBody(parameters, readWangdianCredential(credential.values)),
      signal: context.signal,
    });
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status,
        await readProviderProxyErrorMessage(response, `Wangdian request failed with HTTP ${response.status}`),
      );
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Wangdian request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    return validateWangdianCredential(
      input.values,
      createProviderFetch({ fetch: fetcher, skipDnsValidation: true }),
      signal,
    );
  },
};
