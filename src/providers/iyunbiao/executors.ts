import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, requireCustomCredential } from "../provider-executors.ts";
import { iyunbiaoActions } from "./actions.ts";
import { executeIyunbiaoAction, loginIyunbiao } from "./runtime.ts";

const service = "iyunbiao";

interface IyunbiaoContext {
  values: Record<string, string>;
  fetcher: typeof fetch;
  transitFiles?: ExecutionContext["transitFiles"];
  signal?: AbortSignal;
}

const handlers = Object.fromEntries(
  iyunbiaoActions.map((action) => [
    action.name,
    (input: Record<string, unknown>, context: IyunbiaoContext) =>
      executeIyunbiaoAction(action.name, input, context.values, context),
  ]),
);

export const executors: ProviderExecutors = defineProviderExecutors<IyunbiaoContext>({
  service,
  handlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<IyunbiaoContext> {
    const credential = await requireCustomCredential(context, service);
    return { values: credential.values, fetcher, transitFiles: context.transitFiles, signal: context.signal };
  },
  fallbackMessage: "Yunbiao request failed",
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const { session, profile } = await loginIyunbiao(input.values, fetcher, signal);
    return {
      profile: {
        accountId: `${session.credentials.baseUrl}:${session.credentials.account}`,
        displayName: optionalString(profile.user) ?? session.credentials.account,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: session.credentials.baseUrl,
        serverVersion: optionalString(profile.serverVersion),
      },
    };
  },
};
