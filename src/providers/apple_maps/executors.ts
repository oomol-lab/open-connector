import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineProviderExecutors, mapProviderActionNames, requireCustomCredential } from "../provider-executors.ts";
import { defineProviderProxy, providerProxyEndpointPrefixes } from "../provider-proxy.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { appleMapsActions } from "./actions.ts";
import { acquireAppleMapsAccessToken, readAppleMapsCredential } from "./auth.ts";
import { appleMapsApiOrigin } from "./client.ts";
import { executeAppleMapsAction, validateAppleMapsCredential } from "./runtime.ts";

const service = "apple_maps";

const handlers = mapProviderActionNames(
  service,
  appleMapsActions.map((action) => action.name),
  (actionName) => async (input: Record<string, unknown>, context: AppleMapsContext) =>
    executeAppleMapsAction(actionName, input, context),
);

interface AppleMapsContext {
  credential: ReturnType<typeof readAppleMapsCredential>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const executors: ProviderExecutors = defineProviderExecutors<AppleMapsContext>({
  service,
  handlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireCustomCredential(context, service);
    return { credential: readAppleMapsCredential(credential.values), fetcher, signal: context.signal };
  },
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, context) {
    return validateAppleMapsCredential(input.values, context.fetcher);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: appleMapsApiOrigin,
  auth: { type: "none" },
  skipDnsValidation: true,
  allowedEndpoint: providerProxyEndpointPrefixes(
    "/v1/geocode",
    "/v1/reverseGeocode",
    "/v1/search",
    "/v1/searchAutocomplete",
    "/v1/directions",
    "/v1/etas",
    "/v1/place",
  ),
  async customizeRequest({ context, headers, method, fetcher }) {
    if (method.toUpperCase() !== "GET")
      throw new ProviderRequestError(400, "Apple Maps proxy only supports GET requests");
    const stored = await requireCustomCredential(context, service);
    const { accessToken } = await acquireAppleMapsAccessToken(readAppleMapsCredential(stored.values), fetcher);
    headers.set("authorization", `Bearer ${accessToken}`);
  },
});
