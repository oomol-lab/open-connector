import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { UploadcareContext } from "./runtime.ts";

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
  readRequiredUploadcareCredentialField,
  signUploadcareRequest,
  uploadcareActionHandlers,
  uploadcareApiBaseUrl,
  uploadcareJsonContentType,
  uploadcareRestAcceptHeader,
  validateUploadcareCredential,
} from "./runtime.ts";

const service = "uploadcare";

export const executors: ProviderExecutors = defineProviderExecutors<UploadcareContext>({
  service,
  handlers: uploadcareActionHandlers,
  async createContext(context, fetcher): Promise<UploadcareContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      publicKey: readRequiredUploadcareCredentialField(credential.values, "publicKey"),
      secretKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(uploadcareApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("accept", uploadcareRestAcceptHeader);
    if (!headers.has("content-type")) {
      headers.set("content-type", uploadcareJsonContentType);
    }
    headers.set("user-agent", providerUserAgent);

    const body =
      input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body);
    signUploadcareRequest({
      method: input.method,
      url,
      headers,
      body,
      publicKey: readRequiredUploadcareCredentialField(credential.values, "publicKey"),
      secretKey: credential.apiKey,
    });

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (body !== undefined) {
      init.body = body;
    }

    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `Uploadcare request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Uploadcare request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateUploadcareCredential({
      apiKey: input.apiKey,
      publicKey: readRequiredUploadcareCredentialField(input.values, "publicKey"),
      fetcher,
      signal,
    });
  },
};
