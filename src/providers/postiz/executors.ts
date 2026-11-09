import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderRuntimeHandler } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  createProviderFetch,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "postiz";
const defaultPostizApiBaseUrl = "https://api.postiz.com/public/v1";
const handlers: Record<string, ProviderRuntimeHandler<PostizActionContext>> = {
  async list_integrations(input, context) {
    const result = await request(context, "/integrations", { query: { group: optionalString(input.group) } });
    return readPostizCollection(result, "integrations");
  },
  async list_posts(input, context) {
    const result = await request(context, "/posts", {
      query: {
        startDate: optionalString(input.startDate),
        endDate: optionalString(input.endDate),
        customer: optionalString(input.customer),
      },
    });
    return requiredResponseRecord(result, "Postiz posts");
  },
  async upload_from_url(input, context) {
    const result = await request(context, "/upload-from-url", { method: "POST", body: { url: input.url } });
    return requiredResponseRecord(result, "Postiz uploaded media");
  },
  async create_post(input, context) {
    const result = await request(context, "/posts", { method: "POST", body: input });
    return readPostizCollection(result, "created posts");
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<PostizActionContext>({
  service,
  handlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<PostizActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: normalizePostizApiBaseUrl(credential.values.baseUrl),
      fetcher,
      signal: context.signal,
    };
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return normalizePostizApiBaseUrl(credential.values.baseUrl);
  },
  auth: { type: "api_key_header", name: "Authorization" },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiBaseUrl = normalizePostizApiBaseUrl(input.values.baseUrl);
    const context: PostizActionContext = {
      apiKey: input.apiKey,
      apiBaseUrl,
      fetcher: createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed }),
      signal,
    };
    const result = optionalRecord(await request(context, "/is-connected"));
    if (result?.connected !== true) {
      throw new ProviderRequestError(502, "Postiz did not confirm the API key connection");
    }
    return {
      profile: { accountId: "api_key", displayName: "Postiz API Key" },
      metadata: { apiBaseUrl },
    };
  },
};

interface PostizActionContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface RequestOptions {
  method?: "GET" | "POST";
  query?: Record<string, string | undefined>;
  body?: unknown;
}

async function request(context: PostizActionContext, path: string, options: RequestOptions = {}): Promise<unknown> {
  return runProviderRequest({ signal: context.signal, label: "Postiz" }, async (signal) => {
    const url = new URL(`${context.apiBaseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
    const headers = new Headers({
      accept: "application/json",
      authorization: context.apiKey,
      "user-agent": providerUserAgent,
    });
    if (options.body !== undefined) headers.set("content-type", "application/json");
    const response = await context.fetcher(url, {
      method: options.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "Postiz returned invalid JSON",
      invalidJsonFallback: response.ok ? undefined : (text) => text,
    });
    if (!response.ok) {
      const details = optionalRecord(payload);
      const message =
        optionalString(details?.message) ??
        optionalString(details?.error) ??
        optionalString(payload) ??
        `Postiz request failed with HTTP ${response.status}`;
      throw new ProviderRequestError(response.status, message, payload);
    }
    return payload;
  });
}

function readPostizCollection(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `Postiz returned invalid ${label}`);
  return value;
}

function normalizePostizApiBaseUrl(value: unknown): string {
  const instanceUrl = optionalString(value);
  if (!instanceUrl) {
    return defaultPostizApiBaseUrl;
  }
  const allowPrivateNetwork = isPrivateNetworkAccessAllowed();
  const url = assertPublicHttpUrl(instanceUrl, {
    fieldName: "baseUrl",
    createError: providerInputError,
    allowPrivateNetwork,
  });
  if (url.username || url.password) {
    throw providerInputError("baseUrl must not include credentials");
  }
  if (url.protocol === "http:" && !allowPrivateNetwork) {
    throw providerInputError("baseUrl must use https");
  }
  url.hash = "";
  url.search = "";
  let pathname = url.pathname.replace(/\/+$/u, "");
  if (!pathname.endsWith("/public/v1")) {
    if (pathname.endsWith("/api")) pathname = pathname.slice(0, -4);
    pathname += "/api/public/v1";
  }
  url.pathname = pathname;
  return url.toString();
}
