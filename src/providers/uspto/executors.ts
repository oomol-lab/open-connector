import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

async function get(
  path: string,
  accept: string,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<string | null> {
  const response = await fetcher(new URL(path, "https://tsdrapi.uspto.gov"), {
    headers: { accept, "USPTO-API-KEY": apiKey, "user-agent": providerUserAgent },
    redirect: "error",
    signal,
  });
  const text = await response.text();
  if (!response.ok)
    throw new ProviderRequestError(response.status, text || `USPTO request failed with status ${response.status}`);
  return response.status === 204 ? null : text;
}
const handlers: ProviderActionHandlers<"uspto", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async get_trademark_case_status(input, context) {
    const xml = await get(
      `/ts/cd/casestatus/sn${input.serialNumber}/info.xml`,
      "application/xml",
      context.apiKey,
      context.fetcher,
      context.signal,
    );
    return xml === null ? null : { xml };
  },
  async get_trademark_documents_metadata(input, context) {
    const query = new URLSearchParams({ sn: String(input.serialNumber) });
    if (input.fromDate) query.set("fromDate", String(input.fromDate));
    if (input.toDate) query.set("toDate", String(input.toDate));
    if (input.sort) query.set("sort", `date:${input.sort === "asc" ? "A" : "D"}`);
    const xml = await get(
      `/ts/cd/casedocs/bundle.xml?${query}`,
      "application/xml",
      context.apiKey,
      context.fetcher,
      context.signal,
    );
    return xml === null ? null : { xml };
  },
  async get_trademark_case_last_update(input, context) {
    const text = await get(
      `/last-update/info.json?sn=${input.serialNumber}`,
      "application/json",
      context.apiKey,
      context.fetcher,
      context.signal,
    );
    if (text === null) return null;
    const payload = JSON.parse(text) as { caseUpdateInfo?: Record<string, unknown>[] };
    const update = payload.caseUpdateInfo?.[0];
    return {
      serialNumber: update?.serialNumber ?? String(input.serialNumber),
      lastModifiedDate: null,
      statusLastModifiedDate: null,
      prosecutionLastModifiedDate: null,
      documentsLastModifiedDate: null,
      raw: update ?? {},
    };
  },
};

export const executors: import("../../core/types.ts").ProviderExecutors = defineApiKeyProviderExecutors(
  "uspto",
  handlers,
  { skipDnsValidation: true },
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "uspto",
  baseUrl: "https://tsdrapi.uspto.gov",
  auth: { type: "api_key_header", name: "USPTO-API-KEY" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("user-agent", providerUserAgent);
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const validationEndpoint = "/ts/cd/casestatus/sn78787878/info.xml";
    await get(validationEndpoint, "application/xml", input.apiKey, fetcher, signal);
    return {
      profile: { accountId: "api_key", displayName: "USPTO API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: "https://tsdrapi.uspto.gov", validationEndpoint },
    };
  },
};
