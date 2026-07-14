import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { FivetranContext } from "./runtime.ts";

import { Buffer } from "node:buffer";
import { requiredString } from "../../core/cast.ts";
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
import { fivetranActionHandlers, fivetranApiBaseUrl, validateFivetranCredential } from "./runtime.ts";

const service = "fivetran";
const fivetranFetch = createProviderFetch({ skipDnsValidation: true });

function readCredentialField(values: Record<string, string>, field: string): string {
  return requiredString(values[field], field, (message) => new ProviderRequestError(400, message));
}

export const executors: ProviderExecutors = defineProviderExecutors<FivetranContext>({
  service,
  handlers: fivetranActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<FivetranContext> {
    const credential = await requireCustomCredential(context, service);
    return {
      apiKey: readCredentialField(credential.values, "apiKey"),
      apiSecret: readCredentialField(credential.values, "apiSecret"),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context: ExecutionContext): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireCustomCredential(context, service);
    const apiKey = readCredentialField(credential.values, "apiKey");
    const apiSecret = readCredentialField(credential.values, "apiSecret");
    const url = createProviderProxyUrl(fivetranApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`);
    headers.set("user-agent", providerUserAgent);
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }

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

    const response = await fivetranFetch(url, init);
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status,
        await readProviderProxyErrorMessage(response, `Fivetran request failed with HTTP ${response.status}`),
      );
    }

    return {
      ok: true,
      response: await readProviderProxyResponse(response),
    };
  } catch (error) {
    return toProviderProxyError(error, "Fivetran request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    return validateFivetranCredential(
      {
        apiKey: readCredentialField(input.values, "apiKey"),
        apiSecret: readCredentialField(input.values, "apiSecret"),
      },
      fetcher,
      signal,
    );
  },
};
