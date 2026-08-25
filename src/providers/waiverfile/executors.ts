import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "waiverfile";
const apiBaseUrl = "https://api.waiverfile.com/api/v1";

interface Context {
  apiKey: string;
  siteId: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
interface Spec {
  path: string;
  query(input: Record<string, unknown>): Record<string, string | undefined>;
}

const specs: Record<string, Spec> = {
  get_site_details: { path: "/GetSiteDetails", query: () => ({}) },
  list_waiver_forms: { path: "/GetActiveWaiverForms", query: () => ({}) },
  get_waiver: { path: "/GetWaiver", query: (input) => ({ waiverID: optionalString(input.waiverId) }) },
  search_waivers: { path: "/SearchWaivers", query: (input) => ({ terms: optionalString(input.terms) }) },
  list_waivers_by_reference: {
    path: "/GetWaiversByReferenceID",
    query: (input) => ({
      refID1: optionalString(input.referenceId1),
      refID2: optionalString(input.referenceId2),
      refID3: optionalString(input.referenceId3),
      refIDAny: optionalString(input.referenceIdAny),
    }),
  },
  list_upcoming_events: {
    path: "/GetUpcomingEvents",
    query: (input) => ({ startDateUTC: optionalString(input.startDate), endDateUTC: optionalString(input.endDate) }),
  },
};

const handlers = Object.fromEntries(
  Object.keys(specs).map((name) => [
    name,
    async (input: Record<string, unknown>, context: Context) => ({
      data: await request(name, input, context, "execute"),
    }),
  ]),
);

export const executors: ProviderExecutors = defineProviderExecutors<Context>({
  service,
  handlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher): Promise<Context> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      siteId: readSiteId(credential.values.siteId ?? credential.metadata.siteId),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, context) {
    const siteId = readSiteId(input.values.siteId);
    const data = await request(
      "get_site_details",
      {},
      { apiKey: input.apiKey, siteId, fetcher: context.fetcher, signal: context.signal },
      "validate",
    );
    const record = optionalRecord(data);
    const displayName = optionalString(record?.SiteName) ?? optionalString(record?.siteName) ?? "WaiverFile Site";
    return { profile: { accountId: siteId, displayName }, grantedScopes: [], metadata: { apiBaseUrl, siteId } };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_query", name: "apiKey" },
  customizeRequest({ url, credential, headers }) {
    if (credential?.authType == "api_key")
      url.searchParams.set("siteID", readSiteId(credential.values.siteId ?? credential.metadata.siteId));
    headers.set("accept", "application/json");
  },
  skipDnsValidation: true,
});

async function request(
  actionName: string,
  input: Record<string, unknown>,
  context: Context,
  phase: "validate" | "execute",
): Promise<unknown> {
  const spec = specs[actionName];
  if (!spec) throw new ProviderRequestError(400, `unknown WaiverFile action: ${actionName}`);
  const url = new URL(`${apiBaseUrl}${spec.path}`);
  url.searchParams.set("apiKey", context.apiKey);
  url.searchParams.set("siteID", context.siteId);
  for (const [name, value] of Object.entries(spec.query(input))) if (value != null) url.searchParams.set(name, value);
  const response = await context.fetcher(url, {
    headers: { accept: "application/json", "user-agent": providerUserAgent },
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text.trim()) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      if (response.ok) throw new ProviderRequestError(502, "WaiverFile returned invalid JSON");
    }
  }
  if (!response.ok) {
    const message =
      optionalString(optionalRecord(payload)?.message) ??
      (text.trim() || `WaiverFile request failed with HTTP ${response.status}`);
    if (phase == "validate" && 400 <= response.status && response.status < 500)
      throw new ProviderRequestError(400, message, payload);
    throw new ProviderRequestError(response.status, message, payload);
  }
  return payload;
}

function readSiteId(value: unknown): string {
  return requiredString(value, "siteId", (message) => new ProviderRequestError(400, message));
}
