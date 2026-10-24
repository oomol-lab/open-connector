import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineProviderExecutors, requireApiKeyCredential, requireCustomCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { createProviderFetch } from "../provider-runtime.ts";
import { validateWecomBotCredential, wecomBotActionHandlers } from "./runtime.ts";
import {
  createWecomSmartBotRuntime,
  validateWecomSmartBotCredential,
  wecomSmartBotActionHandlers,
} from "./smart-runtime.ts";

const service = "wecom_bot";
const wecomBotApiBaseUrl = "https://qyapi.weixin.qq.com";

const webhookExecutors = defineProviderExecutors({
  service,
  handlers: wecomBotActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

const smartBotExecutors = defineProviderExecutors({
  service,
  handlers: wecomSmartBotActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireCustomCredential(context, service);
    return createWecomSmartBotRuntime(credential.values, fetcher, context.signal, context.transitFiles);
  },
});

export const executors: ProviderExecutors = {
  ...webhookExecutors,
  ...smartBotExecutors,
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: wecomBotApiBaseUrl,
  auth: { type: "api_key_query", name: "key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWecomBotCredential(
      input.apiKey,
      createProviderFetch({ fetch: fetcher, skipDnsValidation: true }),
      signal,
    );
  },
  customCredential(input, { fetcher }) {
    return validateWecomSmartBotCredential(
      input.values,
      createProviderFetch({ fetch: fetcher, skipDnsValidation: true }),
    );
  },
};
