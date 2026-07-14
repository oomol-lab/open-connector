import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import {
  createProviderFetch,
  createProviderProxyUrl,
  defineApiKeyProviderExecutors,
  normalizeProviderProxyEndpoint,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  certSpotterActionHandlers,
  certSpotterCtSearchApiBaseUrl,
  certSpotterMonitoringApiBaseUrl,
  validateCertSpotterCredential,
} from "./runtime.ts";

const service = "sslmate_cert_spotter_api";
const ctSearchProxyPrefix = "/ct-search";

const certSpotterFetch = createProviderFetch({ skipDnsValidation: true });

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, certSpotterActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const endpoint = normalizeProviderProxyEndpoint(input.endpoint);
    const target = resolveCertSpotterProxyTarget(endpoint);
    const url = createProviderProxyUrl(target.baseUrl, target.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Bearer ${credential.apiKey}`);
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

    const response = await certSpotterFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(
        response.status,
        text || `Cert Spotter request failed with HTTP ${response.status}`,
      );
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Cert Spotter request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateCertSpotterCredential({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
  },
};

function resolveCertSpotterProxyTarget(endpoint: string): { baseUrl: string; endpoint: string } {
  if (endpoint === ctSearchProxyPrefix) {
    return { baseUrl: certSpotterCtSearchApiBaseUrl, endpoint: "/" };
  }
  if (endpoint.startsWith(`${ctSearchProxyPrefix}/`)) {
    return {
      baseUrl: certSpotterCtSearchApiBaseUrl,
      endpoint: endpoint.slice(ctSearchProxyPrefix.length),
    };
  }
  return { baseUrl: certSpotterMonitoringApiBaseUrl, endpoint };
}
