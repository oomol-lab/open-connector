import type { ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { OAuthProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { defineOAuthProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { futunnActions } from "./actions.ts";
import { executeFutunnAction } from "./runtime.ts";
import { futunnApiBaseUrl } from "./transport.ts";

const service = "futunn";

function createHandler(actionName: string): ProviderRuntimeHandler<OAuthProviderContext> {
  return (input, context) =>
    executeFutunnAction(
      {
        actionName,
        input,
        accessToken: context.accessToken,
        signal: context.signal,
      },
      context.fetcher,
    );
}

const handlers = Object.fromEntries(futunnActions.map((action) => [action.name, createHandler(action.name)]));

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, handlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: futunnApiBaseUrl,
  auth: { type: "oauth_bearer" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});
