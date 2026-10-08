import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { AsyncLocalStorage } from "node:async_hooks";
import { defineProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  createFxmacrodataContext,
  fxmacrodataActionHandlers,
  fxmacrodataApiBaseUrl,
  readFxmacrodataError,
  validateFxmacrodataCredential,
} from "./runtime.ts";

const service = "fxmacrodata";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: fxmacrodataActionHandlers,
  createContext: createFxmacrodataContext,
  skipDnsValidation: true,
});

/**
 * Holds, per proxied request, the key the runtime attached, so the error reader can
 * remove it from upstream error text without a second credential lookup.
 */
const proxyRequestKey = new AsyncLocalStorage<{ apiKey?: string }>();

const keyedProxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: fxmacrodataApiBaseUrl,
  auth: { type: "optional_api_key_header", name: "X-API-Key" },
  customizeRequest({ credential }) {
    const request = proxyRequestKey.getStore();
    if (request && credential?.authType === "api_key") {
      request.apiKey = credential.apiKey;
    }
  },
  readError: (response) => readFxmacrodataError(response, proxyRequestKey.getStore()?.apiKey),
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = (input, context) =>
  proxyRequestKey.run({}, () => keyedProxy(input, context));

export const credentialValidators: CredentialValidators = {
  apiKey: validateFxmacrodataCredential,
};
