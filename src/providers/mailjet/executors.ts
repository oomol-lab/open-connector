import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { MailjetContext } from "./runtime.ts";

import { Buffer } from "node:buffer";
import { optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { mailjetActionHandlers, validateMailjetCredential } from "./runtime.ts";

const service = "mailjet";
const mailjetApiBaseUrl = "https://api.mailjet.com/v3/REST";
const mailjetFetch = createProviderFetch({ skipDnsValidation: true });

export const executors: ProviderExecutors = defineProviderExecutors<MailjetContext>({
  service,
  handlers: mailjetActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<MailjetContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiSecret: readStoredApiSecret(credential.values, credential.metadata),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const apiSecret = readStoredApiSecret(credential.values, credential.metadata);
    const url = createProviderProxyUrl(mailjetApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Basic ${Buffer.from(`${credential.apiKey}:${apiSecret}`).toString("base64")}`);
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

    const response = await mailjetFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `Mailjet request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Mailjet request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateMailjetCredential(input.apiKey, requireMailjetApiSecret(input.values), fetcher, signal);
  },
};

function requireMailjetApiSecret(values: Record<string, string>): string {
  return requiredString(values.apiSecret, "apiSecret", (message) => new ProviderRequestError(400, message));
}

function readStoredApiSecret(values: Record<string, string>, metadata: Record<string, unknown>): string {
  const apiSecret = optionalString(values.apiSecret) ?? optionalString(metadata.apiSecret);
  if (!apiSecret) {
    throw new ProviderRequestError(500, "Stored apiSecret is missing for Mailjet");
  }
  return apiSecret;
}
