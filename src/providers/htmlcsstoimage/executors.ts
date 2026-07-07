import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { HtmlCssToImageActionContext } from "./runtime.ts";

import { Buffer } from "node:buffer";
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
import {
  htmlCssToImageActionHandlers,
  htmlCssToImageApiBaseUrl,
  resolveHtmlCssToImageUserId,
  validateHtmlCssToImageCredential,
} from "./runtime.ts";

const service = "htmlcsstoimage";

export const executors: ProviderExecutors = defineProviderExecutors<HtmlCssToImageActionContext>({
  service,
  handlers: htmlCssToImageActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<HtmlCssToImageActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      credential: {
        apiKey: credential.apiKey,
        userId: resolveHtmlCssToImageUserId({
          values: credential.values,
          metadata: credential.metadata,
        }),
      },
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const userId = resolveHtmlCssToImageUserId({
      values: credential.values,
      metadata: credential.metadata,
    });
    const url = createProviderProxyUrl(htmlCssToImageApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Basic ${Buffer.from(`${userId}:${credential.apiKey}`).toString("base64")}`);
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

    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(
        response.status,
        text || `HTML/CSS to Image request failed with HTTP ${response.status}`,
      );
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "HTML/CSS to Image request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, options) {
    return validateHtmlCssToImageCredential(input, options);
  },
};
