import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

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
import { gorgiasActionHandlers, validateGorgiasCredential } from "./runtime.ts";

const service = "gorgias";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: gorgiasActionHandlers,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: resolveBaseUrl(credential.metadata, credential.values),
      email: resolveEmail(credential.metadata, credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(
      resolveBaseUrl(credential.metadata, credential.values),
      input.endpoint,
      input.query,
    );
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set(
      "authorization",
      buildBasicAuthorization(resolveEmail(credential.metadata, credential.values), credential.apiKey),
    );
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
      throw new ProviderRequestError(response.status, text || `Gorgias request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Gorgias request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateGorgiasCredential(
      {
        apiKey: input.apiKey,
        ...input.values,
      },
      fetcher,
      signal,
    );
  },
};

function resolveBaseUrl(metadata: Record<string, unknown>, values: Record<string, string>): string {
  const baseUrl = readString(metadata.baseUrl) ?? (values.domain ? buildGorgiasBaseUrl(values.domain) : undefined);
  if (!baseUrl) {
    throw new Error("gorgias provider metadata is missing baseUrl");
  }
  return trimTrailingSlash(baseUrl);
}

function resolveEmail(metadata: Record<string, unknown>, values: Record<string, string>): string {
  const email = readString(metadata.email) ?? readString(values.email);
  if (!email) {
    throw new Error("gorgias provider metadata is missing email");
  }
  return email;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function buildBasicAuthorization(email: string, apiKey: string): string {
  return `Basic ${Buffer.from(`${email}:${apiKey}`).toString("base64")}`;
}

function buildGorgiasBaseUrl(rawDomain: string): string {
  return `https://${normalizeGorgiasDomain(rawDomain)}.gorgias.com`;
}

function normalizeGorgiasDomain(rawDomain: string): string {
  let normalized = rawDomain.trim();
  if (normalized.startsWith("https://")) {
    normalized = normalized.slice("https://".length);
  } else if (normalized.startsWith("http://")) {
    normalized = normalized.slice("http://".length);
  }

  normalized = trimTrailingSlash(normalized).toLowerCase();
  if (normalized.endsWith(".gorgias.com")) {
    normalized = normalized.slice(0, -".gorgias.com".length);
  }
  return normalized;
}

function trimTrailingSlash(value: string): string {
  let normalized = value;
  while (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}
