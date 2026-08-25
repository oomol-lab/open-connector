import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { executePinpointAction, normalizePinpointApiBaseUrl, validatePinpointCredential } from "./runtime.ts";

const service = "pinpoint";
interface Context {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
}
const actionNames = [
  "list_jobs",
  "get_job",
  "list_candidates",
  "get_candidate",
  "list_applications",
  "get_application",
];
const handlers = Object.fromEntries(
  actionNames.map((name) => [
    name,
    (input: Record<string, unknown>, context: Context) =>
      executePinpointAction(
        { apiKey: context.apiKey, actionName: name, input, providerMetadata: { apiBaseUrl: context.apiBaseUrl } },
        context.fetcher,
      ),
  ]),
);

export const executors: ProviderExecutors = defineProviderExecutors<Context>({
  service,
  handlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher): Promise<Context> {
    const credential = await requireApiKeyCredential(context, service);
    const subdomain = credential.values.subdomain ?? credential.metadata.subdomain;
    return { apiKey: credential.apiKey, apiBaseUrl: normalizePinpointApiBaseUrl(subdomain), fetcher };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, context) {
    const result = await validatePinpointCredential(
      { apiKey: input.apiKey, subdomain: String(input.values.subdomain ?? "") },
      context.fetcher,
    );
    return {
      profile: { accountId: result.providerAccountId ?? "pinpoint", displayName: result.accountLabel },
      grantedScopes: [],
      metadata: result.providerMetadata,
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return normalizePinpointApiBaseUrl(credential.values.subdomain ?? credential.metadata.subdomain);
  },
  auth: { type: "api_key_header", name: "X-API-KEY" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/vnd.api+json");
  },
  skipDnsValidation: true,
});
