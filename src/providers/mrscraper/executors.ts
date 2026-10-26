import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  ProviderRequestError,
  providerResponseError,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { mrscraperActions } from "./actions.ts";

const baseUrl = "https://api.mrscraper.com/";
const bodyKeys = new Set([
  "url",
  "prompt",
  "maxPages",
  "maxDepth",
  "limit",
  "includePatterns",
  "excludePatterns",
  "tokenCap",
  "maxRetries",
]);

async function readResponse(response: Response, html = false): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (response.ok && html && !response.headers.get("content-type")?.includes("application/json")) return { html: text };
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new ProviderRequestError(
      response.ok ? 502 : response.status,
      `MrScraper returned ${response.ok ? "invalid JSON" : `HTTP ${response.status}`}`,
      undefined,
      "provider_error",
    );
  }
  const record = requiredResponseRecord(payload, "MrScraper");
  const error = optionalString(record.error);
  if (!response.ok || (record.error != null && record.error !== "" && record.error !== false)) {
    throw new ProviderRequestError(
      response.ok ? 502 : response.status,
      optionalString(record.message) ?? error ?? `MrScraper request failed with HTTP ${response.status}`,
      undefined,
      "provider_error",
    );
  }
  if (html) throw providerResponseError("MrScraper returned JSON instead of HTML");
  return record;
}

async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const html = actionName === "fetch_html";
  const url = new URL(baseUrl);
  const apiKey = context.apiKey;
  url.searchParams.set("token", apiKey);
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (!html && bodyKeys.has(key)) body[key] = value;
    else url.searchParams.set(key, String(value));
  }
  if (html) url.searchParams.set("html", "true");
  if (actionName === "scrape_markdown") url.searchParams.set("markdown", "true");
  if (actionName === "scrape_json") body.agent = "general";
  if (actionName === "scrape_listing") {
    body.agent = "listing";
    url.searchParams.set("super", "true");
  }
  if (actionName === "scrape_sitemap") body.agent = "map";
  return runProviderRequest(
    { label: "MrScraper", signal: context.signal, timeoutMs: ((optionalNumber(values.timeout) ?? 300) + 10) * 1000 },
    async (signal) =>
      readResponse(
        await context.fetcher(url, {
          method: html ? "GET" : "POST",
          headers: {
            "x-api-token": apiKey,
            "content-type": "application/json",
            accept: html ? "text/html" : "application/json",
          },
          body: html ? undefined : JSON.stringify(body),
          signal,
        }),
        html,
      ),
  );
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "mrscraper",
  Object.fromEntries(
    mrscraperActions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await runProviderRequest({ label: "MrScraper", signal }, async (signal) =>
      readResponse(
        await fetcher("https://api.app.mrscraper.com/api/v1/subscription-accounts", {
          headers: { "x-api-token": input.apiKey, accept: "application/json" },
          signal,
        }),
      ),
    );
    const data = requiredResponseRecord(payload.data, "MrScraper subscription account");
    const user = optionalRecord(data.user);
    return {
      profile: { displayName: optionalString(user?.name) || "MrScraper API Token" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "mrscraper",
  baseUrl: baseUrl,
  auth: { type: "api_key_query", name: "token" },
  async customizeRequest({ headers: proxyHeaders, context, service }) {
    const c = await requireApiKeyCredential(context, service);
    proxyHeaders.set("x-api-token", c.apiKey);
  },
});
