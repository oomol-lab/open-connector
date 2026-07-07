import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { DocmosisActionContext } from "./runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { docmosisActionHandlers, resolveDocmosisApiBaseUrl, validateDocmosisCredential } from "./runtime.ts";

const service = "docmosis";

export const executors: ProviderExecutors = defineProviderExecutors<DocmosisActionContext>({
  service,
  handlers: docmosisActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<DocmosisActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: resolveDocmosisApiBaseUrl(credential.values.apiBaseUrl),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(
      resolveDocmosisApiBaseUrl(credential.values.apiBaseUrl),
      input.endpoint,
      input.query,
    );
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("user-agent", providerUserAgent);
    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.method.toUpperCase() === "GET") {
      url.searchParams.set("accessKey", credential.apiKey);
    } else {
      init.body = JSON.stringify(buildDocmosisProxyBody(credential.apiKey, input.body));
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
    }

    const response = await fetch(url, init);
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
    return validateDocmosisCredential(input, fetcher, signal);
  },
};

function buildDocmosisProxyBody(apiKey: string, bodyInput: unknown): Record<string, unknown> {
  if (bodyInput === undefined) {
    return { accessKey: apiKey };
  }

  const body = optionalRecord(bodyInput);
  if (!body) {
    throw new ProviderRequestError(400, "body must be a JSON object for Docmosis proxy requests");
  }
  const existingAccessKey = optionalString(body.accessKey);
  if (existingAccessKey && existingAccessKey !== apiKey) {
    throw new ProviderRequestError(400, "body.accessKey must match the connected Docmosis access key");
  }
  return {
    ...body,
    accessKey: apiKey,
  };
}
