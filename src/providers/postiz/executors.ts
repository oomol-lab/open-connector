import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "postiz";
const baseUrl = "https://api.postiz.com/public/v1";

const handlers: Record<string, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  list_integrations: async (input, context) =>
    readPostizCollection(
      await request(context, "/integrations", { query: { group: optionalString(input.group) } }),
      "integrations",
    ),
  list_posts: async (input, context) =>
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
  upload_from_url: async (input, context) =>
    requiredResponseRecord(
      await request(context, "/upload-from-url", { method: "POST", body: { url: input.url } }),
      "Postiz uploaded media",
    ),
  create_post: async (input, context) =>
    readPostizCollection(await request(context, "/posts", { method: "POST", body: input }), "created posts"),
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const result = optionalRecord(await request({ apiKey: input.apiKey, fetcher, signal }, "/is-connected"));
    if (result?.connected !== true) {
      throw new ProviderRequestError(502, "Postiz did not confirm the API key connection");
    }
    return {
      profile: { accountId: "api_key", displayName: "Postiz API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "api_key_header", name: "Authorization" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

interface RequestOptions {
  method?: "GET" | "POST";
  query?: Record<string, string | undefined>;
  body?: unknown;
}

async function request(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  path: string,
  options: RequestOptions = {},
): Promise<unknown> {
  return runProviderRequest({ signal: context.signal, label: "Postiz" }, async (signal) => {
    const url = new URL(`${baseUrl}${path}`);
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
