import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";

import { defineProviderExecutors, mapProviderActionNames, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { requiredInputString } from "../provider-runtime.ts";
import { coupontoolsActions } from "./actions.ts";
import { coupontoolsApiBaseUrl, executeCoupontoolsAction, validateCoupontoolsCredential } from "./runtime.ts";

const service = "coupontools";

interface CoupontoolsContext {
  apiKey: string;
  clientSecret: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type CoupontoolsHandler = (input: Record<string, unknown>, context: CoupontoolsContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"coupontools", CoupontoolsHandler> = mapProviderActionNames(
  service,
  coupontoolsActions.map((action) => action.name),
  (actionName) => (input, context) =>
    executeCoupontoolsAction(
      {
        apiKey: context.apiKey,
        actionName,
        input,
        values: { apiKey: context.apiKey, clientSecret: context.clientSecret },
      },
      context.fetcher,
    ),
);

export const executors: ProviderExecutors = defineProviderExecutors<CoupontoolsContext>({
  service,
  handlers,
  skipDnsValidation: true,
  async createContext(context, fetcher): Promise<CoupontoolsContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      clientSecret: requiredInputString(credential.values.clientSecret, "clientSecret"),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: coupontoolsApiBaseUrl,
  auth: {
    type: "credential_headers",
    headers: [
      { name: "x-client-id", source: { type: "api_key" } },
      { name: "x-client-secret", source: { type: "credential_value", name: "clientSecret" } },
    ],
  },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateCoupontoolsCredential(
      { clientId: input.apiKey, clientSecret: requiredInputString(input.values.clientSecret, "clientSecret") },
      fetcher,
      signal,
    );
  },
};
