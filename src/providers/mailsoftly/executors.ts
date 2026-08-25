import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { executeMailsoftlyAction, mailsoftlyApiBaseUrl, validateMailsoftlyCredential } from "./runtime.ts";

const service = "mailsoftly";

interface ProviderContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

type Handler = (input: Record<string, unknown>, context: ProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"mailsoftly", Handler> = {
  get_contacts(input, context) {
    return executeMailsoftlyAction("get_contacts", input, context.apiKey, context.fetcher);
  },
  get_contact(input, context) {
    return executeMailsoftlyAction("get_contact", input, context.apiKey, context.fetcher);
  },
  create_contact(input, context) {
    return executeMailsoftlyAction("create_contact", input, context.apiKey, context.fetcher);
  },
  update_contact(input, context) {
    return executeMailsoftlyAction("update_contact", input, context.apiKey, context.fetcher);
  },
  search_contacts(input, context) {
    return executeMailsoftlyAction("search_contacts", input, context.apiKey, context.fetcher);
  },
  get_contact_lists(input, context) {
    return executeMailsoftlyAction("get_contact_lists", input, context.apiKey, context.fetcher);
  },
  get_contact_list(input, context) {
    return executeMailsoftlyAction("get_contact_list", input, context.apiKey, context.fetcher);
  },
  get_contact_list_contacts(input, context) {
    return executeMailsoftlyAction("get_contact_list_contacts", input, context.apiKey, context.fetcher);
  },
  create_contact_list(input, context) {
    return executeMailsoftlyAction("create_contact_list", input, context.apiKey, context.fetcher);
  },
  add_contact_to_contact_list(input, context) {
    return executeMailsoftlyAction("add_contact_to_contact_list", input, context.apiKey, context.fetcher);
  },
  add_contacts_to_contact_list(input, context) {
    return executeMailsoftlyAction("add_contacts_to_contact_list", input, context.apiKey, context.fetcher);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ProviderContext> {
    const credential = await requireApiKeyCredential(context, service);
    return { apiKey: credential.apiKey, values: credential.values, metadata: credential.metadata, fetcher };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: mailsoftlyApiBaseUrl,
  auth: { type: "api_key_header", name: "Authorization" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateMailsoftlyCredential({ apiKey: input.apiKey }, fetcher);
    return {
      profile: {
        displayName: result.accountLabel,
      },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};
