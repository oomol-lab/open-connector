import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { CloudflareEmailRoutingContext } from "./runtime.ts";

import { createProviderFetch, defineProviderExecutors, requireCustomCredential } from "../provider-runtime.ts";
import { cloudflareEmailRoutingActionHandlers, validateCloudflareEmailRoutingCredential } from "./runtime.ts";

const service = "cloudflare_email_routing";

export const executors: ProviderExecutors = defineProviderExecutors<CloudflareEmailRoutingContext>({
  service,
  handlers: cloudflareEmailRoutingActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<CloudflareEmailRoutingContext> {
    const credential = await requireCustomCredential(context, service);
    return {
      email: credential.values.email,
      apiKey: credential.values.apiKey ?? "",
      accountId: credential.values.accountId ?? "",
      zoneId: credential.values.zoneId ?? "",
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateCloudflareEmailRoutingCredential(
      input.values,
      createProviderFetch({ fetch: fetcher, skipDnsValidation: true }),
      signal,
    );
  },
};
