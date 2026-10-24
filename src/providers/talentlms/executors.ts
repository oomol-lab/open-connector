import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ResolvedCredential,
} from "../../core/types.ts";
import type { TalentlmsActionContext } from "./runtime.ts";

import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  buildTalentlmsApiBaseUrl,
  normalizeTalentlmsApiBaseUrl,
  readTalentlmsDomain,
  talentlmsApiVersion,
  talentlmsActionHandlers,
  validateTalentlmsCredential,
} from "./runtime.ts";

const service = "talentlms";

export const executors: ProviderExecutors = defineProviderExecutors<TalentlmsActionContext>({
  service,
  handlers: talentlmsActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<TalentlmsActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    const metadataBaseUrl =
      typeof credential.metadata.apiBaseUrl === "string" ? credential.metadata.apiBaseUrl : undefined;

    return {
      apiKey: credential.apiKey,
      apiBaseUrl: metadataBaseUrl
        ? normalizeTalentlmsApiBaseUrl(metadataBaseUrl)
        : buildTalentlmsApiBaseUrl(readTalentlmsDomain({ domain: credential.values.domain })),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => resolveTalentlmsApiBaseUrl(await requireApiKeyCredential(context, service)),
  auth: { type: "api_key_header", name: "x-api-key" },
  customizeRequest({ headers }) {
    headers.set("x-api-version", talentlmsApiVersion);
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTalentlmsCredential(input, fetcher, signal);
  },
};

function resolveTalentlmsApiBaseUrl(credential: Extract<ResolvedCredential, { authType: "api_key" }>): string {
  const metadataBaseUrl =
    typeof credential.metadata.apiBaseUrl === "string" ? credential.metadata.apiBaseUrl : undefined;
  return metadataBaseUrl
    ? normalizeTalentlmsApiBaseUrl(metadataBaseUrl)
    : buildTalentlmsApiBaseUrl(readTalentlmsDomain({ domain: credential.values.domain }));
}
