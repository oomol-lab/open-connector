import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { CloudflareR2Context } from "./runtime.ts";

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
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  cloudflareR2ActionHandlers,
  cloudflareR2ApiBaseUrl,
  requestCloudflareR2Accounts,
  validateCloudflareR2Credential,
} from "./runtime.ts";

const service = "cloudflare_r2";
const cloudflareR2Fetch = createProviderFetch({ skipDnsValidation: true });

export const executors: ProviderExecutors = defineProviderExecutors<CloudflareR2Context>({
  service,
  handlers: cloudflareR2ActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<CloudflareR2Context> {
    const credential = await context.getCredential(service);
    if (credential?.authType === "custom_credential") {
      return {
        authType: "custom_credential",
        accessToken: requiredString(
          credential.values.apiKey,
          "apiKey",
          (message) => new ProviderRequestError(400, message),
        ),
        accountId: requiredString(
          credential.values.accountId,
          "accountId",
          (message) => new ProviderRequestError(400, message),
        ),
        metadata: credential.metadata,
        fetcher,
        signal: context.signal,
      };
    }
    if (credential?.authType === "oauth2") {
      return {
        authType: "oauth2",
        accessToken: credential.accessToken,
        accountId: optionalString(credential.metadata.accountId),
        metadata: credential.metadata,
        fetcher,
        signal: context.signal,
      };
    }
    throw new ProviderRequestError(401, "Configure cloudflare_r2 credentials first.");
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await context.getCredential(service);
    const accessToken =
      credential?.authType === "custom_credential"
        ? requiredString(credential.values.apiKey, "apiKey", (message) => new ProviderRequestError(400, message))
        : credential?.authType === "oauth2"
          ? credential.accessToken
          : undefined;
    if (!accessToken) {
      throw new ProviderRequestError(401, "Configure cloudflare_r2 credentials first.");
    }

    const url = createProviderProxyUrl(cloudflareR2ApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Bearer ${accessToken}`);
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

    const response = await cloudflareR2Fetch(url, init);
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status,
        await readProviderProxyErrorMessage(response, `Cloudflare R2 request failed with HTTP ${response.status}`),
      );
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Cloudflare R2 request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateCloudflareR2Credential(input.values, fetcher, signal);
  },
  async oauth2(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const result = await requestCloudflareR2Accounts(input.accessToken, fetcher, signal, { page: 1, perPage: 50 });
    if (result.accounts.length === 1) {
      const account = result.accounts[0]!;
      return {
        profile: {
          accountId: account.id,
          displayName: account.name ?? "Cloudflare R2",
        },
        grantedScopes: input.profile.grantedScopes,
        metadata: {
          accountId: account.id,
          accountName: account.name,
          accountType: account.type,
          validationEndpoint: "/accounts?page=1&per_page=50",
        },
      };
    }
    return {
      profile: {
        accountId: input.profile.accountId,
        displayName: "Cloudflare R2",
      },
      grantedScopes: input.profile.grantedScopes,
      metadata: {
        availableAccounts: result.accounts,
        validationEndpoint: "/accounts?page=1&per_page=50",
      },
    };
  },
};
