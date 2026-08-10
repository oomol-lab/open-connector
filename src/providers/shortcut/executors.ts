import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { shortcutActionHandlers, validateShortcutCredential } from "./runtime.ts";

const service = "shortcut";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, shortcutActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }): ReturnType<typeof validateShortcutCredential> {
    return validateShortcutCredential(input, fetcher);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.app.shortcut.com/api/v3/",
  auth: { type: "api_key_header", name: "shortcut-token" },
});
