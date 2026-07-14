import type {
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  defineApiKeyProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { expofpActionHandlers, expofpApiBaseUrl, validateExpofpCredential } from "./runtime.ts";

const service = "expofp";

const expofpFetch = createProviderFetch({ skipDnsValidation: true });

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, expofpActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(expofpApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("user-agent", providerUserAgent);
    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.method.toUpperCase() === "GET") {
      url.searchParams.set("token", credential.apiKey);
    } else {
      init.body = JSON.stringify(buildExpofpProxyBody(credential.apiKey, input.body));
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
    }

    const response = await expofpFetch(url, init);
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
  async apiKey(input, { fetcher, signal }) {
    return validateExpofpCredential(input.apiKey, fetcher, signal);
  },
};

function buildExpofpProxyBody(apiKey: string, bodyInput: unknown): Record<string, unknown> {
  if (bodyInput === undefined) {
    return { token: apiKey };
  }

  const body = optionalRecord(bodyInput);
  if (!body) {
    throw new ProviderRequestError(400, "body must be a JSON object for ExpoFP proxy requests");
  }
  const existingToken = optionalString(body.token);
  if (existingToken && existingToken !== apiKey) {
    throw new ProviderRequestError(400, "body.token must match the connected ExpoFP token");
  }
  return {
    ...body,
    token: apiKey,
  };
}
