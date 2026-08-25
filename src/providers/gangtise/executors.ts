import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  defineProviderExecutors,
  defineProviderProxy,
  mapProviderActionHandlers,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { gangtiseActions } from "./actions.ts";
import {
  createGangtiseSession,
  executeGangtiseAction,
  gangtiseApiBaseUrl,
  validateGangtiseCredential,
} from "./runtime.ts";

const service = "gangtise";
type GangtiseContext = {
  apiKey: string;
  values: Record<string, string>;
  fetcher: typeof fetch;
};

type GangtiseHandler = (input: Record<string, unknown>, context: GangtiseContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"gangtise", GangtiseHandler> = mapProviderActionHandlers(
  service,
  gangtiseActions,
  (_action, name) => (input, context) =>
    executeGangtiseAction({ apiKey: context.apiKey, values: context.values, actionName: name, input }, context.fetcher),
);

export const executors: ProviderExecutors = defineProviderExecutors<GangtiseContext>({
  service,
  handlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher): Promise<GangtiseContext> {
    const credential = await requireApiKeyCredential(context, service);
    return { apiKey: credential.apiKey, values: credential.values, fetcher };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateGangtiseCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
    return {
      profile: { displayName: result.accountLabel },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: gangtiseApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, fetcher, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    const session = await createGangtiseSession(
      { apiKey: credential.apiKey, values: credential.values },
      fetcher,
      "execute",
    );
    headers.set("authorization", session.authorization);
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("user-agent")) headers.set("user-agent", providerUserAgent);
  },
});
