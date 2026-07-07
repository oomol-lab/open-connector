import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { ClickhouseActionName } from "./actions.ts";
import type { ClickhouseActionContext } from "./runtime.ts";

import { Buffer } from "node:buffer";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireCustomCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { clickhouseActionHandlers, createClickhouseContext, validateClickhouseCredential } from "./runtime.ts";

const service = "clickhouse";

export const executors: ProviderExecutors = defineProviderExecutors<ClickhouseActionContext>({
  service,
  handlers: clickhouseActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ClickhouseActionContext> {
    const credential = await requireCustomCredential(context, service);
    return createClickhouseContext(credential.values, fetcher, context.signal);
  },
  fallbackMessage: "unknown clickhouse action",
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireCustomCredential(context, service);
    const clickhouseContext = createClickhouseContext(credential.values, fetch, context.signal);
    const url = createProviderProxyUrl(clickhouseContext.baseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set(
      "authorization",
      `Basic ${Buffer.from(`${clickhouseContext.username}:${clickhouseContext.password}`).toString("base64")}`,
    );
    headers.set("user-agent", providerUserAgent);
    if (!headers.has("content-type")) {
      headers.set("content-type", typeof input.body === "string" ? "text/plain; charset=utf-8" : "application/json");
    }

    const response = await fetch(url, {
      method: input.method,
      headers,
      body:
        input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body),
      signal: context.signal,
    });
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
  customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateClickhouseCredential(input.values, fetcher, signal);
  },
};

export type { ClickhouseActionName };
