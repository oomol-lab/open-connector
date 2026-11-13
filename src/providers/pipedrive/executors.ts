import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";
import type { IntegrationDefinition } from "../../triggers/common/integration.ts";

import { defineProviderProxy } from "../provider-proxy.ts";
import {
  executors,
  pipedrivePath,
  requirePipedriveAccess,
  validatePipedriveCredential,
  validatePipedriveOAuthCredential,
} from "./runtime.ts";
import { pipedriveCrmEvent } from "./trigger-on-crm-event.ts";

export { executors };

const service = "pipedrive";

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validatePipedriveCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
  oauth2(input, { fetcher }) {
    return validatePipedriveOAuthCredential(input, fetcher);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    return (await requirePipedriveAccess(context)).origin;
  },
  auth: { type: "none" },
  sensitiveHeaders: ["x-api-token"],
  async customizeRequest({ context, headers, url }) {
    const access = await requirePipedriveAccess(context);
    url.pathname = pipedrivePath(access.origin, url.pathname);
    // The connection's credential decides the auth header; a caller-supplied API token must not ride along.
    headers.delete("x-api-token");
    for (const [name, value] of Object.entries(access.authHeaders)) {
      headers.set(name, value);
    }
  },
});

export const triggers: readonly IntegrationDefinition[] = [pipedriveCrmEvent];
