import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { executeSaucelabsAction, resolveSaucelabsCredential, validateSaucelabsCredential } from "./runtime.ts";

interface SaucelabsContext {
  credential: ReturnType<typeof resolveSaucelabsCredential>;
  fetcher: typeof fetch;
}

const handlers: ProviderActionHandlers<
  "saucelabs",
  (input: Record<string, unknown>, context: SaucelabsContext) => Promise<unknown>
> = {
  list_jobs: (input, context) => executeSaucelabsAction({ actionName: "list_jobs", input, ...context }),
  get_job: (input, context) => executeSaucelabsAction({ actionName: "get_job", input, ...context }),
  update_job: (input, context) => executeSaucelabsAction({ actionName: "update_job", input, ...context }),
  list_job_assets: (input, context) => executeSaucelabsAction({ actionName: "list_job_assets", input, ...context }),
  list_builds: (input, context) => executeSaucelabsAction({ actionName: "list_builds", input, ...context }),
  get_build: (input, context) => executeSaucelabsAction({ actionName: "get_build", input, ...context }),
  list_build_jobs: (input, context) => executeSaucelabsAction({ actionName: "list_build_jobs", input, ...context }),
};

export const executors: ProviderExecutors = defineProviderExecutors({
  service: "saucelabs",
  handlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<SaucelabsContext> {
    const credential = await requireApiKeyCredential(context, "saucelabs");
    return { credential: resolveSaucelabsCredential({ apiKey: credential.apiKey, ...credential.values }), fetcher };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "saucelabs",
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, "saucelabs");
    return resolveSaucelabsCredential({ apiKey: credential.apiKey, ...credential.values }).apiBaseUrl;
  },
  auth: { type: "none" },
  customizeRequest({ headers, credential }) {
    if (credential?.authType !== "api_key") return;
    const resolved = resolveSaucelabsCredential({ apiKey: credential.apiKey, ...credential.values });
    headers.set("authorization", `Basic ${Buffer.from(`${resolved.username}:${resolved.apiKey}`).toString("base64")}`);
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("user-agent")) headers.set("user-agent", providerUserAgent);
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateSaucelabsCredential({ apiKey: input.apiKey, ...input.values }, fetcher).then((result) => ({
      profile: { accountId: result.providerAccountId, displayName: result.accountLabel },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    }));
  },
};
