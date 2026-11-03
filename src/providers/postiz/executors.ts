import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

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
const selfHostedApiSuffix = "api/public/v1";

const handlers = {
  list_integrations: async (input: Record<string, unknown>, context: PostizActionContext) =>
    readPostizCollection(
      await request(context, "/integrations", { query: { group: optionalString(input.group) } }),
      "integrations",
    ),
  list_posts: async (input: Record<string, unknown>, context: PostizActionContext) =>
    requiredResponseRecord(
      await request(context, "/posts", {
        query: {
          startDate: optionalString(input.startDate),
          endDate: optionalString(input.endDate),
          customer: optionalString(input.customer),
        },
      }),
      "Postiz posts",
    ),
  upload_from_url: async (input: Record<string, unknown>, context: PostizActionContext) =>
    requiredResponseRecord(
      await request(context, "/upload-from-url", { method: "POST", body: { url: input.url } }),
      "Postiz uploaded media",
    ),
  create_post: async (input: Record<string, unknown>, context: PostizActionContext) =>
    readPostizCollection(await request(context, "/posts", { method: "POST", body: input }), "created posts"),
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
    const result = optionalRecord(
      await request(
        {
          apiKey: input.apiKey,
          apiBaseUrl,
          // Re-guard the shared validator fetcher with the private-network
          // opt-in so a self-hosted instance on a private network validates
          // when the deployment allows it.
          fetcher: createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed }),
          signal,
        },
        "/is-connected",
      ),
    );
    if (result?.connected !== true) {
      throw new ProviderRequestError(502, "Postiz did not confirm the API key connection");
    }
    return {
      profile: { accountId: "api_key", displayName: "Postiz API Key" },
      grantedScopes: [],
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

async function request(
  context: Pick<PostizActionContext, "apiKey" | "apiBaseUrl" | "fetcher" | "signal">,
  path: string,
  options: RequestOptions = {},
): Promise<unknown> {
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

/**
 * Resolves the Postiz API base URL for a connection. Empty input targets the
 * Postiz cloud API; otherwise the self-hosted instance URL is validated,
 * embedded credentials are rejected, and query, hash, and trailing slashes are
 * removed. The `/api/public/v1` suffix is appended when missing so both the
 * bare instance root (https://postiz.example.com) and a reverse-proxy path
 * prefix (https://postiz.example.com/api) resolve to the public API, matching
 * the documented self-hosted base URL. Private/overlay targets are only
 * accepted when the deployment opts in through
 * `OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK`.
 */
function normalizePostizApiBaseUrl(value: unknown): string {
  const instanceUrl = optionalString(value);
  if (!instanceUrl) {
    return defaultPostizApiBaseUrl;
  }
  const url = assertPublicHttpUrl(instanceUrl, {
    fieldName: "baseUrl",
    createError: providerInputError,
    allowPrivateNetwork: isPrivateNetworkAccessAllowed(),
  });
  if (url.username || url.password) {
    throw providerInputError("baseUrl must not include credentials");
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/u, "");
  if (!url.pathname.endsWith("/public/v1")) {
    const base = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/u, "");
    const stem = base.endsWith("/api") ? base.slice(0, -4) : base;
    url.pathname = stem === "" ? `/${selfHostedApiSuffix}` : `${stem}/${selfHostedApiSuffix}`;
  }
  return url.toString().replace(/\/$/u, "");
}
