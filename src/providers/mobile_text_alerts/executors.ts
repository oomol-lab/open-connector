import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-runtime.ts";
import { executors, mobileTextAlertsApiBaseUrl, validateMobileTextAlertsCredential } from "./runtime.ts";

export { executors };

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "mobile_text_alerts",
  baseUrl: mobileTextAlertsApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMobileTextAlertsCredential(input.apiKey, fetcher, signal);
  },
};
