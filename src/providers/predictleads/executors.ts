import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";

import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "predictleads";
const baseUrl = "https://predictleads.com/api/v3";

interface PredictLeadsContext {
  apiKey: string;
  apiToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

const suffixByAction: Record<string, string> = {
  lookup_company: "",
  list_job_openings: "/job_openings",
  list_news_events: "/news_events",
  list_technology_detections: "/technology_detections",
  list_financing_events: "/financing_events",
};

const handlers: ProviderActionHandlers<
  "predictleads",
  (input: Record<string, unknown>, context: PredictLeadsContext) => Promise<unknown>
> = {
  lookup_company: (input, context) => requestCompany("lookup_company", input, context),
  list_job_openings: (input, context) => requestCompany("list_job_openings", input, context),
  list_news_events: (input, context) => requestCompany("list_news_events", input, context),
  list_technology_detections: (input, context) => requestCompany("list_technology_detections", input, context),
  list_financing_events: (input, context) => requestCompany("list_financing_events", input, context),
};

export const executors: ProviderExecutors = defineProviderExecutors<PredictLeadsContext>({
  service,
  handlers,
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiToken: requiredString(credential.values.apiToken, "apiToken", providerInputError),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "api_key_header", name: "X-Api-Key" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await context.getCredential(service);
    if (!credential || credential.authType != "api_key")
      throw providerInputError("predictleads api_key credential is required");
    headers.set("X-Api-Token", requiredString(credential.values.apiToken, "apiToken", providerInputError));
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestPredictLeads(
      "/technologies",
      input.apiKey,
      requiredString(input.values.apiToken, "apiToken", providerInputError),
      fetcher,
      signal,
      { limit: 1 },
    );
    return {
      profile: { displayName: "PredictLeads API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/technologies" },
    };
  },
};

async function requestCompany(
  actionName: string,
  input: Record<string, unknown>,
  context: PredictLeadsContext,
): Promise<unknown> {
  const domain = encodeURIComponent(requiredInputString(input.domain, "domain"));
  const suffix = suffixByAction[actionName] ?? "";
  const query =
    actionName == "lookup_company"
      ? undefined
      : { page: optionalInteger(input.page), limit: optionalInteger(input.limit) };
  return requestPredictLeads(
    `/companies/${domain}${suffix}`,
    context.apiKey,
    context.apiToken,
    context.fetcher,
    context.signal,
    query,
  );
}

async function requestPredictLeads(
  path: string,
  apiKey: string,
  apiToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
  query?: Record<string, number | undefined>,
): Promise<unknown> {
  return runProviderRequest({ label: "PredictLeads", signal }, async (requestSignal) => {
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {}))
      if (value !== undefined) url.searchParams.set(key, String(value));
    const response = await fetcher(url, {
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "X-Api-Key": apiKey,
        "X-Api-Token": apiToken,
      },
      signal: requestSignal,
    });
    const payload = await readPayload(response);
    if (!response.ok) throw createError(response.status, payload);
    if (!optionalRecord(payload)) throw new ProviderRequestError(502, "PredictLeads response must be an object");
    return payload;
  });
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) return null;
    throw new ProviderRequestError(502, "PredictLeads returned invalid JSON");
  }
}

function createError(status: number, payload: unknown): ProviderRequestError {
  const record = optionalRecord(payload);
  const firstError = Array.isArray(record?.errors) ? optionalRecord(record.errors[0]) : undefined;
  const message =
    optionalString(firstError?.detail) ??
    optionalString(firstError?.title) ??
    optionalString(record?.message) ??
    `PredictLeads request failed with status ${status}`;
  return new ProviderRequestError(status, message);
}
