import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  basicAuthorizationHeader,
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { executeHelpdeskAction, helpdeskApiBaseUrl, validateHelpdeskCredential } from "./runtime.ts";

const service = "helpdesk";

interface ProviderContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

type Handler = (input: Record<string, unknown>, context: ProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"helpdesk", Handler> = {
  list_tickets(input, context) {
    return executeHelpdeskAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_tickets",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  get_ticket(input, context) {
    return executeHelpdeskAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_ticket",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  create_ticket(input, context) {
    return executeHelpdeskAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "create_ticket",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  update_ticket(input, context) {
    return executeHelpdeskAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "update_ticket",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  delete_ticket(input, context) {
    return executeHelpdeskAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "delete_ticket",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  move_ticket_to_silo(input, context) {
    return executeHelpdeskAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "move_ticket_to_silo",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  list_agents(input, context) {
    return executeHelpdeskAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_agents",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  list_teams(input, context) {
    return executeHelpdeskAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_teams",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
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
  baseUrl: helpdeskApiBaseUrl,
  auth: { type: "api_key_header", name: "x-connector-api-key" },
  skipDnsValidation: true,
  customizeRequest({ credential, headers }) {
    if (credential?.authType !== "api_key" || !credential.values.accountId) {
      throw new ProviderRequestError(401, "Configure HelpDesk account ID and API key credentials first.");
    }
    headers.delete("x-connector-api-key");
    headers.set("authorization", basicAuthorizationHeader(`${credential.values.accountId}:${credential.apiKey}`));
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateHelpdeskCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
    return {
      profile: {
        displayName: result.accountLabel,
      },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};
