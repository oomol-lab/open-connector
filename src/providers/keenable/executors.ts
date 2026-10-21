import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  createKeenableContext,
  keenableActionHandlers,
  keenableApiBaseUrl,
  keenableAppTitle,
  validateKeenableCredential,
} from "./runtime.ts";

const service = "keenable";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: keenableActionHandlers,
  createContext: createKeenableContext,
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: keenableApiBaseUrl,
  auth: { type: "optional_api_key_header", name: "X-API-Key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("x-keenable-title")) headers.set("x-keenable-title", keenableAppTitle);
  },
});

export const credentialValidators: CredentialValidators = { apiKey: validateKeenableCredential };
