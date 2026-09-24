import type {
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { WaffoActionContext } from "./runtime.ts";

import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireCustomCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  applyWaffoRequestHeaders,
  mapWaffoExecutionError,
  readWaffoCredential,
  validateWaffoCredential,
  waffoActionHandlers,
  waffoApiBaseUrl,
} from "./runtime.ts";

const service = "waffo";
const waffoFetch = createProviderFetch({ skipDnsValidation: true });

export const executors: ProviderExecutors = defineProviderExecutors<WaffoActionContext>({
  service,
  handlers: waffoActionHandlers,
  skipDnsValidation: true,
  mapError: mapWaffoExecutionError,
  async createContext(context, fetcher) {
    const credential = await requireCustomCredential(context, service);
    return {
      credential: readWaffoCredential(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const storedCredential = await requireCustomCredential(context, service);
    const credential = readWaffoCredential(storedCredential.values);
    const url = createProviderProxyUrl(waffoApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    const signingBody = serializeProxyBody(input.body);
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    headers.set("user-agent", providerUserAgent);
    applyWaffoRequestHeaders({
      credential,
      method: input.method,
      path: url.pathname,
      body: signingBody,
      headers,
    });

    const response = await waffoFetch(url, {
      method: input.method,
      headers,
      body: input.method === "GET" || input.body == null ? undefined : signingBody,
      redirect: "manual",
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
    return toProviderProxyError(error, "Waffo proxy request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    return validateWaffoCredential(input.values, fetcher, signal);
  },
};

function serializeProxyBody(body: unknown): string {
  if (body == null) return "";
  return typeof body === "string" ? body : JSON.stringify(body);
}
