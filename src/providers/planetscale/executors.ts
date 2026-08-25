import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { executePlanetScaleAction, planetScaleApiBaseUrl, validatePlanetScaleCredential } from "./runtime.ts";

const service = "planetscale";
interface Context {
  apiKey: string;
  serviceTokenId: string;
  fetcher: typeof fetch;
}

const actionNames = [
  "list_organizations",
  "get_organization",
  "list_databases",
  "get_database",
  "create_database",
  "delete_database",
  "list_branches",
  "get_branch",
  "create_branch",
  "delete_branch",
];
const handlers = Object.fromEntries(
  actionNames.map((name) => [
    name,
    (input: Record<string, unknown>, context: Context) =>
      executePlanetScaleAction(
        name,
        input,
        { apiKey: context.apiKey, serviceTokenId: context.serviceTokenId },
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
    const serviceTokenId = String(credential.values.serviceTokenId ?? credential.metadata.serviceTokenId ?? "").trim();
    if (!serviceTokenId) throw new ProviderRequestError(400, "serviceTokenId is required");
    return { apiKey: credential.apiKey, serviceTokenId, fetcher };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, context) {
    const result = await validatePlanetScaleCredential(
      { apiKey: input.apiKey, serviceTokenId: String(input.values.serviceTokenId ?? "") },
      context.fetcher,
    );
    return {
      profile: { accountId: result.providerAccountId ?? "planetscale", displayName: result.accountLabel },
      grantedScopes: [],
      metadata: result.providerMetadata,
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: planetScaleApiBaseUrl,
  auth: { type: "api_key_header", name: "authorization" },
  customizeRequest({ headers, credential }) {
    if (credential?.authType != "api_key")
      throw new ProviderRequestError(401, "Configure PlanetScale credentials first.");
    const tokenId = String(credential.values.serviceTokenId ?? credential.metadata.serviceTokenId ?? "").trim();
    if (!tokenId) throw new ProviderRequestError(400, "serviceTokenId is required");
    headers.set("authorization", `${tokenId}:${credential.apiKey}`);
    headers.set("accept", "application/json");
  },
  skipDnsValidation: true,
});
