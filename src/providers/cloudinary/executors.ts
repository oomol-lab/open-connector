import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { CloudinaryContext } from "./runtime.ts";

import { Buffer } from "node:buffer";
import { requiredString } from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { cloudinaryActionHandlers, validateCloudinaryCredential } from "./runtime.ts";

const service = "cloudinary";
const cloudinaryApiBaseUrl = "https://api.cloudinary.com/v1_1";

export const executors: ProviderExecutors = defineProviderExecutors<CloudinaryContext>({
  service,
  handlers: cloudinaryActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<CloudinaryContext> {
    const credential = await context.getCredential(service);
    if (credential?.authType !== "api_key") {
      throw new ProviderRequestError(401, "Configure cloudinary API key credentials first.");
    }
    return {
      apiKey: credential.apiKey,
      apiSecret: requiredString(
        credential.values.apiSecret,
        "apiSecret",
        (message) => new ProviderRequestError(400, message),
      ),
      cloudName: requiredString(
        credential.values.cloudName ?? credential.metadata.cloudName,
        "cloudName",
        (message) => new ProviderRequestError(400, message),
      ),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await context.getCredential(service);
    if (credential?.authType !== "api_key") {
      throw new ProviderRequestError(401, "Configure cloudinary API key credentials first.");
    }
    const apiSecret = requiredString(
      credential.values.apiSecret,
      "apiSecret",
      (message) => new ProviderRequestError(400, message),
    );
    const cloudName = requiredString(
      credential.values.cloudName ?? credential.metadata.cloudName,
      "cloudName",
      (message) => new ProviderRequestError(400, message),
    );
    const url = createProviderProxyUrl(
      `${cloudinaryApiBaseUrl}/${encodeURIComponent(cloudName)}`,
      input.endpoint,
      input.query,
    );
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Basic ${Buffer.from(`${credential.apiKey}:${apiSecret}`).toString("base64")}`);
    headers.set("user-agent", providerUserAgent);

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
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateCloudinaryCredential(input.values, fetcher, signal);
  },
};
