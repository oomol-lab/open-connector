import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { JumpsellerActionContext } from "./runtime.ts";

import { Buffer } from "node:buffer";
import { compactObject, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerInputError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { jumpsellerActionHandlers, jumpsellerApiBaseUrl, validateJumpsellerCredential } from "./runtime.ts";

const service = "jumpseller";

export const executors: ProviderExecutors = defineProviderExecutors<JumpsellerActionContext>({
  service,
  handlers: jumpsellerActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<JumpsellerActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      credential: {
        login: requiredString(credential.values.login, "login", providerInputError),
        authtoken: credential.apiKey,
      },
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: jumpsellerApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    const login = requiredString(credential.values.login, "login", providerInputError);
    headers.set("authorization", `Basic ${Buffer.from(`${login}:${credential.apiKey}`, "utf8").toString("base64")}`);
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const login = requiredString(input.values.login, "login", providerInputError);
    const store = await validateJumpsellerCredential(input.apiKey, login, fetcher, signal);
    return {
      profile: {
        accountId: store.storeCode ?? login,
        displayName: store.storeName ?? store.storeUrl ?? "Jumpseller Store",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: jumpsellerApiBaseUrl,
        validationEndpoint: "/store/info.json",
        login,
        storeCode: store.storeCode,
        storeUrl: store.storeUrl,
        storeEmail: store.storeEmail,
      }),
    };
  },
};
