import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerFetch,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  requireOAuthCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { validateZendeskCredential, zendeskActionHandlers } from "./runtime.ts";

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
    return `Basic ${btoa(`${email}/token:${credential.apiKey}`)}`;
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

function normalizeZendeskSubdomain(raw: string): string {
  let candidate = raw.trim();
  if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
    const url = new URL(candidate);
    candidate = url.hostname;
  }
  const lower = candidate.toLowerCase();
  const subdomain = lower.endsWith(".zendesk.com") ? lower.slice(0, -".zendesk.com".length) : lower;
  if (!subdomain || subdomain.includes(".") || subdomain.startsWith("-") || subdomain.endsWith("-")) {
    throw new ProviderRequestError(400, "Zendesk subdomain is invalid");
  }
  for (const character of subdomain) {
    const ok = (character >= "a" && character <= "z") || (character >= "0" && character <= "9") || character === "-";
    if (!ok) throw new ProviderRequestError(400, "Zendesk subdomain is invalid");
  }
  return subdomain;
}
