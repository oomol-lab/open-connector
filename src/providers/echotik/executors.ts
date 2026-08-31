import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireCustomCredential,
} from "../provider-runtime.ts";
import {
  createEchoTikProviderAccountId,
  echotikActionHandlers,
  echotikApiBaseUrl,
  requestEchoTikCredentialValidation,
} from "./runtime.ts";

const service = "echotik";

export interface EchoTikContext {
  username: string;
  password: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const executors: ProviderExecutors = defineProviderExecutors<EchoTikContext>({
  service,
  handlers: echotikActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher): Promise<EchoTikContext> {
    const credential = await requireCustomCredential(context, service);
    return {
      username: requiredCredential(credential.values.username, "username"),
      password: requiredCredential(credential.values.password, "password"),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    const username = requiredCredential(input.values.username, "username");
    await requestEchoTikCredentialValidation({
      username,
      password: requiredCredential(input.values.password, "password"),
      fetcher,
      signal,
    });
    return {
      profile: {
        accountId: createEchoTikProviderAccountId(username),
        displayName: "EchoTik API Credential",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: echotikApiBaseUrl,
        validationEndpoint: "/echotik/category/l1?language=en-US",
      },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: echotikApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await requireCustomCredential(context, service);
    const username = requiredCredential(credential.values.username, "username");
    const password = requiredCredential(credential.values.password, "password");
    headers.set("authorization", `Basic ${btoa(`${username}:${password}`)}`);
  },
});

function requiredCredential(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}
