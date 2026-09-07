import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireCustomCredential,
} from "../provider-runtime.ts";
const service = "unpaywall";
const baseUrl = "https://api.unpaywall.org/v2";
interface Context {
  email: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}
const handlers = {
  async get_doi(input: Record<string, unknown>, context: Context) {
    const doi = required(input.doi, "doi").replace(/^https?:\/\/doi\.org\//i, "");
    return { record: await request(`/${encodeURIComponent(doi)}`, {}, context) };
  },
  async search_articles(input: Record<string, unknown>, context: Context) {
    const page = typeof input.page === "number" ? input.page : 1;
    const payload = await request(
      "/search",
      {
        query: required(input.query, "query"),
        page: String(page),
        is_oa: typeof input.isOa === "boolean" ? String(input.isOa) : undefined,
      },
      context,
    );
    const record = object(payload);
    if (!Array.isArray(record.results) || typeof record.elapsed_seconds !== "number")
      throw new ProviderRequestError(502, "Unpaywall search response is invalid");
    return { page, elapsedSeconds: record.elapsed_seconds, results: record.results };
  },
};
export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers,
  createContext: async (execution, fetcher) => {
    const credential = await execution.getCredential(service);
    const email = credential?.authType === "custom_credential" ? required(credential.values.email, "email") : "";
    if (!email.includes("@")) throw new ProviderRequestError(400, "email must be a valid email address");
    return { email, fetcher, signal: execution.signal };
  },
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, url, headers }) {
    const credential = await requireCustomCredential(context, service);
    url.searchParams.set("email", required(credential.values.email, "email"));
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});
export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    const email = required(input.values.email, "email");
    if (!email.includes("@")) throw new ProviderRequestError(400, "email must be a valid email address");
    await request("/10.1038%2Fnature12373", {}, { email, fetcher, signal });
    return { profile: { accountId: email, displayName: email }, grantedScopes: [], metadata: { apiBaseUrl: baseUrl } };
  },
};
async function request(path: string, query: Record<string, string | undefined>, context: Context): Promise<unknown> {
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set("email", context.email);
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, value);
  const response = await context.fetcher(url, {
    headers: { accept: "application/json", "user-agent": providerUserAgent },
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
  if (!response.ok)
    throw new ProviderRequestError(
      response.status === 429 ? 429 : response.status < 500 ? 400 : 502,
      typeof payload === "string" ? payload : "Unpaywall request failed",
      payload,
    );
  return payload;
}
function required(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ProviderRequestError(400, `${name} is required`);
  return value.trim();
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ProviderRequestError(502, "Unpaywall response must be an object");
  return value as Record<string, unknown>;
}
