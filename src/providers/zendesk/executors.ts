import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderOAuthRuntime } from "../../oauth/oauth-token.ts";
import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { PollDefinition } from "../../triggers/common/poll.ts";

import { optionalRecord } from "../../core/cast.ts";
import { requestTokenRevocation } from "../../oauth/oauth-token.ts";
import { requireApiKeyCredential, requireOAuthCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import {
  createProviderProxyUrl,
  normalizeProviderProxyHeaders,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-proxy.ts";
import {
  basicAuthorizationHeader,
  providerFetch,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
} from "../provider-runtime.ts";
import { validateZendeskCredential, zendeskActionHandlers, normalizeZendeskSubdomain } from "./runtime.ts";
import { zendeskEvent } from "./trigger-on-event.ts";

const service = "zendesk";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: zendeskActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await context.getCredential(service);
    if (credential?.authType === "oauth2") {
      const oauth = await requireOAuthCredential(context, service);
      return {
        authType: "oauth2" as const,
        accessToken: oauth.accessToken,
        baseUrl: resolveBaseUrl(oauth.metadata),
        subdomain: resolveSubdomain(oauth.metadata),
        fetcher,
        signal: context.signal,
      };
    }
    const apiKey = await requireApiKeyCredential(context, service);
    return {
      authType: "api_key" as const,
      apiKey: apiKey.apiKey,
      email: requireValue(apiKey.values.email ?? stringMetadata(apiKey.metadata.email), "Zendesk email is required"),
      baseUrl: resolveBaseUrl(apiKey.metadata, apiKey.values),
      subdomain: resolveSubdomain(apiKey.metadata, apiKey.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await context.getCredential(service);
    const url = createProviderProxyUrl(resolveProxyBaseUrl(credential), input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", buildProxyAuthorization(credential));
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

    const response = await providerFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `Zendesk request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Zendesk request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateZendeskCredential(input.apiKey, input.values, fetcher, signal);
  },
  oauth2(input, { fetcher, signal }) {
    return validateZendeskCredential(input.accessToken, input.metadata, fetcher, signal, "oauth2");
  },
};

function resolveProxyBaseUrl(credential: Awaited<ReturnType<ExecutionContext["getCredential"]>>): string {
  if (credential?.authType === "oauth2") {
    return resolveBaseUrl(credential.metadata);
  }
  if (credential?.authType === "api_key") {
    return resolveBaseUrl(credential.metadata, credential.values);
  }
  throw new ProviderRequestError(401, "Configure zendesk credentials first.");
}

function buildProxyAuthorization(credential: Awaited<ReturnType<ExecutionContext["getCredential"]>>): string {
  if (credential?.authType === "oauth2") {
    return `Bearer ${credential.accessToken}`;
  }
  if (credential?.authType === "api_key") {
    const email = requireValue(
      credential.values.email ?? stringMetadata(credential.metadata.email),
      "Zendesk email is required",
    );
    return basicAuthorizationHeader(`${email}/token:${credential.apiKey}`);
  }
  throw new ProviderRequestError(401, "Configure zendesk credentials first.");
}

function resolveBaseUrl(metadata: Record<string, unknown>, values?: Record<string, unknown>): string {
  const existing = stringMetadata(metadata.baseUrl);
  if (existing) return existing;
  return `https://${resolveSubdomain(metadata, values)}.zendesk.com`;
}

function resolveSubdomain(metadata: Record<string, unknown>, values?: Record<string, unknown>): string {
  return normalizeZendeskSubdomain(
    requireValue(
      stringMetadata(metadata.subdomain) ??
        nestedString(metadata.oauthClientExtra, "subdomain") ??
        stringMetadata(values?.subdomain),
      "Zendesk subdomain is required",
    ),
  );
}

function stringMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nestedString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return stringMetadata((value as Record<string, unknown>)[key]);
}

function requireValue(value: string | undefined, message: string): string {
  if (value) return value;
  throw new ProviderRequestError(400, message);
}

export const triggers: readonly (IntegrationDefinition | PollDefinition)[] = [zendeskEvent];

export const oauth: ProviderOAuthRuntime = {
  async revokeAccessToken(input): Promise<void> {
    const { accessToken, clientConfig, providerMetadata } = input;

    if (!accessToken.trim()) return;
    // Revoke only at the tenant that issued the stored credential.
    const subdomain = providerMetadata
      ? normalizeZendeskSubdomain(
          requiredInputString(
            providerMetadata.subdomain ?? optionalRecord(providerMetadata.oauthClientExtra)?.subdomain,
            "subdomain",
          ),
        )
      : normalizeZendeskSubdomain(requiredInputString(clientConfig.extra.subdomain, "subdomain"));
    await requestTokenRevocation({
      revocationUrl: `https://${subdomain}.zendesk.com/api/v2/oauth/tokens/current`,
      request: { method: "DELETE", headers: { authorization: `Bearer ${accessToken}` } },
      fetcher: input.fetcher,
      createError: input.createError,
    });
  },
};
